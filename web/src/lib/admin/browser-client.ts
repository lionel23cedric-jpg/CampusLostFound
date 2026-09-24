import { z } from "zod";

import {
  administratorOverviewSchema,
  type AdministratorOverview,
} from "./overview-contract";

const GENERIC_MESSAGE = "Administrator overview is temporarily unavailable";

const approvedErrors = {
  AUTHENTICATION_REQUIRED: {
    status: 401,
    message: "Authentication required",
  },
  ADMINISTRATOR_REQUIRED: {
    status: 403,
    message: "Administrator access required",
  },
  ADMIN_OVERVIEW_UNAVAILABLE: {
    status: 500,
    message: GENERIC_MESSAGE,
  },
} as const;

type BrowserAdminOverviewErrorCode = keyof typeof approvedErrors;

const errorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum([
      "AUTHENTICATION_REQUIRED",
      "ADMINISTRATOR_REQUIRED",
      "ADMIN_OVERVIEW_UNAVAILABLE",
    ]),
    message: z.string(),
  }),
});

export class BrowserAdminOverviewError extends Error {
  readonly code: BrowserAdminOverviewErrorCode;
  readonly status: number;

  constructor(code: BrowserAdminOverviewErrorCode, status?: number) {
    const definition = approvedErrors[code];
    super(definition.message);
    this.name = "BrowserAdminOverviewError";
    this.code = code;
    this.status = status ?? definition.status;
  }
}

function unavailable(status: number) {
  return new BrowserAdminOverviewError("ADMIN_OVERVIEW_UNAVAILABLE", status);
}

function isAbort(error: unknown, signal?: AbortSignal) {
  return (
    signal?.aborted === true ||
    (error instanceof DOMException && error.name === "AbortError")
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw unavailable(response.status);
  }
}

async function responseError(response: Response) {
  const parsed = errorResponseSchema.safeParse(await readJson(response));

  if (!parsed.success) {
    return unavailable(response.status);
  }

  const definition = approvedErrors[parsed.data.error.code];

  // Accept only the documented code, status, and message combinations. This
  // prevents an unexpected server response from becoming trusted UI copy.
  if (
    response.status !== definition.status ||
    parsed.data.error.message !== definition.message
  ) {
    return unavailable(response.status);
  }

  return new BrowserAdminOverviewError(parsed.data.error.code);
}

export async function getAdministratorOverview(
  signal?: AbortSignal,
): Promise<AdministratorOverview> {
  // This is the browser-to-API boundary for the overview page. It sends no
  // client-provided role and validates the complete snapshot before rendering.
  let response: Response;

  try {
    response = await fetch("/api/admin/overview", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (isAbort(error, signal)) {
      throw error;
    }

    throw unavailable(0);
  }

  if (!response.ok) {
    throw await responseError(response);
  }

  // Browser code treats network JSON as untrusted until the shared contract
  // verifies its shape and the relationships between all totals.
  const parsed = administratorOverviewSchema.safeParse(await readJson(response));

  if (!parsed.success) {
    throw unavailable(response.status);
  }

  return parsed.data;
}
