import { AuthError, authErrorResponse } from "@/lib/auth/errors";

const matchingErrorDefinitions = {
  REPORT_NOT_FOUND: {
    message: "Report not found",
    status: 404,
  },
  REPORT_NOT_MATCHABLE: {
    message: "Report is not available for matching",
    status: 409,
  },
  MATCHING_FAILED: {
    message: "Unable to find report matches",
    status: 500,
  },
} as const;

export type MatchingErrorCode = keyof typeof matchingErrorDefinitions;

export class MatchingError extends Error {
  readonly code: MatchingErrorCode;
  readonly status: number;

  constructor(code: MatchingErrorCode) {
    const definition = matchingErrorDefinitions[code];
    super(definition.message);
    this.name = "MatchingError";
    this.code = code;
    this.status = definition.status;
  }
}

export function matchingErrorResponse(error: unknown) {
  if (
    error instanceof AuthError &&
    error.code === "AUTHENTICATION_REQUIRED"
  ) {
    return authErrorResponse(error);
  }

  const safeError =
    error instanceof MatchingError
      ? error
      : new MatchingError("MATCHING_FAILED");

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
