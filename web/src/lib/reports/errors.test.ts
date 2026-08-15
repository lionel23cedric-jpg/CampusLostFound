import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AuthError } from "@/lib/auth/errors";

import {
  invalidReportQueryResponse,
  invalidReportResponse,
  referenceDataErrorResponse,
  ReportError,
  reportBrowseErrorResponse,
  reportErrorResponse,
} from "./errors";

describe("report errors", () => {
  it("returns flattened fields only for schema validation", async () => {
    const parsed = z.strictObject({ title: z.string().min(5) }).safeParse({
      title: "x",
    });
    if (parsed.success) throw new Error("Expected validation to fail");

    const response = invalidReportResponse(parsed.error);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid report",
        fields: { title: expect.any(Array) },
      },
    });
  });

  it.each([
    [
      "REPORT_CREATION_FORBIDDEN",
      403,
      "Only active student accounts can create reports",
    ],
    ["CATEGORY_UNAVAILABLE", 422, "Category is unavailable"],
    [
      "CAMPUS_LOCATION_UNAVAILABLE",
      422,
      "Campus location is unavailable",
    ],
  ] as const)("maps %s exactly", async (code, status, message) => {
    const response = reportErrorResponse(new ReportError(code));

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({
      error: { code, message },
    });
  });

  it("reuses the authentication-required response", async () => {
    const response = reportErrorResponse(
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

  it("hides unknown creation and reference-data failures", async () => {
    const creation = reportErrorResponse(new Error("database details"));
    const reference = referenceDataErrorResponse(
      new SyntaxError("internal parser details"),
    );

    expect(creation.status).toBe(500);
    await expect(creation.json()).resolves.toEqual({
      error: {
        code: "REPORT_CREATION_FAILED",
        message: "Unable to create report",
      },
    });
    expect(reference.status).toBe(500);
    await expect(reference.json()).resolves.toEqual({
      error: {
        code: "REFERENCE_DATA_FAILED",
        message: "Unable to load reference data",
      },
    });
  });

  it("returns exact browse validation fields", async () => {
    const parsed = z
      .strictObject({ page: z.string().regex(/^[1-9]\d*$/) })
      .safeParse({ page: "0" });
    if (parsed.success) throw new Error("Expected validation to fail");

    const response = invalidReportQueryResponse(parsed.error);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid report query",
        fields: { page: expect.any(Array) },
      },
    });
  });

  it("omits browse validation fields when none are available", async () => {
    const parsed = z.string().min(2).safeParse("x");
    if (parsed.success) throw new Error("Expected validation to fail");

    const responses = [
      invalidReportQueryResponse(),
      invalidReportQueryResponse(parsed.error),
    ];

    for (const response of responses) {
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid report query",
        },
      });
    }
  });

  it("maps browse authentication, not found and unknown failures safely", async () => {
    const authentication = reportBrowseErrorResponse(
      new AuthError("AUTHENTICATION_REQUIRED"),
    );
    const missing = reportBrowseErrorResponse(
      new ReportError("REPORT_NOT_FOUND"),
    );
    const unknown = reportBrowseErrorResponse(
      new Error("mongodb secret detail"),
    );

    expect(authentication.status).toBe(401);
    await expect(authentication.json()).resolves.toEqual({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Authentication required",
      },
    });
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toEqual({
      error: { code: "REPORT_NOT_FOUND", message: "Report not found" },
    });
    expect(unknown.status).toBe(500);
    const body = await unknown.json();
    expect(body).toEqual({
      error: {
        code: "REPORT_BROWSE_FAILED",
        message: "Unable to load reports",
      },
    });
    expect(JSON.stringify(body)).not.toContain("mongodb secret detail");
  });

  it.each([
    "ACCOUNT_UNAVAILABLE",
    "EMAIL_ALREADY_REGISTERED",
    "INVALID_CREDENTIALS",
    "AUTHENTICATION_FAILED",
  ] as const)("hides unrelated %s errors from browse routes", async (code) => {
    const response = reportBrowseErrorResponse(new AuthError(code));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "REPORT_BROWSE_FAILED",
        message: "Unable to load reports",
      },
    });
  });

  it.each([
    "REPORT_CREATION_FORBIDDEN",
    "CATEGORY_UNAVAILABLE",
    "CAMPUS_LOCATION_UNAVAILABLE",
    "REPORT_CREATION_FAILED",
    "REFERENCE_DATA_FAILED",
  ] as const)("hides unrelated %s errors from browse routes", async (code) => {
    const response = reportBrowseErrorResponse(new ReportError(code));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "REPORT_BROWSE_FAILED",
        message: "Unable to load reports",
      },
    });
  });

  it.each([
    "REFERENCE_DATA_FAILED",
    "REPORT_NOT_FOUND",
    "REPORT_BROWSE_FAILED",
  ] as const)("hides unrelated %s errors from report creation", async (code) => {
    const response = reportErrorResponse(new ReportError(code));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "REPORT_CREATION_FAILED",
        message: "Unable to create report",
      },
    });
  });

  it.each([
    "ACCOUNT_UNAVAILABLE",
    "EMAIL_ALREADY_REGISTERED",
    "INVALID_CREDENTIALS",
    "AUTHENTICATION_FAILED",
  ] as const)("hides unrelated %s errors from report creation", async (code) => {
    const response = reportErrorResponse(new AuthError(code));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "REPORT_CREATION_FAILED",
        message: "Unable to create report",
      },
    });
  });

  it("preserves only authentication-required and reference-data errors for reference routes", async () => {
    const authentication = referenceDataErrorResponse(
      new AuthError("AUTHENTICATION_REQUIRED"),
    );
    const reference = referenceDataErrorResponse(
      new ReportError("REFERENCE_DATA_FAILED"),
    );

    expect(authentication.status).toBe(401);
    await expect(authentication.json()).resolves.toEqual({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Authentication required",
      },
    });
    expect(reference.status).toBe(500);
    await expect(reference.json()).resolves.toEqual({
      error: {
        code: "REFERENCE_DATA_FAILED",
        message: "Unable to load reference data",
      },
    });
  });

  it.each([
    new AuthError("ACCOUNT_UNAVAILABLE"),
    new AuthError("EMAIL_ALREADY_REGISTERED"),
    new AuthError("INVALID_CREDENTIALS"),
    new AuthError("AUTHENTICATION_FAILED"),
    new ReportError("REPORT_CREATION_FORBIDDEN"),
    new ReportError("CATEGORY_UNAVAILABLE"),
    new ReportError("CAMPUS_LOCATION_UNAVAILABLE"),
    new ReportError("REPORT_CREATION_FAILED"),
    new ReportError("REPORT_NOT_FOUND"),
    new ReportError("REPORT_BROWSE_FAILED"),
  ])("hides unrelated errors from reference routes", async (error) => {
    const response = referenceDataErrorResponse(error);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "REFERENCE_DATA_FAILED",
        message: "Unable to load reference data",
      },
    });
  });
});
