import { AuthError, authErrorResponse } from "@/lib/auth/errors";

const definitions = {
  ADMINISTRATOR_REQUIRED: {
    status: 403,
    message: "Administrator access required",
  },
  ACCOUNT_ACTION_FORBIDDEN: {
    status: 403,
    message: "Account action is not permitted",
  },
  ACCOUNT_NOT_FOUND: { status: 404, message: "Account not found" },
  ACCOUNT_STATE_CONFLICT: {
    status: 409,
    message: "Account state has changed or cannot be updated",
  },
  ACCOUNT_OPERATION_FAILED: {
    status: 500,
    message: "Account operation could not be completed",
  },
} as const;

export type AccountManagementErrorCode = keyof typeof definitions;

export class AccountManagementError extends Error {
  readonly code: AccountManagementErrorCode;
  readonly status: number;

  constructor(code: AccountManagementErrorCode) {
    const definition = definitions[code];
    super(definition.message);
    this.name = "AccountManagementError";
    this.code = code;
    this.status = definition.status;
  }
}

export function invalidAccountManagementResponse() {
  return Response.json(
    { error: { code: "VALIDATION_ERROR", message: "Request is invalid" } },
    { status: 400 },
  );
}

export function accountManagementErrorResponse(error: unknown) {
  if (error instanceof AuthError && error.code === "AUTHENTICATION_REQUIRED") {
    return authErrorResponse(new AuthError("AUTHENTICATION_REQUIRED"));
  }

  const code = error instanceof AccountManagementError ? error.code : undefined;
  const safe =
    code !== undefined && Object.hasOwn(definitions, code)
      ? new AccountManagementError(code)
      : new AccountManagementError("ACCOUNT_OPERATION_FAILED");

  return Response.json(
    { error: { code: safe.code, message: safe.message } },
    { status: safe.status },
  );
}
