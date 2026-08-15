import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/cookie", () => ({ readSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/reports/browse-service", () => ({
  listReports: vi.fn(),
  getReport: vi.fn(),
}));

import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getReport, listReports } from "@/lib/reports/browse-service";
import { ReportError } from "@/lib/reports/errors";
import type { MemberReport } from "@/lib/reports/public-report";

import { GET as reportDetailGet } from "./[id]/route";
import { GET as reportListGet } from "./route";

const reportId = "64b64c6f2f4d9f1a2b3c4d54";

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

const report = {
  id: reportId,
  reportType: "lost",
  title: "Black laptop bag",
  publicDescription: "Black laptop bag with a shoulder strap.",
  categoryId: "64b64c6f2f4d9f1a2b3c4d52",
  campusLocationId: null,
  occurredAt: null,
  colors: ["Black"],
  tags: ["laptop", "bag"],
  photoUrls: [],
  status: "open",
  resolvedAt: null,
  createdAt: "2026-08-15T02:05:00.000Z",
  updatedAt: "2026-08-15T02:05:00.000Z",
  isOwner: false,
} satisfies MemberReport;

const page = {
  reports: [report],
  pagination: { page: 1, pageSize: 12, total: 1, totalPages: 1 },
};

function listRequest(query = "") {
  return new Request(`http://localhost/api/reports${query}`);
}

function detailContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function rejectedDetailContext(message = "internal params detail") {
  return {
    params: {
      then() {
        throw new Error(message);
      },
    } as unknown as Promise<{ id: string }>,
  };
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
  const body = await response.json();
  expect(body).toEqual({
    error: {
      code: "REPORT_BROWSE_FAILED",
      message: "Unable to load reports",
    },
  });
  expect(JSON.stringify(body)).not.toContain(secret);
}

function expectNoSecrets(value: unknown) {
  expect(JSON.stringify(value)).not.toMatch(
    /reporterId|privacySettings|expectedAnswer|exactLocationDetails|privateNotes|serialNumber|tokenHash|passwordHash|raw-session-token/,
  );
}

describe("report browsing routes", () => {
  beforeEach(() => {
    vi.mocked(readSessionCookie).mockReset();
    vi.mocked(getCurrentUser).mockReset();
    vi.mocked(listReports).mockReset();
    vi.mocked(getReport).mockReset();

    vi.mocked(readSessionCookie).mockResolvedValue("raw-session-token");
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(listReports).mockResolvedValue(page);
    vi.mocked(getReport).mockResolvedValue(report);
  });

  it("returns a member-visible page with transformed browse parameters", async () => {
    const response = await reportListGet(
      listRequest(
        "?q=%20laptop%20bag%20&occurredFrom=2026-08-01T00%3A00%3A00%2B12%3A00" +
          "&hasPhoto=true&page=2&pageSize=25",
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(getCurrentUser).toHaveBeenCalledWith("raw-session-token");
    expect(listReports).toHaveBeenCalledWith(user, {
      q: "laptop bag",
      occurredFrom: new Date("2026-07-31T12:00:00.000Z"),
      hasPhoto: true,
      page: 2,
      pageSize: 25,
    });
    expect(body).toEqual(page);
    expectNoSecrets(body);
  });

  it("applies list pagination defaults", async () => {
    await reportListGet(listRequest());

    expect(listReports).toHaveBeenCalledWith(user, { page: 1, pageSize: 12 });
  });

  it("returns one member-visible report", async () => {
    const response = await reportDetailGet(
      listRequest(`/${reportId}`),
      detailContext(reportId),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(getReport).toHaveBeenCalledWith(user, reportId);
    expect(body).toEqual({ report });
    expectNoSecrets(body);
  });

  it.each(["student", "staff", "administrator"] as const)(
    "allows an active %s to use both browse routes",
    async (role) => {
      const roleUser = { ...user, role };
      vi.mocked(getCurrentUser).mockResolvedValue(roleUser);

      const listResponse = await reportListGet(listRequest());
      const detailResponse = await reportDetailGet(
        listRequest(`/${reportId}`),
        detailContext(reportId),
      );

      expect(listResponse.status).toBe(200);
      expect(detailResponse.status).toBe(200);
      expect(listReports).toHaveBeenCalledWith(roleUser, {
        page: 1,
        pageSize: 12,
      });
      expect(getReport).toHaveBeenCalledWith(roleUser, reportId);
    },
  );

  it("authenticates before reading list query parameters", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const request = {
      get url() {
        throw new Error("query must not be read");
      },
    } as unknown as Request;

    const response = await reportListGet(request);

    await expectAuthenticationRequired(response);
    expect(listReports).not.toHaveBeenCalled();
  });

  it("authenticates before awaiting detail parameters", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await reportDetailGet(
      listRequest(`/${reportId}`),
      rejectedDetailContext("params must not be read"),
    );

    await expectAuthenticationRequired(response);
    expect(getReport).not.toHaveBeenCalled();
  });

  it.each([
    ["malformed", "?page=0", true],
    ["unknown", "?sort=title", false],
    ["duplicate", "?status=open&status=closed", true],
  ])("rejects %s list parameters exactly", async (_case, query, hasFields) => {
    const response = await reportListGet(listRequest(query));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid report query",
        ...(hasFields ? { fields: expect.any(Object) } : {}),
      },
    });
    expect(listReports).not.toHaveBeenCalled();
  });

  it("rejects an invalid detail ID exactly", async () => {
    const response = await reportDetailGet(
      listRequest("/not-an-id"),
      detailContext("not-an-id"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid report query",
      },
    });
    expect(getReport).not.toHaveBeenCalled();
  });

  it("maps missing and draft reports to the same safe not-found response", async () => {
    vi.mocked(getReport).mockRejectedValue(new ReportError("REPORT_NOT_FOUND"));

    const response = await reportDetailGet(
      listRequest(`/${reportId}`),
      detailContext(reportId),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: "REPORT_NOT_FOUND", message: "Report not found" },
    });
  });

  it.each([
    ["list service", listReports, "list database secret", "list"],
    ["detail service", getReport, "detail database secret", "detail"],
  ] as const)(
    "hides %s failures",
    async (_case, dependency, secret, route) => {
      vi.mocked(dependency).mockRejectedValue(new Error(secret));

      const response =
        route === "list"
          ? await reportListGet(listRequest())
          : await reportDetailGet(
              listRequest(`/${reportId}`),
              detailContext(reportId),
            );

      await expectBrowseFailure(response, secret);
    },
  );

  it.each([
    ["cookie", readSessionCookie, "cookie internal detail"],
    ["current user", getCurrentUser, "current-user internal detail"],
  ] as const)("hides %s failures", async (_case, dependency, secret) => {
    vi.mocked(dependency).mockRejectedValue(new Error(secret));

    const response = await reportListGet(listRequest());

    await expectBrowseFailure(response, secret);
    expect(listReports).not.toHaveBeenCalled();
  });

  it("hides request URL failures after authentication", async () => {
    const request = {
      get url() {
        throw new Error("request URL internal detail");
      },
    } as unknown as Request;

    const response = await reportListGet(request);

    await expectBrowseFailure(response, "request URL internal detail");
    expect(listReports).not.toHaveBeenCalled();
  });

  it("hides rejected Next.js detail parameters", async () => {
    const response = await reportDetailGet(
      listRequest(`/${reportId}`),
      rejectedDetailContext(),
    );

    await expectBrowseFailure(response, "internal params detail");
    expect(getReport).not.toHaveBeenCalled();
  });
});
