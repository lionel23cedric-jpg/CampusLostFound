import { z, type ZodError } from "zod";

import { AuthError, authErrorResponse } from "@/lib/auth/errors";

const definitions = {
  STAFF_REPORT_FORBIDDEN: {
    status: 403,
    message: "Staff report access is not permitted",
  },
  STAFF_REPORT_NOT_FOUND: {
    status: 404,
    message: "Staff report not found",
  },
  STAFF_REPORT_STATE_CONFLICT: {
    status: 409,
    message: "Staff report state has changed",
  },
  STAFF_REPORT_OPERATION_FAILED: {
    status: 500,
    message: "Staff report operation failed",
  },
} as const;

export type StaffReportErrorCode = keyof typeof definitions;

export class StaffReportError extends Error {
  readonly code: StaffReportErrorCode;
  readonly status: number;

  constructor(code: StaffReportErrorCode) {
    const definition = definitions[code];
    super(definition.message);
    this.name = "StaffReportError";
    this.code = code;
    this.status = definition.status;
  }
}

export function invalidStaffReportResponse(error?: ZodError) {
  const fields = error ? z.flattenError(error).fieldErrors : undefined;
  const includeFields = fields && Object.keys(fields).length > 0;
  return Response.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid staff report request",
        ...(includeFields ? { fields } : {}),
      },
    },
    { status: 400 },
  );
}

export function staffReportErrorResponse(error: unknown) {
  if (
    error instanceof AuthError &&
    error.code === "AUTHENTICATION_REQUIRED"
  ) {
    return authErrorResponse(error);
  }

  const safe =
    error instanceof StaffReportError
      ? error
      : new StaffReportError("STAFF_REPORT_OPERATION_FAILED");
  return Response.json(
    { error: { code: safe.code, message: safe.message } },
    { status: safe.status },
  );
}
