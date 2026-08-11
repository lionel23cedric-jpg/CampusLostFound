import { z, type ZodError } from "zod";

const errorDefinitions = {
  INVALID_CREDENTIALS: {
    message: "Invalid email or password",
    status: 401,
  },
  ACCOUNT_UNAVAILABLE: {
    message: "Account is unavailable",
    status: 403,
  },
  EMAIL_ALREADY_REGISTERED: {
    message: "Email is already registered",
    status: 409,
  },
  AUTHENTICATION_REQUIRED: {
    message: "Authentication required",
    status: 401,
  },
  AUTHENTICATION_FAILED: {
    message: "Unable to complete authentication request",
    status: 500,
  },
} as const;

export type AuthErrorCode = keyof typeof errorDefinitions;

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number;

  constructor(code: AuthErrorCode) {
    const definition = errorDefinitions[code];
    super(definition.message);
    this.name = "AuthError";
    this.code = code;
    this.status = definition.status;
  }
}

export function invalidRequestResponse(error?: ZodError) {
  const fields = error ? z.flattenError(error).fieldErrors : undefined;

  return Response.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request",
        ...(fields ? { fields } : {}),
      },
    },
    { status: 400 },
  );
}

export function authErrorResponse(error: unknown) {
  const safeError =
    error instanceof AuthError
      ? error
      : new AuthError("AUTHENTICATION_FAILED");

  return Response.json(
    {
      error: {
        code: safeError.code,
        message: safeError.message,
      },
    },
    { status: safeError.status },
  );
}
