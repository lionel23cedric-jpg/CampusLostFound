import { describe, expect, it } from "vitest";

import { AuthError } from "@/lib/auth/errors";

import {
  AccountManagementError,
  accountManagementErrorResponse,
  invalidAccountManagementResponse,
} from "./account-errors";

describe("administrator account errors", () => {
  it.each([
    ["ADMINISTRATOR_REQUIRED", 403, "Administrator access required"],
    ["ACCOUNT_ACTION_FORBIDDEN", 403, "Account action is not permitted"],
    ["ACCOUNT_NOT_FOUND", 404, "Account not found"],
    [
      "ACCOUNT_STATE_CONFLICT",
      409,
      "Account state has changed or cannot be updated",
    ],
    [
      "ACCOUNT_OPERATION_FAILED",
      500,
      "Account operation could not be completed",
    ],
  ] as const)("preserves approved error %s", async (code, status, message) => {
    const response = accountManagementErrorResponse(
      new AccountManagementError(code),
    );
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({
      error: { code, message },
    });
  });

  it("preserves only the authentication-required auth error", async () => {
    const response = accountManagementErrorResponse(
      new AuthError("AUTHENTICATION_REQUIRED"),
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Authentication required",
      },
    });
  });

  it.each([
    new AuthError("ACCOUNT_UNAVAILABLE"),
    new Error("mongodb://private-host/database"),
    { passwordHash: "secret", stack: "private stack" },
    "raw failure",
    null,
  ])("redacts unknown failure %#", async (error) => {
    const response = accountManagementErrorResponse(error);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({
      error: {
        code: "ACCOUNT_OPERATION_FAILED",
        message: "Account operation could not be completed",
      },
    });
    expect(text).not.toMatch(
      /mongodb|private-host|password|secret|stack|raw failure|account_unavailable/i,
    );
  });

  it("returns the exact validation response without rejected fields", async () => {
    const response = invalidAccountManagementResponse();
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: { code: "VALIDATION_ERROR", message: "Request is invalid" },
    });
  });
});
