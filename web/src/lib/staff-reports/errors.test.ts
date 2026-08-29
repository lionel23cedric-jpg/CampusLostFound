import { describe, expect, it } from "vitest";

import { AuthError } from "@/lib/auth/errors";
import { StaffReportError, invalidStaffReportResponse, staffReportErrorResponse } from "./errors";

async function json(response: Response) {
  return response.json() as Promise<{ error: { code: string; message: string } }>;
}

describe("staff report errors", () => {
  it.each([
    ["STAFF_REPORT_FORBIDDEN", 403, "Staff report access is not permitted"],
    ["STAFF_REPORT_NOT_FOUND", 404, "Staff report not found"],
    ["STAFF_REPORT_STATE_CONFLICT", 409, "Staff report state has changed"],
    ["STAFF_REPORT_OPERATION_FAILED", 500, "Staff report operation failed"],
  ] as const)("maps %s safely", async (code, status, message) => {
    const response = staffReportErrorResponse(new StaffReportError(code));
    expect(response.status).toBe(status);
    expect(await json(response)).toEqual({ error: { code, message } });
  });

  it("preserves only the approved authentication error", async () => {
    const response = staffReportErrorResponse(new AuthError("AUTHENTICATION_REQUIRED"));
    expect(response.status).toBe(401);
    expect(await json(response)).toMatchObject({ error: { code: "AUTHENTICATION_REQUIRED" } });
  });

  it.each([
    new Error("database collection secret"),
    { code: "STAFF_REPORT_NOT_FOUND", message: "forged secret" },
  ])("redacts an untrusted error", async (error) => {
    const response = staffReportErrorResponse(error);
    expect(response.status).toBe(500);
    expect(await json(response)).toEqual({
      error: {
        code: "STAFF_REPORT_OPERATION_FAILED",
        message: "Staff report operation failed",
      },
    });
  });

  it("returns a controlled validation response", async () => {
    const response = invalidStaffReportResponse();
    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Invalid staff report request" },
    });
  });
});
