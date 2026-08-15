import { z, type ZodError } from "zod";

import { AuthError, authErrorResponse } from "@/lib/auth/errors";

const reportErrorDefinitions = {
  REPORT_CREATION_FORBIDDEN: {
    message: "Only active student accounts can create reports",
    status: 403,
  },
  CATEGORY_UNAVAILABLE: {
    message: "Category is unavailable",
    status: 422,
  },
  CAMPUS_LOCATION_UNAVAILABLE: {
    message: "Campus location is unavailable",
    status: 422,
  },
  REPORT_CREATION_FAILED: {
    message: "Unable to create report",
    status: 500,
  },
  REFERENCE_DATA_FAILED: {
    message: "Unable to load reference data",
    status: 500,
  },
  REPORT_NOT_FOUND: {
    message: "Report not found",
    status: 404,
  },
  REPORT_BROWSE_FAILED: {
    message: "Unable to load reports",
    status: 500,
  },
} as const;

export type ReportErrorCode = keyof typeof reportErrorDefinitions;

const reportCreationErrorCodes = new Set<ReportErrorCode>([
  "REPORT_CREATION_FORBIDDEN",
  "CATEGORY_UNAVAILABLE",
  "CAMPUS_LOCATION_UNAVAILABLE",
  "REPORT_CREATION_FAILED",
]);

const referenceDataErrorCodes = new Set<ReportErrorCode>([
  "REFERENCE_DATA_FAILED",
]);

const reportBrowseErrorCodes = new Set<ReportErrorCode>([
  "REPORT_NOT_FOUND",
  "REPORT_BROWSE_FAILED",
]);

export class ReportError extends Error {
  readonly code: ReportErrorCode;
  readonly status: number;

  constructor(code: ReportErrorCode) {
    const definition = reportErrorDefinitions[code];
    super(definition.message);
    this.name = "ReportError";
    this.code = code;
    this.status = definition.status;
  }
}

export function invalidReportResponse(error?: ZodError) {
  const fields = error ? z.flattenError(error).fieldErrors : undefined;

  return Response.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid report",
        ...(fields ? { fields } : {}),
      },
    },
    { status: 400 },
  );
}

function safeReportErrorResponse(error: ReportError) {
  return Response.json(
    { error: { code: error.code, message: error.message } },
    { status: error.status },
  );
}

function isAuthenticationRequired(error: unknown): error is AuthError {
  return (
    error instanceof AuthError && error.code === "AUTHENTICATION_REQUIRED"
  );
}

function safeDomainError(
  error: unknown,
  allowedCodes: ReadonlySet<ReportErrorCode>,
  fallbackCode: ReportErrorCode,
) {
  return error instanceof ReportError && allowedCodes.has(error.code)
    ? error
    : new ReportError(fallbackCode);
}

export function reportErrorResponse(error: unknown) {
  if (isAuthenticationRequired(error)) return authErrorResponse(error);

  return safeReportErrorResponse(
    safeDomainError(
      error,
      reportCreationErrorCodes,
      "REPORT_CREATION_FAILED",
    ),
  );
}

export function referenceDataErrorResponse(error: unknown) {
  if (isAuthenticationRequired(error)) return authErrorResponse(error);

  return safeReportErrorResponse(
    safeDomainError(error, referenceDataErrorCodes, "REFERENCE_DATA_FAILED"),
  );
}

export function invalidReportQueryResponse(error?: ZodError) {
  const fields = error ? z.flattenError(error).fieldErrors : undefined;
  const includeFields = fields && Object.keys(fields).length > 0;

  return Response.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid report query",
        ...(includeFields ? { fields } : {}),
      },
    },
    { status: 400 },
  );
}

export function reportBrowseErrorResponse(error: unknown) {
  if (isAuthenticationRequired(error)) return authErrorResponse(error);

  return safeReportErrorResponse(
    safeDomainError(error, reportBrowseErrorCodes, "REPORT_BROWSE_FAILED"),
  );
}
