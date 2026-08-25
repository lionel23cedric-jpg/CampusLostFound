import { describe, expect, it } from "vitest";

import { AuthError } from "@/lib/auth/errors";

import {
  NotificationError,
  invalidNotificationResponse,
  notificationErrorResponse,
} from "./errors";

describe("notification errors", () => {
  it("preserves authentication-required", async () => {
    const response = notificationErrorResponse(
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
    ["NOTIFICATION_FORBIDDEN", 403, "Notification access is not permitted"],
    ["NOTIFICATION_NOT_FOUND", 404, "Notification not found"],
  ] as const)("maps %s", async (code, status, message) => {
    const response = notificationErrorResponse(new NotificationError(code));
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({
      error: { code, message },
    });
  });

  it("redacts unknown errors", async () => {
    const response = notificationErrorResponse(
      new Error("PRIVATE-DATABASE-DETAIL"),
    );
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: "NOTIFICATION_OPERATION_FAILED",
        message: "Notification operation failed",
      },
    });
    expect(JSON.stringify(body)).not.toContain("PRIVATE-DATABASE-DETAIL");
  });

  it("returns one stable validation error", async () => {
    const response = invalidNotificationResponse();
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid notification request",
      },
    });
  });
});
