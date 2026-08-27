import { describe, expect, it } from "vitest";

import { AuthError } from "@/lib/auth/errors";

import {
  ReferenceDataManagementError,
  invalidReferenceDataResponse,
  isDuplicateKeyError,
  referenceDataManagementErrorResponse,
} from "./reference-data-errors";

describe("reference data management errors", () => {
  it.each([
    ["ADMINISTRATOR_REQUIRED", 403, "Administrator access required"],
    ["REFERENCE_DATA_NOT_FOUND", 404, "Reference data not found"],
    ["REFERENCE_DATA_DUPLICATE", 409, "Reference data already exists"],
    ["REFERENCE_DATA_STATE_CONFLICT", 409, "Reference data has changed"],
    ["REFERENCE_DATA_OPERATION_FAILED", 500, "Reference data operation failed"],
  ] as const)("maps %s safely", async (code, status, message) => {
    const response = referenceDataManagementErrorResponse(
      new ReferenceDataManagementError(code),
    );
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: { code, message } });
  });

  it("maps authentication and invalid requests exactly", async () => {
    expect(
      referenceDataManagementErrorResponse(
        new AuthError("AUTHENTICATION_REQUIRED"),
      ).status,
    ).toBe(401);
    const invalid = invalidReferenceDataResponse();
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({
      error: {
        code: "INVALID_REFERENCE_DATA_REQUEST",
        message: "Reference data request is invalid",
      },
    });
  });

  it("redacts unknown failures and recognizes only code 11000", async () => {
    const response = referenceDataManagementErrorResponse(
      new Error("mongodb://private-host stack detail"),
    );
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("private-host");
    expect(isDuplicateKeyError({ code: 11000 })).toBe(true);
    expect(isDuplicateKeyError({ code: "11000" })).toBe(false);
  });
});
