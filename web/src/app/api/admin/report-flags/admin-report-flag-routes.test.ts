import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/moderation/access", () => ({
  getCurrentModerationAdministrator: vi.fn(),
}));
vi.mock("@/lib/moderation/admin-service", () => ({
  listAdminReportFlags: vi.fn(),
  resolveReportFlag: vi.fn(),
}));

import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { getCurrentModerationAdministrator } from "@/lib/moderation/access";
import {
  listAdminReportFlags,
  resolveReportFlag,
} from "@/lib/moderation/admin-service";
import { ModerationError } from "@/lib/moderation/errors";

import * as route from "./route";
import * as decisionRoute from "./[flagId]/route";

const administrator = {
  id: "64b64c6f2f4d9f1a2b3c4d50",
  email: "admin@example.test",
  role: "administrator",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Admin User",
    preferredContactMethod: "in_app",
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
} satisfies PublicUser;

const flagPage = {
  flags: [],
  pagination: {
    page: 1,
    pageSize: 20 as const,
    totalItems: 0,
    totalPages: 0,
  },
};

const flagId = "64b64c6f2f4d9f1a2b3c4d54";
const reportId = "64b64c6f2f4d9f1a2b3c4d51";
const expectedFlagUpdatedAt = "2026-08-28T03:00:00.000Z";
const expectedReportUpdatedAt = "2026-08-28T03:05:00.000Z";
const decisionResult = {
  flag: {
    id: flagId,
    reason: "privacy_concern" as const,
    details: "The description contains a phone number.",
    status: "dismissed" as const,
    reviewedAt: "2026-08-28T04:00:00.000Z",
    resolutionNote: "No policy issue found",
    createdAt: "2026-08-28T02:00:00.000Z",
    updatedAt: "2026-08-28T04:00:00.000Z",
    report: {
      id: reportId,
      reportType: "lost" as const,
      title: "Black laptop bag",
      publicDescription: "Black laptop bag with a shoulder strap.",
      categoryId: "64b64c6f2f4d9f1a2b3c4d52",
      campusLocationId: "64b64c6f2f4d9f1a2b3c4d53",
      occurredAt: "2026-08-28T01:00:00.000Z",
      colors: ["black"],
      tags: ["laptop", "bag"],
      photoUrls: ["https://images.example.test/bag.jpg"],
      status: "open" as const,
      moderationStatus: "visible" as const,
      privacySettings: {
        showPhoto: false,
        showEventDate: false,
        showCampusLocation: false,
      },
      resolvedAt: null,
      createdAt: "2026-08-28T02:00:00.000Z",
      updatedAt: expectedReportUpdatedAt,
    },
  },
  report: {
    id: reportId,
    reportType: "lost" as const,
    title: "Black laptop bag",
    publicDescription: "Black laptop bag with a shoulder strap.",
    categoryId: "64b64c6f2f4d9f1a2b3c4d52",
    campusLocationId: "64b64c6f2f4d9f1a2b3c4d53",
    occurredAt: "2026-08-28T01:00:00.000Z",
    colors: ["black"],
    tags: ["laptop", "bag"],
    photoUrls: ["https://images.example.test/bag.jpg"],
    status: "open" as const,
    moderationStatus: "visible" as const,
    privacySettings: {
      showPhoto: false,
      showEventDate: false,
      showCampusLocation: false,
    },
    resolvedAt: null,
    createdAt: "2026-08-28T02:00:00.000Z",
    updatedAt: expectedReportUpdatedAt,
  },
};

async function expectError(
  response: Response,
  status: number,
  code: string,
  message: string,
) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  await expect(response.json()).resolves.toEqual({
    error: { code, message },
  });
}

