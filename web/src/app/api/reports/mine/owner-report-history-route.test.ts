import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/cookie", () => ({ readSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/reports/owner-history-service", () => ({
  listOwnReports: vi.fn(),
}));

import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listOwnReports } from "@/lib/reports/owner-history-service";

import { GET } from "./route";

const user = {
  id: "64b64c6f2f4d9f1a2b3c4d51",
  email: "student@example.com",
  role: "student" as const,
  status: "active" as const,
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Student Name",
    preferredContactMethod: "in_app" as const,
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
};

const ownerReport = {
  id: "64b64c6f2f4d9f1a2b3c4d54",
  reporterId: user.id,
  reportType: "found" as const,
  title: "Black laptop bag",
  publicDescription: "Black laptop bag with a shoulder strap.",
  categoryId: "64b64c6f2f4d9f1a2b3c4d52",
  campusLocationId: "64b64c6f2f4d9f1a2b3c4d53",
  occurredAt: "2026-08-15T02:05:00.000Z",
  colors: ["Black"],
  tags: ["laptop", "bag"],
  photoUrls: ["/api/report-images/64b64c6f2f4d9f1a2b3c4d55"],
  status: "draft" as const,
  moderationStatus: "hidden" as const,
  privacySettings: {
    showPhoto: false,
    showEventDate: false,
    showCampusLocation: false,
  },
  resolvedAt: null,
  createdAt: "2026-08-15T02:05:00.000Z",
  updatedAt: "2026-08-15T02:05:00.000Z",
};

const page = {
  reports: [ownerReport],
  pagination: { page: 1, pageSize: 10 as const, total: 1, totalPages: 1 },
};

function request(query = "") {
  return new Request(`http://localhost/api/reports/mine${query}`);
}

async function expectAuthenticationRequired(response: Response) {
  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual({
    error: {
      code: "AUTHENTICATION_REQUIRED",
      message: "Authentication required",
    },
  });
}

async function expectBrowseFailure(response: Response, secret: string) {
  expect(response.status).toBe(500);
  const text = await response.text();
  expect(JSON.parse(text)).toEqual({
    error: {
      code: "REPORT_BROWSE_FAILED",
      message: "Unable to load reports",
    },
  });
  expect(text).not.toContain(secret);
}

describe("owner report history route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readSessionCookie).mockResolvedValue("raw-session-token");
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(listOwnReports).mockResolvedValue(page);
  });

  it("returns every safe owner field including draft and hidden state", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(page);
    expect(listOwnReports).toHaveBeenCalledWith(user, { page: 1 });
  });

  it("passes only transformed approved filters", async () => {
    await GET(request("?reportType=found&status=draft&page=3"));

    expect(listOwnReports).toHaveBeenCalledWith(user, {
      reportType: "found",
      status: "draft",
      page: 3,
    });
  });

  it.each(["student", "staff", "administrator"] as const)(
    "uses the authenticated active %s identity",
    async (role) => {
      const roleUser = { ...user, role };
      vi.mocked(getCurrentUser).mockResolvedValue(roleUser);

      await GET(request());

      expect(listOwnReports).toHaveBeenCalledWith(roleUser, { page: 1 });
    },
  );

  it.each([
    ["missing cookie", undefined],
    ["expired session", "expired-token"],
    ["suspended session", "suspended-token"],
    ["deactivated session", "deactivated-token"],
  ])("rejects a %s before querying reports", async (_case, token) => {
    vi.mocked(readSessionCookie).mockResolvedValue(token);
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await GET(request("?page=2"));

    await expectAuthenticationRequired(response);
    expect(listOwnReports).not.toHaveBeenCalled();
  });

  it("authenticates before reading an invalid request URL", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const unsafeRequest = {
      get url() {
        throw new Error("private URL detail");
      },
    };

    const response = await GET(unsafeRequest as unknown as Request);

    await expectAuthenticationRequired(response);
    expect(listOwnReports).not.toHaveBeenCalled();
  });

  it.each([
    "?reporterId=64b64c6f2f4d9f1a2b3c4d99",
    "?userId=64b64c6f2f4d9f1a2b3c4d99",
    "?moderationStatus=hidden",
    "?pageSize=50",
    "?sort=createdAt",
    "?reportType=lost&reportType=found",
    "?status=open&status=closed",
    "?page=1&page=2",
    "?page=01",
    "?page=10001",
  ])("rejects an invalid or over-broad query %s", async (query) => {
    const response = await GET(request(query));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR", message: "Invalid report query" },
    });
    expect(listOwnReports).not.toHaveBeenCalled();
  });

  it.each([
    [
      "cookie",
      () =>
        vi
          .mocked(readSessionCookie)
          .mockRejectedValue(new Error("private cookie detail")),
      "private cookie detail",
    ],
    [
      "current user",
      () =>
        vi
          .mocked(getCurrentUser)
          .mockRejectedValue(new Error("private user detail")),
      "private user detail",
    ],
  ] as const)("redacts an unexpected %s failure", async (_case, arrange, secret) => {
    arrange();

    await expectBrowseFailure(await GET(request()), secret);
    expect(listOwnReports).not.toHaveBeenCalled();
  });

  it("redacts an unreadable authenticated request URL", async () => {
    const unsafeRequest = {
      get url() {
        throw new Error("private authenticated URL detail");
      },
    };

    await expectBrowseFailure(
      await GET(unsafeRequest as unknown as Request),
      "private authenticated URL detail",
    );
    expect(listOwnReports).not.toHaveBeenCalled();
  });

  it.each([
    [new Error("private database detail"), "private database detail"],
    [
      {
        name: "ReportError",
        code: "REPORT_NOT_FOUND",
        status: 404,
        message: "forged report detail",
      },
      "forged report detail",
    ],
  ])("redacts an unsafe service rejection %#", async (failure, secret) => {
    vi.mocked(listOwnReports).mockRejectedValue(failure);

    await expectBrowseFailure(await GET(request()), secret);
  });

  it("does not expose private evidence or authentication internals", async () => {
    const text = await (await GET(request())).text();

    expect(text).not.toMatch(
      /expectedAnswer|exactLocationDetails|serialNumber|privateNotes|reviewNote|passwordHash|tokenHash|raw-session-token/,
    );
  });
});
