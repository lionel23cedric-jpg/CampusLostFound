import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/moderation/access", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/moderation/access")
  >();
  return { ...actual, getCurrentModerationMember: vi.fn() };
});
vi.mock("@/lib/moderation/flag-service", () => ({
  submitReportFlag: vi.fn(),
}));

import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import {
  getCurrentModerationMember,
  requireModerationMember,
} from "@/lib/moderation/access";
import { ModerationError } from "@/lib/moderation/errors";
import { submitReportFlag } from "@/lib/moderation/flag-service";

import * as route from "./route";

const reportId = "64b64c6f2f4d9f1a2b3c4d52";
const flagId = "64b64c6f2f4d9f1a2b3c4d53";
const member: PublicUser = {
  id: "64b64c6f2f4d9f1a2b3c4d50",
  email: "member@example.test",
  role: "student",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Example Member",
    preferredContactMethod: "in_app",
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
};
const receipt = {
  id: flagId,
  reportId,
  reason: "privacy_concern" as const,
  status: "pending" as const,
  createdAt: "2026-08-28T03:00:00.000Z",
};

function request(body: string, contentType = "application/json") {
  return new Request(`http://localhost/api/reports/${reportId}/flags`, {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
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
  expect(response.headers.get("cache-control")).toBe("no-store");
  await expect(response.json()).resolves.toEqual({
    error: { code, message },
  });
}

describe("member report flag route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentModerationMember).mockResolvedValue(member);
    vi.mocked(submitReportFlag).mockResolvedValue(receipt);
  });

  it("exports only POST", () => {
    expect(Object.keys(route).sort()).toEqual(["POST"]);
    expect(route).not.toHaveProperty("DELETE");
  });

  it("authenticates before reading parameters or request metadata", async () => {
    vi.mocked(getCurrentModerationMember).mockRejectedValue(
      new AuthError("AUTHENTICATION_REQUIRED"),
    );
    const unreadRequest = {
      get headers() {
        throw new Error("body metadata must not be read");
      },
    } as unknown as Request;

    const response = await route.POST(
      unreadRequest,
      rejectedContext("params must not be read"),
    );

    await expectError(
      response,
      401,
      "AUTHENTICATION_REQUIRED",
      "Authentication required",
    );
    expect(submitReportFlag).not.toHaveBeenCalled();
  });

  it.each(["suspended", "deactivated"] as const)(
    "rejects a %s session before parsing",
    async (status) => {
      const inactiveMember = { ...member, status };
      vi.mocked(getCurrentModerationMember).mockImplementation(async () => {
        requireModerationMember(inactiveMember);
        return inactiveMember;
      });
      const unreadRequest = {
        get headers() {
          throw new Error("body metadata must not be read");
        },
      } as unknown as Request;

      const response = await route.POST(
        unreadRequest,
        rejectedContext("params must not be read"),
      );

      await expectError(
        response,
        403,
        "ACTIVE_ACCOUNT_REQUIRED",
        "An active account is required",
      );
      expect(submitReportFlag).not.toHaveBeenCalled();
    },
  );

  it("closes a rejected route context before reading the request", async () => {
    const unreadRequest = {
      get headers() {
        throw new Error("request must not be read");
      },
    } as unknown as Request;

    const response = await route.POST(
      unreadRequest,
      rejectedContext("private route context detail"),
    );

    await expectError(
      response,
      500,
      "REPORT_MODERATION_FAILED",
      "Report moderation could not be completed",
    );
    expect(submitReportFlag).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid ID", "not-an-object-id", "application/json", "{}"],
    ["unsupported content type", reportId, "text/plain", "{}"],
    ["malformed JSON", reportId, "application/json", "{"],
    ["empty body", reportId, "application/json", ""],
    [
      "unknown field",
      reportId,
      "application/json",
      JSON.stringify({ reason: "privacy_concern", surprise: true }),
    ],
    [
      "invalid reason",
      reportId,
      "application/json",
      JSON.stringify({ reason: "private-internal-reason" }),
    ],
    [
      "blank other details",
      reportId,
      "application/json",
      JSON.stringify({ reason: "other", details: "   " }),
    ],
    [
      "overlong details",
      reportId,
      "application/json",
      JSON.stringify({ reason: "privacy_concern", details: "x".repeat(501) }),
    ],
  ] as const)(
    "rejects %s safely",
    async (_label, id, contentType, body) => {
      const response = await route.POST(
        request(body, contentType),
        context(id),
      );

      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const result = await response.json();
      expect(result).toMatchObject({
        error: {
          code: "VALIDATION_ERROR",
          message: "Moderation request is invalid",
        },
      });
      expect(JSON.stringify(result)).not.toMatch(/private-internal-reason/);
      expect(submitReportFlag).not.toHaveBeenCalled();
    },
  );

  it("canonicalizes the ID and normalizes valid input once", async () => {
    const response = await route.POST(
      request(
        JSON.stringify({
          reason: "privacy_concern",
          details: "  Public   phone number  ",
        }),
        "Application/JSON; charset=utf-8",
      ),
      context(reportId.toUpperCase()),
    );

    expect(submitReportFlag).toHaveBeenCalledOnce();
    expect(submitReportFlag).toHaveBeenCalledWith(member, reportId, {
      reason: "privacy_concern",
      details: "Public phone number",
    });
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ flag: receipt });
  });

  it("returns only the privacy-safe receipt", async () => {
    const response = await route.POST(
      request(JSON.stringify({ reason: "privacy_concern" })),
      context(reportId),
    );
    const body = await response.json();
    const serialised = JSON.stringify(body);

    expect(body).toEqual({ flag: receipt });
    expect(serialised).not.toMatch(
      /details|submittedByUserId|reviewedByAdministratorId|email|displayName/,
    );
  });

  it.each([
    ["ACTIVE_ACCOUNT_REQUIRED", 403, "An active account is required"],
    ["ADMINISTRATOR_REQUIRED", 403, "Administrator access required"],
    ["REPORT_FLAG_FORBIDDEN", 403, "Report cannot be flagged"],
    ["REPORT_NOT_FOUND", 404, "Report not found"],
    ["REPORT_FLAG_NOT_FOUND", 404, "Report flag not found"],
    ["REPORT_FLAG_ALREADY_PENDING", 409, "A pending flag already exists"],
    ["REPORT_FLAG_STATE_CONFLICT", 409, "Report flag state has changed"],
    [
      "REPORT_MODERATION_CONFLICT",
      409,
      "Report moderation state has changed",
    ],
    [
      "REPORT_MODERATION_FAILED",
      500,
      "Report moderation could not be completed",
    ],
  ] as const)("maps %s exactly", async (code, status, message) => {
    vi.mocked(submitReportFlag).mockRejectedValue(new ModerationError(code));

    const response = await route.POST(
      request(JSON.stringify({ reason: "privacy_concern" })),
      context(reportId),
    );

    await expectError(response, status, code, message);
  });

  it("treats only JSON SyntaxError as invalid input", async () => {
    const secret = "private body reader detail";
    const unreadable = {
      headers: new Headers({ "content-type": "application/json" }),
      json: vi.fn().mockRejectedValue(new Error(secret)),
    } as unknown as Request;

    const response = await route.POST(unreadable, context(reportId));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      error: {
        code: "REPORT_MODERATION_FAILED",
        message: "Report moderation could not be completed",
      },
    });
    expect(JSON.stringify(body)).not.toContain(secret);
    expect(submitReportFlag).not.toHaveBeenCalled();
  });

  it("redacts an unknown service failure", async () => {
    const secret = "mongodb://private-host/raw-value";
    vi.mocked(submitReportFlag).mockRejectedValue(new Error(secret));

    const response = await route.POST(
      request(JSON.stringify({ reason: "privacy_concern" })),
      context(reportId),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({
      error: {
        code: "REPORT_MODERATION_FAILED",
        message: "Report moderation could not be completed",
      },
    });
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});