describe("administrator report flag queue route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentModerationAdministrator).mockResolvedValue(
      administrator,
    );
    vi.mocked(listAdminReportFlags).mockResolvedValue(flagPage);
    vi.mocked(resolveReportFlag).mockResolvedValue(decisionResult);
  });

  it("exports only GET", () => {
    expect(Object.keys(route).sort()).toEqual(["GET"]);
    expect(route).not.toHaveProperty("POST");
    expect(route).not.toHaveProperty("PATCH");
    expect(route).not.toHaveProperty("DELETE");
  });

  it("authorizes before reading the request URL", async () => {
    vi.mocked(getCurrentModerationAdministrator).mockRejectedValue(
      new AuthError("AUTHENTICATION_REQUIRED"),
    );
    const unreadRequest = {
      get url() {
        throw new Error("request URL must not be read");
      },
    } as unknown as Request;

    const response = await route.GET(unreadRequest);

    await expectError(
      response,
      401,
      "AUTHENTICATION_REQUIRED",
      "Authentication required",
    );
    expect(listAdminReportFlags).not.toHaveBeenCalled();
  });

  it.each([
    ["student", "active"],
    ["staff", "active"],
    ["administrator", "suspended"],
    ["administrator", "deactivated"],
  ] as const)("blocks a %s/%s principal before URL access", async () => {
    vi.mocked(getCurrentModerationAdministrator).mockRejectedValue(
      new ModerationError("ADMINISTRATOR_REQUIRED"),
    );
    const unreadRequest = {
      get url() {
        throw new Error("request URL must not be read");
      },
    } as unknown as Request;

    const response = await route.GET(unreadRequest);

    await expectError(
      response,
      403,
      "ADMINISTRATOR_REQUIRED",
      "Administrator access required",
    );
    expect(listAdminReportFlags).not.toHaveBeenCalled();
  });

  it("passes the exact default query", async () => {
    const response = await route.GET(
      new Request("http://localhost/api/admin/report-flags"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(listAdminReportFlags).toHaveBeenCalledWith(administrator, {
      page: 1,
    });
    await expect(response.json()).resolves.toEqual(flagPage);
  });

  it("normalizes the complete query", async () => {
    await route.GET(
      new Request(
        "http://localhost/api/admin/report-flags" +
          "?status=pending&reason=privacy_concern&page=3",
      ),
    );

    expect(listAdminReportFlags).toHaveBeenCalledWith(administrator, {
      status: "pending",
      reason: "privacy_concern",
      page: 3,
    });
  });

  it.each([
    "?ownerId=private",
    "?status=pending&status=actioned",
    "?reason=unknown",
    "?page=-1",
    "?page=01",
  ])("rejects query %s safely", async (query) => {
    const response = await route.GET(
      new Request(`http://localhost/api/admin/report-flags${query}`),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "Moderation request is invalid",
      },
    });
    expect(listAdminReportFlags).not.toHaveBeenCalled();
  });

  it("closes a request URL failure", async () => {
    const unreadable = {
      get url() {
        throw new Error("PRIVATE-URL-DETAIL");
      },
    } as unknown as Request;

    const response = await route.GET(unreadable);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(text)).toEqual({
      error: {
        code: "REPORT_MODERATION_FAILED",
        message: "Report moderation could not be completed",
      },
    });
    expect(text).not.toContain("PRIVATE-URL-DETAIL");
    expect(listAdminReportFlags).not.toHaveBeenCalled();
  });

  it("maps a domain failure exactly", async () => {
    vi.mocked(listAdminReportFlags).mockRejectedValue(
      new ModerationError("ADMINISTRATOR_REQUIRED"),
    );

    const response = await route.GET(
      new Request("http://localhost/api/admin/report-flags"),
    );

    await expectError(
      response,
      403,
      "ADMINISTRATOR_REQUIRED",
      "Administrator access required",
    );
  });

  it("redacts an unknown service failure", async () => {
    vi.mocked(listAdminReportFlags).mockRejectedValue(
      new Error("mongodb://private-host/secret"),
    );

    const response = await route.GET(
      new Request("http://localhost/api/admin/report-flags"),
    );
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(text)).toEqual({
      error: {
        code: "REPORT_MODERATION_FAILED",
        message: "Report moderation could not be completed",
      },
    });
    expect(text).not.toMatch(/private-host|secret/);
  });
});

function decisionRequest(body: string, contentType = "application/json") {
  return new Request(`http://localhost/api/admin/report-flags/${flagId}`, {
    method: "PATCH",
    headers: { "content-type": contentType },
    body,
  });
}

function decisionContext(id: string) {
  return { params: Promise.resolve({ flagId: id }) };
}

function rejectedDecisionContext(message: string) {
  return {
    params: {
      then() {
        throw new Error(message);
      },
    } as unknown as Promise<{ flagId: string }>,
  };
}

