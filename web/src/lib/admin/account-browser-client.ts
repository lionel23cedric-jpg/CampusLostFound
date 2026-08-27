import { z } from "zod";

import {
  managedBrowserAccountPageSchema,
  managedBrowserAccountResponseSchema,
  type AccountBrowserQuery,
  type AccountBrowserStatusInput,
} from "./account-browser-contract";

const GENERIC_MESSAGE = "Account management is temporarily unavailable";
const approvedErrors = {
  VALIDATION_ERROR: { status: 400, message: "Request is invalid" },
  AUTHENTICATION_REQUIRED: { status: 401, message: "Authentication required" },
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

export type BrowserAccountManagementErrorCode = keyof typeof approvedErrors;

const errorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum([
      "VALIDATION_ERROR",
      "AUTHENTICATION_REQUIRED",
      "ADMINISTRATOR_REQUIRED",
      "ACCOUNT_ACTION_FORBIDDEN",
      "ACCOUNT_NOT_FOUND",
      "ACCOUNT_STATE_CONFLICT",
      "ACCOUNT_OPERATION_FAILED",
    ]),
    message: z.string(),
  }),
});

export class BrowserAccountManagementError extends Error {
  readonly code: BrowserAccountManagementErrorCode;
  readonly status: number;

  constructor(code: BrowserAccountManagementErrorCode, status?: number) {
    const definition = approvedErrors[code];
    super(
      code === "ACCOUNT_OPERATION_FAILED"
        ? GENERIC_MESSAGE
        : definition.message,
    );
    this.name = "BrowserAccountManagementError";
    this.code = code;
    this.status = status ?? definition.status;
  }
}

function unavailable(status: number) {
  return new BrowserAccountManagementError("ACCOUNT_OPERATION_FAILED", status);
}

function abortError(error: unknown, signal?: AbortSignal) {
  if (error instanceof DOMException && error.name === "AbortError") {
    return error;
  }
  if (signal?.aborted) {
    return new DOMException("The operation was aborted", "AbortError");
  }
}

async function readJson(
  response: Response,
  signal?: AbortSignal,
): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    const aborted = abortError(error, signal);
    if (aborted) throw aborted;
    throw unavailable(response.status);
  }
}

async function responseError(response: Response, signal?: AbortSignal) {
  const parsed = errorResponseSchema.safeParse(await readJson(response, signal));
  if (!parsed.success) return unavailable(response.status);
  const definition = approvedErrors[parsed.data.error.code];
  if (
    response.status !== definition.status ||
    parsed.data.error.message !== definition.message
  ) {
    return unavailable(response.status);
  }
  return new BrowserAccountManagementError(parsed.data.error.code);
}

async function safeFetch(input: RequestInfo | URL, init: RequestInit) {
  try {
    return await fetch(input, init);
  } catch (error) {
    const aborted = abortError(error, init.signal ?? undefined);
    if (aborted) throw aborted;
    throw unavailable(0);
  }
}

export async function listAdministratorAccounts(
  query: AccountBrowserQuery,
  signal?: AbortSignal,
) {
  const search = new URLSearchParams();
  if (query.q !== undefined) search.set("q", query.q);
  if (query.role !== undefined) search.set("role", query.role);
  if (query.status !== undefined) search.set("status", query.status);
  search.set("page", String(query.page));

  const response = await safeFetch(`/api/admin/accounts?${search}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw await responseError(response, signal);
  const parsed = managedBrowserAccountPageSchema.safeParse(
    await readJson(response, signal),
  );
  if (!parsed.success) throw unavailable(response.status);
  return parsed.data;
}

export async function updateAdministratorAccountStatus(
  userId: string,
  input: AccountBrowserStatusInput,
  signal?: AbortSignal,
) {
  const response = await safeFetch(
    `/api/admin/accounts/${encodeURIComponent(userId)}/status`,
    {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify(input),
      signal,
    },
  );
  if (!response.ok) throw await responseError(response, signal);
  const parsed = managedBrowserAccountResponseSchema.safeParse(
    await readJson(response, signal),
  );
  if (!parsed.success) throw unavailable(response.status);
  return parsed.data.account;
}
