import { AuthError, authErrorResponse } from "@/lib/auth/errors";

const definitions = {
  ADMINISTRATOR_REQUIRED: {
    status: 403,
    message: "Administrator access required",
  },
  ADMIN_OVERVIEW_UNAVAILABLE: {
    status: 500,
    message: "Administrator overview is temporarily unavailable",
  },
} as const;

export type AdminOverviewErrorCode = keyof typeof definitions;

export class AdminOverviewError extends Error {
  readonly code: AdminOverviewErrorCode;
  readonly status: number;

  constructor(code: AdminOverviewErrorCode) {
    const definition = definitions[code];
    super(definition.message);
    this.name = "AdminOverviewError";
    this.code = code;
    this.status = definition.status;
  }
}

export function invalidAdminOverviewQueryResponse() {
  return Response.json(
    {
      error: {
        code: "ADMIN_OVERVIEW_INVALID_QUERY",
        message: "Overview query is invalid",
      },
    },
    { status: 400 },
  );
}

export function adminOverviewErrorResponse(error: unknown) {
  if (
    error instanceof AuthError &&
    error.code === "AUTHENTICATION_REQUIRED"
  ) {
    return authErrorResponse(error);
  }

  const safeError =
    error instanceof AdminOverviewError &&
    Object.hasOwn(definitions, error.code)
      ? new AdminOverviewError(error.code)
      : new AdminOverviewError("ADMIN_OVERVIEW_UNAVAILABLE");

  return Response.json(
    { error: { code: safeError.code, message: safeError.message } },
    { status: safeError.status },
  );
}