describe("administrator report flag decision route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentModerationAdministrator).mockResolvedValue(
      administrator,
    );
    vi.mocked(resolveReportFlag).mockResolvedValue(decisionResult);
  });

  it("keeps collection and member verbs narrow", () => {
    expect(Object.keys(route).sort()).toEqual(["GET"]);
    expect(Object.keys(decisionRoute).sort()).toEqual(["PATCH"]);
    expect(decisionRoute).not.toHaveProperty("GET");
    expect(decisionRoute).not.toHaveProperty("DELETE");
  });

  it("authorizes before reading path or body metadata", async () => {
    vi.mocked(getCurrentModerationAdministrator).mockRejectedValue(
      new AuthError("AUTHENTICATION_REQUIRED"),
    );
    const unreadRequest = {
      get headers() {
        throw new Error("body metadata must not be read");
      },
    } as unknown as Request;

    const response = await decisionRoute.PATCH(
      unreadRequest,
      rejectedDecisionContext("path must not be read"),
    );

    await expectError(
      response,
      401,
      "AUTHENTICATION_REQUIRED",
      "Authentication required",
    );
    expect(resolveReportFlag).not.toHaveBeenCalled();
  });

  it("closes a rejected path promise before body access", async () => {
    const unreadRequest = {
      get headers() {
        throw new Error("body metadata must not be read");
      },
    } as unknown as Request;

    const response = await decisionRoute.PATCH(
      unreadRequest,
      rejectedDecisionContext("PRIVATE-PATH-DETAIL"),
    );

    await expectError(
      response,
      500,
      "REPORT_MODERATION_FAILED",
      "Report moderation could not be completed",
    );
    expect(resolveReportFlag).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid ID", "bad-id", "application/json", "{}"],
    ["content type", flagId, "text/plain", "{}"],
    ["malformed JSON", flagId, "application/json", "{"],
    ["empty body", flagId, "application/json", ""],
    [
      "invalid decision",
      flagId,
      "application/json",
      JSON.stringify({ decision: "reopen", expectedFlagUpdatedAt }),
    ],
    [
      "dismiss with report timestamp",
      flagId,
      "application/json",
      JSON.stringify({
        decision: "dismiss",
        expectedFlagUpdatedAt,
        expectedReportUpdatedAt,
      }),
    ],
    [
      "hide without report timestamp",
      flagId,
      "application/json",
      JSON.stringify({ decision: "hide_report", expectedFlagUpdatedAt }),
    ],
    [
      "unknown actor field",
      flagId,
      "application/json",
      JSON.stringify({
        decision: "dismiss",
        expectedFlagUpdatedAt,
        administratorId: administrator.id,
      }),
    ],
    [
      "overlong note",
      flagId,
      "application/json",
      JSON.stringify({
        decision: "dismiss",
        expectedFlagUpdatedAt,
        note: "x".repeat(501),
      }),
    ],
  ] as const)(
    "rejects %s safely",
    async (_label, id, contentType, body) => {
      const response = await decisionRoute.PATCH(
        decisionRequest(body, contentType),
        decisionContext(id),
      );

      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          message: "Moderation request is invalid",
        },
      });
      expect(resolveReportFlag).not.toHaveBeenCalled();
    },
  );

  it("canonicalizes an uppercase ID and normalizes dismiss input", async () => {
    const response = await decisionRoute.PATCH(
      decisionRequest(
        JSON.stringify({
          decision: "dismiss",
          expectedFlagUpdatedAt,
          note: "  No   policy issue found  ",
        }),
        "Application/JSON; charset=utf-8",
      ),
      decisionContext(flagId.toUpperCase()),
    );

    expect(resolveReportFlag).toHaveBeenCalledOnce();
    expect(resolveReportFlag).toHaveBeenCalledWith(administrator, flagId, {
      decision: "dismiss",
      expectedFlagUpdatedAt,
      note: "No policy issue found",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(decisionResult);
  });

  it("passes both exact hide timestamps", async () => {
    await decisionRoute.PATCH(
      decisionRequest(
        JSON.stringify({
          decision: "hide_report",
          expectedFlagUpdatedAt,
          expectedReportUpdatedAt,
        }),
      ),
      decisionContext(flagId),
    );

    expect(resolveReportFlag).toHaveBeenCalledWith(administrator, flagId, {
      decision: "hide_report",
      expectedFlagUpdatedAt,
      expectedReportUpdatedAt,
      note: null,
    });
  });

  it.each([
    ["REPORT_FLAG_NOT_FOUND", 404, "Report flag not found"],
    ["REPORT_NOT_FOUND", 404, "Report not found"],
    ["REPORT_FLAG_STATE_CONFLICT", 409, "Report flag state has changed"],
    [
      "REPORT_MODERATION_CONFLICT",
      409,
      "Report moderation state has changed",
    ],
  ] as const)("maps %s exactly", async (code, status, message) => {
    vi.mocked(resolveReportFlag).mockRejectedValue(new ModerationError(code));

    const response = await decisionRoute.PATCH(
      decisionRequest(
        JSON.stringify({ decision: "dismiss", expectedFlagUpdatedAt }),
      ),
      decisionContext(flagId),
    );

    await expectError(response, status, code, message);
  });

  it("redacts unknown body and service failures", async () => {
    const unreadable = {
      headers: new Headers({ "content-type": "application/json" }),
      body: new ReadableStream<Uint8Array>({
        pull() {
          throw new Error("PRIVATE-BODY");
        },
      }),
    } as unknown as Request;
    let response = await decisionRoute.PATCH(
      unreadable,
      decisionContext(flagId),
    );
    let text = await response.text();
    expect(response.status).toBe(500);
    expect(text).not.toContain("PRIVATE-BODY");

    vi.mocked(resolveReportFlag).mockRejectedValue(
      new Error("PRIVATE-SERVICE"),
    );
    response = await decisionRoute.PATCH(
      decisionRequest(
        JSON.stringify({ decision: "dismiss", expectedFlagUpdatedAt }),
      ),
      decisionContext(flagId),
    );
    text = await response.text();
    expect(response.status).toBe(500);
    expect(text).not.toContain("PRIVATE-SERVICE");
  });
});
