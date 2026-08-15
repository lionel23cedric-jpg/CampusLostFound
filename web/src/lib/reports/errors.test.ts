import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AuthError } from "@/lib/auth/errors";

import {
  invalidReportResponse,
  referenceDataErrorResponse,
  ReportError,
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
});
