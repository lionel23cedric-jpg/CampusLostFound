import { z, type ZodError } from "zod";

import { AuthError, authErrorResponse } from "@/lib/auth/errors";

const profileErrorDefinitions = {
  PROFILE_CHANGED: {
    message: "Profile settings changed in another session",
    status: 409,
  },
  PROFILE_FAILED: {
    message: "Unable to manage profile settings",
    status: 500,
  },
} as const;

const approvedFieldNames = new Set([
  "displayName",
  "preferredContactMethod",
  "preferredCampusLocationIds",
  "notificationSettings",
  "expectedUpdatedAt",
]);

export type ProfileErrorCode = keyof typeof profileErrorDefinitions;

export class ProfileError extends Error {
  readonly code: ProfileErrorCode;
  readonly status: number;

  constructor(code: ProfileErrorCode) {
    const definition = profileErrorDefinitions[code];
    super(definition.message);
    this.name = "ProfileError";
    this.code = code;
    this.status = definition.status;
  }
}

export class InvalidProfileError extends Error {
  readonly fields: Readonly<Record<string, readonly string[]>>;

  constructor(fields: Readonly<Record<string, readonly string[]>>) {
    super("Invalid profile settings");
    this.name = "InvalidProfileError";
    this.fields = fields;
  }
}

function safeFieldErrors(
  fields: Readonly<Record<string, readonly string[] | undefined>> | undefined,
) {
  if (!fields) return undefined;

  const safeFields = Object.fromEntries(
    Object.entries(fields).filter(
      ([field, messages]) =>
        approvedFieldNames.has(field) && messages && messages.length > 0,
    ),
  );

  return Object.keys(safeFields).length > 0 ? safeFields : undefined;
}

function validationResponse(
  fields?: Readonly<Record<string, readonly string[] | undefined>>,
) {
  const safeFields = safeFieldErrors(fields);

  return Response.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid profile settings",
        ...(safeFields ? { fields: safeFields } : {}),
      },
    },
    { status: 400 },
  );
}

export function invalidProfileResponse(error?: ZodError) {
  return validationResponse(error ? z.flattenError(error).fieldErrors : undefined);
}

export function profileErrorResponse(error: unknown) {
  if (error instanceof InvalidProfileError) {
    return validationResponse(error.fields);
  }

  if (
    error instanceof AuthError &&
    error.code === "AUTHENTICATION_REQUIRED"
  ) {
    return authErrorResponse(error);
  }

  const safeError =
    error instanceof ProfileError &&
    Object.hasOwn(profileErrorDefinitions, error.code)
      ? new ProfileError(error.code)
      : new ProfileError("PROFILE_FAILED");

  return Response.json(
    { error: { code: safeError.code, message: safeError.message } },
    { status: safeError.status },
  );
}
