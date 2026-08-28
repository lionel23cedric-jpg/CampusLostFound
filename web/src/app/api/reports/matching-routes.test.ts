import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/cookie", () => ({ readSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/reports/matching-service", () => ({
  findReportMatches: vi.fn(),
}));

import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { MatchingError } from "@/lib/reports/matching-errors";
import { findReportMatches } from "@/lib/reports/matching-service";

import { GET } from "./[id]/matches/route";

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

const matches = {
  sourceReportId: reportId,
  matches: [
    {
      report: {
        id: "64b64c6f2f4d9f1a2b3c4d55",
        reportType: "found" as const,
        title: "Black notebook adapter",
        publicDescription: "Found beside the library help desk.",
        categoryId: "64b64c6f2f4d9f1a2b3c4d52",
        campusLocationId: null,
        occurredAt: "2026-08-24T02:00:00.000Z",
        colors: ["Black"],
        tags: ["laptop", "charger"],
        photoUrls: [],
        status: "open" as const,
        moderationStatus: "visible" as const,
        resolvedAt: null,
        createdAt: "2026-08-24T03:00:00.000Z",
        updatedAt: "2026-08-24T03:00:00.000Z",
        isOwner: false,
      },
      score: 72,
      factors: [
        {
          key: "category" as const,
          points: 25,
          maximum: 25,
          explanation: "Same category",
        },
      ],
    },
  ],
};

function request() {
  return new Request(`http://localhost/api/reports/${reportId}/matches`);
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function rejectedContext(message: string) {
  return {
    params: {
      then() {
        throw new Error(message);
      },
    } as unknown as Promise<{ id: string }>,
  };
}

async function expectError(
  response: Response,
  status: number,
  code: string,
  message: string,
) {
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toEqual({
    error: { code, message },
  });
}

describe("report matching route", () => {
  beforeEach(() => {
    vi.mocked(readSessionCookie).mockReset();
    vi.mocked(getCurrentUser).mockReset();
    vi.mocked(findReportMatches).mockReset();

    vi.mocked(readSessionCookie).mockResolvedValue("raw-session-token");
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(findReportMatches).mockResolvedValue(matches);
  });

  it.each(["student", "staff", "administrator"] as const)(
    "returns owner matches for an active %s",
    async (role) => {
      const owner = { ...user, role };
      vi.mocked(getCurrentUser).mockResolvedValue(owner);

      const response = await GET(request(), context(reportId));

      expect(response.status).toBe(200);
      expect(getCurrentUser).toHaveBeenCalledWith("raw-session-token");
      expect(findReportMatches).toHaveBeenCalledWith(owner, reportId);
      await expect(response.json()).resolves.toEqual(matches);
    },
  );

  it("authenticates before awaiting route parameters", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await GET(
      request(),
      rejectedContext("params must not be read"),
    );

    await expectError(
      response,
      401,
      "AUTHENTICATION_REQUIRED",
      "Authentication required",
    );
    expect(findReportMatches).not.toHaveBeenCalled();
  });

  it("rejects an invalid report ID before calling the service", async () => {
    const response = await GET(request(), context("not-an-object-id"));

    await expectError(
      response,
      400,
      "VALIDATION_ERROR",
      "Invalid report query",
    );
    expect(findReportMatches).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", "REPORT_NOT_FOUND", 404, "Report not found"],
    [
      "ineligible",
      "REPORT_NOT_MATCHABLE",
      409,
      "Report is not available for matching",
    ],
  ] as const)(
    "maps a %s source safely",
    async (_case, code, status, message) => {
      vi.mocked(findReportMatches).mockRejectedValue(new MatchingError(code));

      const response = await GET(request(), context(reportId));

      await expectError(response, status, code, message);
    },
  );

  it("hides a rejected route context", async () => {
    const response = await GET(
      request(),
      rejectedContext("private route context detail"),
    );

    await expectError(
      response,
      500,
      "MATCHING_FAILED",
      "Unable to find report matches",
    );
    expect(findReportMatches).not.toHaveBeenCalled();
  });

  it.each([
    ["cookie", readSessionCookie],
    ["current user", getCurrentUser],
    ["service", findReportMatches],
  ] as const)("hides a %s failure", async (_case, dependency) => {
    const secret = `${_case} private detail`;
    vi.mocked(dependency as typeof findReportMatches).mockRejectedValue(
      new Error(secret),
    );

    const response = await GET(request(), context(reportId));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: {
        code: "MATCHING_FAILED",
        message: "Unable to find report matches",
      },
    });
    expect(JSON.stringify(body)).not.toContain(secret);
  });

  it("returns only the approved privacy-safe contract", async () => {
    const response = await GET(request(), context(reportId));
    const body = await response.json();
    const serialised = JSON.stringify(body);

    expect(body).toEqual(matches);
    expect(serialised).not.toMatch(
      /reporterId|privacySettings|expectedAnswer|serialNumber|exactLocationDetails|privateNotes|email|passwordHash|tokenHash|raw-session-token/,
    );
  });
});
