import { z } from "zod";

import {
  adminReportFlagDecisionResponseSchema,
  adminReportFlagPageSchema,
  adminReportPageSchema,
  adminReportResponseSchema,
  reportFlagReceiptResponseSchema,
  type BrowserAdminFlagQuery,
  type BrowserAdminReportQuery,
  type BrowserReportFlagDecisionInput,
  type BrowserReportModerationInput,
  type SubmitBrowserReportFlagInput,
} from "./browser-contract";

const GENERIC_MESSAGE = "Report moderation is temporarily unavailable";
const approvedErrors = {
  VALIDATION_ERROR: { status: 400, message: "Moderation request is invalid" },
  AUTHENTICATION_REQUIRED: {
    status: 401,
    message: "Authentication required",
  },
  ACTIVE_ACCOUNT_REQUIRED: {
    status: 403,
    message: "An active account is required",
  },
  ADMINISTRATOR_REQUIRED: {
    status: 403,
    message: "Administrator access required",
  },
  REPORT_FLAG_FORBIDDEN: {
    status: 403,
    message: "Report cannot be flagged",
  },
  REPORT_NOT_FOUND: { status: 404, message: "Report not found" },
  REPORT_FLAG_NOT_FOUND: { status: 404, message: "Report flag not found" },
  REPORT_FLAG_ALREADY_PENDING: {
    status: 409,
    message: "A pending flag already exists",
  },
  REPORT_FLAG_STATE_CONFLICT: {
    status: 409,
    message: "Report flag state has changed",
  },
  REPORT_MODERATION_CONFLICT: {
    status: 409,
    message: "Report moderation state has changed",
  },
  REPORT_MODERATION_FAILED: {
    status: 500,
    message: "Report moderation could not be completed",
  },
} as const;

export type BrowserModerationErrorCode = keyof typeof approvedErrors;

const errorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum([
      "VALIDATION_ERROR",
      "AUTHENTICATION_REQUIRED",
      "ACTIVE_ACCOUNT_REQUIRED",
      "ADMINISTRATOR_REQUIRED",
      "REPORT_FLAG_FORBIDDEN",
      "REPORT_NOT_FOUND",
      "REPORT_FLAG_NOT_FOUND",
      "REPORT_FLAG_ALREADY_PENDING",
      "REPORT_FLAG_STATE_CONFLICT",
      "REPORT_MODERATION_CONFLICT",
      "REPORT_MODERATION_FAILED",
    ]),
    message: z.string(),
    fields: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

export class BrowserModerationError extends Error {
  readonly code: BrowserModerationErrorCode;
  readonly status: number;
  readonly fields?: Record<string, string[]>;

  constructor(
    code: BrowserModerationErrorCode,
    status?: number,
    fields?: Record<string, string[]>,
  ) {
    const definition = approvedErrors[code];
    super(code === "REPORT_MODERATION_FAILED" ? GENERIC_MESSAGE : definition.message);
    this.name = "BrowserModerationError";
    this.code = code;
    this.status = status ?? definition.status;
    this.fields = fields;
  }
}

function unavailable(status: number) {
  return new BrowserModerationError("REPORT_MODERATION_FAILED", status);
}

function abortError(error: unknown, signal?: AbortSignal) {
  if (error instanceof DOMException && error.name === "AbortError") return error;
  if (signal?.aborted) {
    return new DOMException("The operation was aborted", "AbortError");
  }
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

async function readJson(response: Response, signal?: AbortSignal) {
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

  const { code, message, fields } = parsed.data.error;
  const definition = approvedErrors[code];
  if (response.status !== definition.status || message !== definition.message) {
    return unavailable(response.status);
  }
  return new BrowserModerationError(code, response.status, fields);
}

async function parseResponse<T>(
  response: Response,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
) {
  if (!response.ok) throw await responseError(response, signal);
  const parsed = schema.safeParse(await readJson(response, signal));
  if (!parsed.success) throw unavailable(response.status);
  return parsed.data;
}

function requestInit(
  method: "GET" | "POST" | "PATCH",
  signal?: AbortSignal,
  body?: unknown,
): RequestInit {
  return {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    credentials: "same-origin",
    cache: "no-store",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal,
  };
}

export async function submitBrowserReportFlag(
  reportId: string,
  input: SubmitBrowserReportFlagInput,
  signal?: AbortSignal,
) {
  const response = await safeFetch(
    `/api/reports/${encodeURIComponent(reportId)}/flags`,
    requestInit("POST", signal, input),
  );
  return (
    await parseResponse(response, reportFlagReceiptResponseSchema, signal)
  ).flag;
}

export async function listBrowserAdminReportFlags(
  query: BrowserAdminFlagQuery,
  signal?: AbortSignal,
) {
  const search = new URLSearchParams();
  if (query.status !== undefined) search.set("status", query.status);
  if (query.reason !== undefined) search.set("reason", query.reason);
  search.set("page", String(query.page));
  const response = await safeFetch(
    `/api/admin/report-flags?${search}`,
    requestInit("GET", signal),
  );
  return parseResponse(response, adminReportFlagPageSchema, signal);
}

export async function listBrowserAdminReports(
  query: BrowserAdminReportQuery,
  signal?: AbortSignal,
) {
  const search = new URLSearchParams();
  if (query.q !== undefined) search.set("q", query.q);
  if (query.reportType !== undefined) search.set("reportType", query.reportType);
  if (query.reportStatus !== undefined) {
    search.set("reportStatus", query.reportStatus);
  }
  if (query.moderationStatus !== undefined) {
    search.set("moderationStatus", query.moderationStatus);
  }
  search.set("page", String(query.page));
  const response = await safeFetch(
    `/api/admin/reports?${search}`,
    requestInit("GET", signal),
  );
  return parseResponse(response, adminReportPageSchema, signal);
}

export async function decideBrowserReportFlag(
  flagId: string,
  input: BrowserReportFlagDecisionInput,
  signal?: AbortSignal,
) {
  const response = await safeFetch(
    `/api/admin/report-flags/${encodeURIComponent(flagId)}`,
    requestInit("PATCH", signal, input),
  );
  return parseResponse(
    response,
    adminReportFlagDecisionResponseSchema,
    signal,
  );
}

export async function moderateBrowserReport(
  reportId: string,
  input: BrowserReportModerationInput,
  signal?: AbortSignal,
) {
  const response = await safeFetch(
    `/api/admin/reports/${encodeURIComponent(reportId)}/moderation`,
    requestInit("PATCH", signal, input),
  );
  return (await parseResponse(response, adminReportResponseSchema, signal))
    .report;
}
