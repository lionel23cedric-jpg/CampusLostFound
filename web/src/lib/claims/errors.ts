import { AuthError, authErrorResponse } from "@/lib/auth/errors";
import { z, type ZodError } from "zod";

const definitions = {
  VALIDATION_ERROR: { message: "Invalid claim request", status: 400 },
  CLAIM_FORBIDDEN: { message: "Claim action is not permitted", status: 403 },
  CLAIM_NOT_FOUND: { message: "Claim not found", status: 404 },
  CLAIM_ALREADY_EXISTS: {
    message: "An active claim already exists",
    status: 409,
  },
  REPORT_NOT_CLAIMABLE: {
    message: "Report is not available for claiming",
    status: 409,
  },
  CLAIM_STATE_CONFLICT: { message: "Claim state has changed", status: 409 },
  CLAIM_OPERATION_FAILED: { message: "Claim operation failed", status: 500 },
} as const;

export type ClaimErrorCode = keyof typeof definitions;

export class ClaimError extends Error {
  readonly code: ClaimErrorCode;
  readonly status: number;

  constructor(code: ClaimErrorCode) {
    const definition = definitions[code];
    super(definition.message);
    this.name = "ClaimError";
    this.code = code;
    this.status = definition.status;
  }
}

export function invalidClaimResponse(error?: ZodError) {
  const fields = error ? z.flattenError(error).fieldErrors : undefined;
  const includeFields = fields && Object.keys(fields).length > 0;

  return Response.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid claim request",
        ...(includeFields ? { fields } : {}),
      },
    },
    { status: 400 },
  );
}

export function claimErrorResponse(error: unknown) {
  if (
    error instanceof AuthError &&
    error.code === "AUTHENTICATION_REQUIRED"
  ) {
    return authErrorResponse(new AuthError("AUTHENTICATION_REQUIRED"));
  }

  const code = error instanceof ClaimError ? error.code : undefined;
  const safe =
    code !== undefined && Object.hasOwn(definitions, code)
      ? new ClaimError(code)
      : new ClaimError("CLAIM_OPERATION_FAILED");

  return Response.json(
    { error: { code: safe.code, message: safe.message } },
    { status: safe.status },
  );
}
