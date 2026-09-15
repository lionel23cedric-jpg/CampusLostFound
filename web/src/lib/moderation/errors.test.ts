import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AuthError } from "@/lib/auth/errors";
import { PENDING_REPORT_FLAG_INDEX } from "@/models/report-flag";

import {
  ModerationError,
  invalidModerationResponse,
  isPendingReportFlagDuplicate,
  moderationErrorResponse,
} from "./errors";

describe("moderation errors", () => {
  it.each([
    ["ACTIVE_ACCOUNT_REQUIRED", 403, "An active account is required"],
    ["ADMINISTRATOR_REQUIRED", 403, "Administrator access required"],
    ["REPORT_FLAG_FORBIDDEN", 403, "Report cannot be flagged"],
    ["REPORT_NOT_FOUND", 404, "Report not found"],
    ["REPORT_FLAG_NOT_FOUND", 404, "Report flag not found"],
    ["REPORT_FLAG_ALREADY_PENDING", 409, "A pending flag already exists"],
    ["REPORT_FLAG_STATE_CONFLICT", 409, "Report flag state has changed"],
    ["REPORT_MODERATION_CONFLICT", 409, "Report moderation state has changed"],
    [
      "REPORT_MODERATION_FAILED",
      500,
      "Report moderation could not be completed",
    ],
  ] as const)("maps %s safely", async (code, status, message) => {
    const response = moderationErrorResponse(new ModerationError(code));

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({
      error: { code, message },
    });
  });

  it("delegates only authentication-required errors", async () => {
    const response = moderationErrorResponse(
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

  it("returns the fixed invalid request response with optional fields", async () => {
    const schema = z.strictObject({ reason: z.literal("privacy_concern") });
    const failure = schema.safeParse({ reason: "wrong" });
    expect(failure.success).toBe(false);
    if (failure.success) throw new Error("Expected validation failure");

    const response = invalidModerationResponse(failure.error);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Moderation request is invalid",
        fields: { reason: expect.any(Array) },
      },
    });

    await expect(invalidModerationResponse().json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Moderation request is invalid",
      },
    });
  });

  it("recognizes only the named pending-flag index", () => {
    expect(
      isPendingReportFlagDuplicate({
        code: 11000,
        index: PENDING_REPORT_FLAG_INDEX,
      }),
    ).toBe(true);
    expect(
      isPendingReportFlagDuplicate({
        code: 11000,
        indexName: PENDING_REPORT_FLAG_INDEX,
      }),
    ).toBe(true);
    expect(
      isPendingReportFlagDuplicate({
        code: 11000,
        message: `duplicate key index: ${PENDING_REPORT_FLAG_INDEX}`,
      }),
    ).toBe(true);
    expect(
      isPendingReportFlagDuplicate({
        code: 11000,
        index: "another_unique_index",
      }),
    ).toBe(false);
    expect(
      isPendingReportFlagDuplicate({
        code: 11000,
        keyPattern: { reportId: 1 },
      }),
    ).toBe(false);
    expect(
      isPendingReportFlagDuplicate({
        code: "11000",
        index: PENDING_REPORT_FLAG_INDEX,
      }),
    ).toBe(false);
  });

  it("redacts unknown and unrelated Auth failures", async () => {
    for (const failure of [
      new Error("mongodb://private-host/raw-value"),
      new AuthError("ACCOUNT_UNAVAILABLE"),
    ]) {
      const response = moderationErrorResponse(failure);
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({
        error: {
          code: "REPORT_MODERATION_FAILED",
          message: "Report moderation could not be completed",
        },
      });
      expect(JSON.stringify(body)).not.toMatch(/private-host|ACCOUNT_UNAVAILABLE/);
    }
  });
});
