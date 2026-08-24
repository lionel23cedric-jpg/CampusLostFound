import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AuthError } from "@/lib/auth/errors";

import { ClaimError, claimErrorResponse, invalidClaimResponse } from "./errors";

describe("claim error responses", () => {
  it("returns field errors for invalid claim input", async () => {
    const parsed = z
      .strictObject({ answer: z.string().min(1) })
      .safeParse({ answer: "" });
    if (parsed.success) throw new Error("Expected invalid fixture");

    const response = invalidClaimResponse(parsed.error);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid claim request",
        fields: { answer: expect.any(Array) },
      },
    });
  });

  it("omits fields when validation has no field-level errors", async () => {
    const parsed = z.string().min(1).safeParse("");
    if (parsed.success) throw new Error("Expected invalid fixture");

    const response = invalidClaimResponse(parsed.error);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid claim request",
      },
    });
  });

  it.each([
    ["VALIDATION_ERROR", 400, "Invalid claim request"],
    ["CLAIM_FORBIDDEN", 403, "Claim action is not permitted"],
    ["CLAIM_NOT_FOUND", 404, "Claim not found"],
    ["CLAIM_ALREADY_EXISTS", 409, "An active claim already exists"],
    ["REPORT_NOT_CLAIMABLE", 409, "Report is not available for claiming"],
    ["CLAIM_STATE_CONFLICT", 409, "Claim state has changed"],
  ] as const)("maps %s", async (code, status, message) => {
    const response = claimErrorResponse(new ClaimError(code));

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({
      error: { code, message },
    });
  });

  it("preserves only authentication-required AuthErrors", async () => {
    const response = claimErrorResponse(
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

  it("uses canonical authentication details for a mutated subclass", async () => {
    class TamperedAuthError extends AuthError {
      constructor() {
        super("AUTHENTICATION_REQUIRED");
        this.message = "private authentication detail";
        Reflect.set(this, "status", 299);
      }
    }

    const response = claimErrorResponse(new TamperedAuthError());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Authentication required",
      },
    });
  });

  it("uses canonical claim details for a mutated subclass", async () => {
    class TamperedClaimError extends ClaimError {
      constructor() {
        super("CLAIM_NOT_FOUND");
        this.message = "private claim detail";
        Reflect.set(this, "status", 299);
      }
    }

    const response = claimErrorResponse(new TamperedClaimError());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: "CLAIM_NOT_FOUND", message: "Claim not found" },
    });
  });

  it("hides a claim error whose code is mutated to an inherited key", async () => {
    const failure = new ClaimError("CLAIM_NOT_FOUND");
    failure.message = "private claim detail";
    Reflect.set(failure, "status", 299);
    Reflect.set(failure, "code", "toString");

    const response = claimErrorResponse(failure);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "CLAIM_OPERATION_FAILED",
        message: "Claim operation failed",
      },
    });
  });

  it.each([
    new Error("mongodb private detail"),
    new SyntaxError("internal parser detail"),
    new AuthError("INVALID_CREDENTIALS"),
    new AuthError("ACCOUNT_UNAVAILABLE"),
    new AuthError("EMAIL_ALREADY_REGISTERED"),
    new AuthError("AUTHENTICATION_FAILED"),
  ])("hides unknown or disallowed failures", async (failure) => {
    const response = claimErrorResponse(failure);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: "CLAIM_OPERATION_FAILED",
        message: "Claim operation failed",
      },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /mongodb private detail|internal parser detail|Invalid email or password|Account is unavailable|Email is already registered|Unable to complete authentication request/,
    );
  });
});
