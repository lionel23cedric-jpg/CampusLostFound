import { z, type ZodError } from "zod";

import { AuthError, authErrorResponse } from "@/lib/auth/errors";
import { PENDING_REPORT_FLAG_INDEX } from "@/models/report-flag";

const definitions = {
  ACTIVE_ACCOUNT_REQUIRED: {
    status: 403,
    message: "An active account is required",
  },
  ADMINISTRATOR_REQUIRED: {
    status: 403,
    message: "Administrator access required",
  },
  REPORT_FLAG_FORBIDDEN: {
    status: 403,
    message: "Report cannot be flagged",
  },
  REPORT_NOT_FOUND: {
    status: 404,
    message: "Report not found",
  },
  REPORT_FLAG_NOT_FOUND: {
    status: 404,
    message: "Report flag not found",
  },
  REPORT_FLAG_ALREADY_PENDING: {
    status: 409,
    message: "A pending flag already exists",
  },
  REPORT_FLAG_STATE_CONFLICT: {
    status: 409,
    message: "Report flag state has changed",
  },
  REPORT_MODERATION_CONFLICT: {
    status: 409,
    message: "Report moderation state has changed",
  },
  REPORT_MODERATION_FAILED: {
    status: 500,
    message: "Report moderation could not be completed",
  },
} as const;

export type ModerationErrorCode = keyof typeof definitions;

export class ModerationError extends Error {
  readonly code: ModerationErrorCode;
  readonly status: number;

  constructor(code: ModerationErrorCode) {
    const definition = definitions[code];
    super(definition.message);
    this.name = "ModerationError";
    this.code = code;
    this.status = definition.status;
  }
}

export function invalidModerationResponse(error?: ZodError) {
  const fields = error ? z.flattenError(error).fieldErrors : undefined;
  const includeFields = fields && Object.keys(fields).length > 0;

  return Response.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Moderation request is invalid",
        ...(includeFields ? { fields } : {}),
      },
    },
    { status: 400 },
  );
}

export function moderationErrorResponse(error: unknown) {
  if (
    error instanceof AuthError &&
    error.code === "AUTHENTICATION_REQUIRED"
  ) {
    return authErrorResponse(new AuthError("AUTHENTICATION_REQUIRED"));
  }

  const code = error instanceof ModerationError ? error.code : undefined;
  const safe =
    code !== undefined && Object.hasOwn(definitions, code)
      ? new ModerationError(code)
      : new ModerationError("REPORT_MODERATION_FAILED");

  return Response.json(
    { error: { code: safe.code, message: safe.message } },
    { status: safe.status },
  );
}

export function isPendingReportFlagDuplicate(error: unknown) {
  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    error.code !== 11000
  ) {
    return false;
  }

  const record = error as {
    index?: unknown;
    indexName?: unknown;
    message?: unknown;
  };
  return (
    record.index === PENDING_REPORT_FLAG_INDEX ||
    record.indexName === PENDING_REPORT_FLAG_INDEX ||
    (typeof record.message === "string" &&
      record.message.includes(PENDING_REPORT_FLAG_INDEX))
  );
}
