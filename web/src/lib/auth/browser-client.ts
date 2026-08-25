import { z } from "zod";

import type { PublicUser } from "./public-user";
import type { LoginInput, RegisterInput } from "./validation";
import {
  editableProfileSchema,
  type EditableProfile,
  type UpdateProfileInput,
} from "@/lib/profile/validation";

const publicUserSchema = z.strictObject({
  id: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["student", "staff", "administrator"]),
  status: z.enum(["active", "suspended", "deactivated"]),
  emailVerifiedAt: z.string().datetime({ offset: true }).nullable(),
  lastLoginAt: z.string().datetime({ offset: true }).nullable(),
  profile: z.strictObject({
    displayName: z.string().min(1),
    preferredContactMethod: z.enum(["in_app", "email"]),
    preferredCampusLocationIds: z.array(z.string()),
    notificationSettings: z.strictObject({
      possibleMatches: z.boolean(),
      claimUpdates: z.boolean(),
      statusChanges: z.boolean(),
      handoverInstructions: z.boolean(),
    }),
  }),
});

const userResponseSchema = z.strictObject({ user: publicUserSchema });

const editableProfileResponseSchema = z.strictObject({
  profile: editableProfileSchema,
});

const updateProfileResponseSchema = z.strictObject({
  user: publicUserSchema,
  profileUpdatedAt: z.string().datetime({ offset: true }),
});

const errorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.string().min(1),
    message: z.string().min(1),
    fields: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

export type PublicFieldErrors = Record<string, string[]>;

export class BrowserAuthError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields?: PublicFieldErrors;

  constructor(options: {
    code: string;
    status: number;
    message: string;
    fields?: PublicFieldErrors;
  }) {
    super(options.message);
    this.name = "BrowserAuthError";
    this.code = options.code;
    this.status = options.status;
    this.fields = options.fields;
  }
}

function requestFailedError(status: number) {
  return new BrowserAuthError({
    code: "REQUEST_FAILED",
    status,
    message: "We could not complete that request. Please try again.",
  });
}

function networkError() {
  return new BrowserAuthError({
    code: "NETWORK_ERROR",
    status: 0,
    message: "We could not reach the service. Please try again.",
  });
}

async function fetchSameOrigin(path: string, init: RequestInit) {
  try {
    return await fetch(path, { ...init, credentials: "same-origin" });
  } catch {
    throw networkError();
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw requestFailedError(response.status);
  }
}

async function responseError(response: Response): Promise<BrowserAuthError> {
  try {
    const parsed = errorResponseSchema.safeParse(await response.json());
    if (parsed.success) {
      return new BrowserAuthError({
        code: parsed.data.error.code,
        status: response.status,
        message: parsed.data.error.message,
        fields: parsed.data.error.fields,
      });
    }
  } catch {
    // A non-JSON error body is deliberately treated as a generic public failure.
  }

  return requestFailedError(response.status);
}

async function parseResponse<T>(response: Response, schema: z.ZodType<T>) {
  if (!response.ok) {
    throw await responseError(response);
  }

  const parsed = schema.safeParse(await readJson(response));
  if (!parsed.success) {
    throw requestFailedError(response.status);
  }

  return parsed.data;
}

async function userFromResponse(response: Response): Promise<PublicUser> {
  const result = await parseResponse(response, userResponseSchema);
  return result.user as PublicUser;
}

export async function registerAccount(
  input: RegisterInput,
): Promise<PublicUser> {
  const response = await fetchSameOrigin("/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  return userFromResponse(response);
}

export async function loginAccount(input: LoginInput): Promise<PublicUser> {
  const response = await fetchSameOrigin("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  return userFromResponse(response);
}

export async function getCurrentAccount(): Promise<PublicUser | null> {
  const response = await fetchSameOrigin("/api/auth/me", { method: "GET" });
  if (response.status === 401) {
    return null;
  }

  return userFromResponse(response);
}

export async function logoutAccount(): Promise<void> {
  const response = await fetchSameOrigin("/api/auth/logout", { method: "POST" });
  if (response.status === 204) {
    return;
  }

  throw await responseError(response);
}

export async function getProfileSettings(): Promise<EditableProfile> {
  const response = await fetchSameOrigin("/api/profile", { method: "GET" });
  return (await parseResponse(response, editableProfileResponseSchema)).profile;
}

export async function updateProfileSettings(input: UpdateProfileInput) {
  const response = await fetchSameOrigin("/api/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  return parseResponse(response, updateProfileResponseSchema);
}
