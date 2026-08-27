import { AuthError, authErrorResponse } from "@/lib/auth/errors";

const definitions = {
  ADMINISTRATOR_REQUIRED: {
    status: 403,
    message: "Administrator access required",
  },
  REFERENCE_DATA_NOT_FOUND: {
    status: 404,
    message: "Reference data not found",
  },
  REFERENCE_DATA_DUPLICATE: {
    status: 409,
    message: "Reference data already exists",
  },
  REFERENCE_DATA_STATE_CONFLICT: {
    status: 409,
    message: "Reference data has changed",
  },
  REFERENCE_DATA_OPERATION_FAILED: {
    status: 500,
    message: "Reference data operation failed",
  },
} as const;

export type ReferenceDataManagementErrorCode = keyof typeof definitions;

export class ReferenceDataManagementError extends Error {
  readonly code: ReferenceDataManagementErrorCode;
  readonly status: number;

  constructor(code: ReferenceDataManagementErrorCode) {
    const definition = definitions[code];
    super(definition.message);
    this.name = "ReferenceDataManagementError";
    this.code = code;
    this.status = definition.status;
  }
}

export function isDuplicateKeyError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

export function invalidReferenceDataResponse() {
  return Response.json(
    {
      error: {
        code: "INVALID_REFERENCE_DATA_REQUEST",
        message: "Reference data request is invalid",
      },
    },
    { status: 400 },
  );
}

export function referenceDataManagementErrorResponse(error: unknown) {
  if (error instanceof AuthError && error.code === "AUTHENTICATION_REQUIRED") {
    return authErrorResponse(new AuthError("AUTHENTICATION_REQUIRED"));
  }
  const code: unknown =
    error instanceof ReferenceDataManagementError ? error.code : undefined;
  const safe =
    typeof code === "string" && Object.hasOwn(definitions, code)
      ? new ReferenceDataManagementError(
          code as ReferenceDataManagementErrorCode,
        )
      : new ReferenceDataManagementError("REFERENCE_DATA_OPERATION_FAILED");
  return Response.json(
    { error: { code: safe.code, message: safe.message } },
    { status: safe.status },
  );
}
