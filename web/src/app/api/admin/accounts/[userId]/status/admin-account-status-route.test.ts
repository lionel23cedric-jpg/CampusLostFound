import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/account-access", () => ({
  requireAccountAdministrator: vi.fn(),
}));
vi.mock("@/lib/admin/account-status-service", () => ({
  updateManagedAccountStatus: vi.fn(),
}));
vi.mock("@/lib/auth/cookie", () => ({ readSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));

import { requireAccountAdministrator } from "@/lib/admin/account-access";
import { AccountManagementError } from "@/lib/admin/account-errors";
import { JSON_REQUEST_BODY_LIMIT } from "@/lib/request-body";
import { updateManagedAccountStatus } from "@/lib/admin/account-status-service";
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { PublicUser } from "@/lib/auth/public-user";

import { PATCH } from "./route";

const administrator = {
  id: "64b64c6f2f4d9f1a2b3c4d51",
  email: "admin@example.test",
  role: "administrator",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Administrator",
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

const targetUserId = "64b64c6f2f4d9f1a2b3c4d52";
const validBody = {
  status: "suspended" as const,
  expectedUpdatedAt: "2026-08-27T01:00:00.000Z",
  reason: "security_concern" as const,
};
const updatedAccount = {
  id: targetUserId,
  email: "student@example.test",
  displayName: "Example Student",
  role: "student" as const,
  status: "suspended" as const,
  createdAt: "2026-08-20T01:00:00.000Z",
  lastLoginAt: null,
  updatedAt: "2026-08-27T01:00:01.000Z",
};
const context = (userId: string) => ({ params: Promise.resolve({ userId }) });

function request(
  body: BodyInit | null = JSON.stringify(validBody),
  contentType: string | null = "application/json",
) {
  return new Request(
    `http://localhost/api/admin/accounts/${targetUserId}/status`,
    {
      method: "PATCH",
      ...(contentType ? { headers: { "content-type": contentType } } : {}),
      ...(body === null ? {} : { body }),
    },
  );
}

describe("administrator account status route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readSessionCookie).mockResolvedValue("raw-session-token");
    vi.mocked(getCurrentUser).mockResolvedValue(administrator);
    vi.mocked(updateManagedAccountStatus).mockResolvedValue(updatedAccount);
  });

  it("authenticates and authorises before path or body validation", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const response = await PATCH(
      request("PRIVATE INVALID BODY", null),
      context("private"),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(requireAccountAdministrator).not.toHaveBeenCalled();
    expect(updateManagedAccountStatus).not.toHaveBeenCalled();
  });

  it("updates one account through the strict no-store route", async () => {
    const response = await PATCH(
      request(JSON.stringify(validBody), "application/json; charset=utf-8"),
      context(targetUserId),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(requireAccountAdministrator).toHaveBeenCalledWith(administrator);
    expect(updateManagedAccountStatus).toHaveBeenCalledWith(
      administrator,
      targetUserId,
      validBody,
    );
    await expect(response.json()).resolves.toEqual({ account: updatedAccount });
  });

  it.each([
    ["invalid ID", "private", JSON.stringify(validBody), "application/json"],
    [
      "uppercase ID",
      targetUserId.toUpperCase(),
      JSON.stringify(validBody),
      "application/json",
    ],
    ["missing content type", targetUserId, JSON.stringify(validBody), null],
    ["wrong content type", targetUserId, JSON.stringify(validBody), "text/plain"],
    ["empty body", targetUserId, null, "application/json"],
    ["malformed JSON", targetUserId, "{", "application/json"],
    [
      "unknown field",
      targetUserId,
      JSON.stringify({ ...validBody, email: "private@example.test" }),
      "application/json",
    ],
    [
      "invalid status",
      targetUserId,
      JSON.stringify({ ...validBody, status: "administrator" }),
      "application/json",
    ],
    [
      "invalid reason",
      targetUserId,
      JSON.stringify({ ...validBody, reason: "free text" }),
      "application/json",
    ],
    [
      "invalid timestamp",
      targetUserId,
      JSON.stringify({ ...validBody, expectedUpdatedAt: "yesterday" }),
      "application/json",
    ],
  ] as const)(
    "rejects %s",
    async (_label, userId, body, contentType) => {
      const response = await PATCH(request(body, contentType), context(userId));
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toEqual({
        error: { code: "VALIDATION_ERROR", message: "Request is invalid" },
      });
      expect(updateManagedAccountStatus).not.toHaveBeenCalled();
    },
  );

  it("rejects oversized and invalid UTF-8 bodies", async () => {
    const oversized = await PATCH(
      request("x".repeat(JSON_REQUEST_BODY_LIMIT + 1)),
      context(targetUserId),
    );
    expect(oversized.status).toBe(413);
    await expect(oversized.json()).resolves.toEqual({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "Request body is too large",
      },
    });

    const invalidUtf8 = await PATCH(
      request(new Blob([new Uint8Array([0xff])])),
      context(targetUserId),
    );
    expect(invalidUtf8.status).toBe(400);
    expect(updateManagedAccountStatus).not.toHaveBeenCalled();
  });

  it.each([
    ["ACCOUNT_ACTION_FORBIDDEN", 403],
    ["ACCOUNT_NOT_FOUND", 404],
    ["ACCOUNT_STATE_CONFLICT", 409],
  ] as const)("preserves safe service error %s", async (code, status) => {
    vi.mocked(updateManagedAccountStatus).mockRejectedValueOnce(
      new AccountManagementError(code),
    );
    const response = await PATCH(request(), context(targetUserId));
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).error.code).toBe(code);
  });

  it("returns the safe administrator denial", async () => {
    vi.mocked(requireAccountAdministrator).mockImplementationOnce(() => {
      throw new AccountManagementError("ADMINISTRATOR_REQUIRED");
    });
    const response = await PATCH(request(), context(targetUserId));
    expect(response.status).toBe(403);
    expect(updateManagedAccountStatus).not.toHaveBeenCalled();
  });

  it("redacts rejected parameters and unexpected failures", async () => {
    const rejectedContext = {
      params: Promise.reject(new Error("PRIVATE PARAMETER FAILURE")),
    };
    const parameterResponse = await PATCH(request(), rejectedContext);
    expect(parameterResponse.status).toBe(500);
    expect(await parameterResponse.text()).not.toContain("PRIVATE");

    vi.mocked(updateManagedAccountStatus).mockRejectedValueOnce(
      new Error("mongodb PRIVATE passwordHash tokenHash"),
    );
    const serviceResponse = await PATCH(request(), context(targetUserId));
    const text = await serviceResponse.text();
    expect(serviceResponse.status).toBe(500);
    expect(serviceResponse.headers.get("cache-control")).toBe("no-store");
    expect(text).not.toMatch(/mongodb|private|passwordHash|tokenHash/);
  });
});
