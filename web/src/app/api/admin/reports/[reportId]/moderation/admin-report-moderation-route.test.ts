import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/moderation/access", () => ({
  getCurrentModerationAdministrator: vi.fn(),
}));
vi.mock("@/lib/moderation/admin-service", () => ({
  moderateReport: vi.fn(),
}));

import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { getCurrentModerationAdministrator } from "@/lib/moderation/access";
import { moderateReport } from "@/lib/moderation/admin-service";
import { ModerationError } from "@/lib/moderation/errors";

import * as route from "./route";

const reportId = "64b64c6f2f4d9f1a2b3c4d51";
const expectedUpdatedAt = "2026-08-28T03:05:00.000Z";
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
const report = {
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
  moderationStatus: "hidden" as const,
  privacySettings: {
    showPhoto: false,
    showEventDate: false,
    showCampusLocation: false,
  },
  resolvedAt: null,
  createdAt: "2026-08-28T02:00:00.000Z",
  updatedAt: "2026-08-28T04:00:00.000Z",
};

function request(body: string, contentType = "application/json") {
  return new Request(
    `http://localhost/api/admin/reports/${reportId}/moderation`,
    {
      method: "PATCH",
      headers: { "content-type": contentType },
      body,
    },
  );
}

function context(id: string) {
  return { params: Promise.resolve({ reportId: id }) };
}

function rejectedContext(message: string) {
  return {
    params: {
      then() {
        throw new Error(message);
      },
    } as unknown as Promise<{ reportId: string }>,
  };
}

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

describe("administrator direct report moderation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentModerationAdministrator).mockResolvedValue(
      administrator,
    );
    vi.mocked(moderateReport).mockResolvedValue(report);
  });

  it("exports only PATCH", () => {
    expect(Object.keys(route).sort()).toEqual(["PATCH"]);
    expect(route).not.toHaveProperty("GET");
    expect(route).not.toHaveProperty("POST");
    expect(route).not.toHaveProperty("DELETE");
  });

  it("authorizes before reading path or body", async () => {
    vi.mocked(getCurrentModerationAdministrator).mockRejectedValue(
      new AuthError("AUTHENTICATION_REQUIRED"),
    );
    const unreadRequest = {
      get headers() {
        throw new Error("body metadata must not be read");
      },
    } as unknown as Request;

    const response = await route.PATCH(
      unreadRequest,
      rejectedContext("path must not be read"),
    );

    await expectError(
      response,
      401,
      "AUTHENTICATION_REQUIRED",
      "Authentication required",
    );
    expect(moderateReport).not.toHaveBeenCalled();
  });

  it("closes a rejected path before body access", async () => {
    const unreadRequest = {
      get headers() {
        throw new Error("body metadata must not be read");
      },
    } as unknown as Request;

    const response = await route.PATCH(
      unreadRequest,
      rejectedContext("PRIVATE-PATH"),
    );

    await expectError(
      response,
      500,
      "REPORT_MODERATION_FAILED",
      "Report moderation could not be completed",
    );
    expect(moderateReport).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid ID", "bad-id", "application/json", "{}"],
    ["content type", reportId, "text/plain", "{}"],
    ["malformed JSON", reportId, "application/json", "{"],
    [
      "hide without reason",
      reportId,
      "application/json",
      JSON.stringify({ moderationStatus: "hidden", expectedUpdatedAt }),
    ],
    [
      "restore with reason",
      reportId,
      "application/json",
      JSON.stringify({
        moderationStatus: "visible",
        reason: "administrative_review",
        expectedUpdatedAt,
      }),
    ],
    [
      "unknown state",
      reportId,
      "application/json",
      JSON.stringify({
        moderationStatus: "removed",
        expectedUpdatedAt,
      }),
    ],
    [
      "actor ID",
      reportId,
      "application/json",
      JSON.stringify({
        moderationStatus: "hidden",
        reason: "administrative_review",
        expectedUpdatedAt,
        administratorId: administrator.id,
      }),
    ],
    [
      "recovery status",
      reportId,
      "application/json",
      JSON.stringify({
        moderationStatus: "hidden",
        reason: "administrative_review",
        expectedUpdatedAt,
        status: "closed",
      }),
    ],
    [
      "overlong note",
      reportId,
      "application/json",
      JSON.stringify({
        moderationStatus: "visible",
        expectedUpdatedAt,
        note: "x".repeat(501),
      }),
    ],
  ] as const)(
    "rejects %s safely",
    async (_label, id, contentType, body) => {
      const response = await route.PATCH(
        request(body, contentType),
        context(id),
      );

      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          message: "Moderation request is invalid",
        },
      });
      expect(moderateReport).not.toHaveBeenCalled();
    },
  );

  it("canonicalizes ID and normalizes direct-hide input", async () => {
    const response = await route.PATCH(
      request(
        JSON.stringify({
          moderationStatus: "hidden",
          reason: "administrative_review",
          expectedUpdatedAt,
          note: "  Manual   review  ",
        }),
        "Application/JSON; charset=utf-8",
      ),
      context(reportId.toUpperCase()),
    );

    expect(moderateReport).toHaveBeenCalledWith(administrator, reportId, {
      moderationStatus: "hidden",
      reason: "administrative_review",
      expectedUpdatedAt,
      note: "Manual review",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ report });
  });

  it("passes the exact restore union", async () => {
    await route.PATCH(
      request(
        JSON.stringify({
          moderationStatus: "visible",
          expectedUpdatedAt,
          note: "  Review complete  ",
        }),
      ),
      context(reportId),
    );

    expect(moderateReport).toHaveBeenCalledWith(administrator, reportId, {
      moderationStatus: "visible",
      expectedUpdatedAt,
      note: "Review complete",
    });
  });

  it.each([
    ["REPORT_NOT_FOUND", 404, "Report not found"],
    [
      "REPORT_MODERATION_CONFLICT",
      409,
      "Report moderation state has changed",
    ],
  ] as const)("maps %s exactly", async (code, status, message) => {
    vi.mocked(moderateReport).mockRejectedValue(new ModerationError(code));

    const response = await route.PATCH(
      request(
        JSON.stringify({
          moderationStatus: "visible",
          expectedUpdatedAt,
        }),
      ),
      context(reportId),
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
    let response = await route.PATCH(unreadable, context(reportId));
    let text = await response.text();
    expect(response.status).toBe(500);
    expect(text).not.toContain("PRIVATE-BODY");

    vi.mocked(moderateReport).mockRejectedValue(
      new Error("PRIVATE-SERVICE"),
    );
    response = await route.PATCH(
      request(
        JSON.stringify({
          moderationStatus: "visible",
          expectedUpdatedAt,
        }),
      ),
      context(reportId),
    );
    text = await response.text();
    expect(response.status).toBe(500);
    expect(text).not.toContain("PRIVATE-SERVICE");
  });
});
