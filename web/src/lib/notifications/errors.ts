import { z, type ZodError } from "zod";

import { AuthError, authErrorResponse } from "@/lib/auth/errors";

const definitions = {
  NOTIFICATION_FORBIDDEN: {
    status: 403,
    message: "Notification access is not permitted",
  },
  NOTIFICATION_NOT_FOUND: {
    status: 404,
    message: "Notification not found",
  },
  NOTIFICATION_OPERATION_FAILED: {
    status: 500,
    message: "Notification operation failed",
  },
} as const;

export type NotificationErrorCode = keyof typeof definitions;

export class NotificationError extends Error {
  readonly code: NotificationErrorCode;
  readonly status: number;

  constructor(code: NotificationErrorCode) {
    const definition = definitions[code];
    super(definition.message);
    this.name = "NotificationError";
    this.code = code;
    this.status = definition.status;
  }
}

export function invalidNotificationResponse(error?: ZodError) {
  const fields = error ? z.flattenError(error).fieldErrors : undefined;
  const includeFields = fields && Object.keys(fields).length > 0;
  return Response.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid notification request",
        ...(includeFields ? { fields } : {}),
      },
    },
    { status: 400 },
  );
}

export function notificationErrorResponse(error: unknown) {
  if (
    error instanceof AuthError &&
    error.code === "AUTHENTICATION_REQUIRED"
  ) {
    return authErrorResponse(error);
  }
  const code = error instanceof NotificationError ? error.code : undefined;
  const safe =
    code !== undefined && Object.hasOwn(definitions, code)
      ? new NotificationError(code)
      : new NotificationError("NOTIFICATION_OPERATION_FAILED");
  return Response.json(
    { error: { code: safe.code, message: safe.message } },
    { status: safe.status },
  );
}
