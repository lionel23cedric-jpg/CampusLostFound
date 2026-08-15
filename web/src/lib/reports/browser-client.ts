import { z } from "zod";

import type { CreateReportInput } from "./validation";

const GENERIC_MESSAGE = "We could not complete that request. Please try again.";
const NETWORK_MESSAGE = "We could not reach the service. Please try again.";

export type ReportCategory = {
  id: string;
  name: string;
  description: string | null;
};

export type ReportCampusLocation = {
  id: string;
  campusName: string;
  locationName: string;
  description: string | null;
};

export type CreatedReport = {
  id: string;
  reporterId: string;
  reportType: "lost" | "found";
  title: string;
  publicDescription: string;
  categoryId: string;
  campusLocationId: string;
  occurredAt: string;
  colors: string[];
  tags: string[];
  photoUrls: string[];
  status: "draft" | "open" | "claim_pending" | "resolved" | "closed";
  privacySettings: {
    showPhoto: boolean;
    showEventDate: boolean;
    showCampusLocation: boolean;
  };
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const categorySchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
}) satisfies z.ZodType<ReportCategory>;

const campusLocationSchema = z.strictObject({
  id: z.string().min(1),
  campusName: z.string().min(1),
  locationName: z.string().min(1),
  description: z.string().nullable(),
}) satisfies z.ZodType<ReportCampusLocation>;

const createdReportSchema = z.strictObject({
  id: z.string().min(1),
  reporterId: z.string().min(1),
  reportType: z.enum(["lost", "found"]),
  title: z.string(),
  publicDescription: z.string(),
  categoryId: z.string().min(1),
  campusLocationId: z.string().min(1),
  occurredAt: z.string().datetime({ offset: true }),
  colors: z.array(z.string()),
  tags: z.array(z.string()),
  photoUrls: z.array(z.string()),
  status: z.enum(["draft", "open", "claim_pending", "resolved", "closed"]),
  privacySettings: z.strictObject({
    showPhoto: z.boolean(),
    showEventDate: z.boolean(),
    showCampusLocation: z.boolean(),
  }),
  resolvedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
}) satisfies z.ZodType<CreatedReport>;

const categoryResponseSchema = z.strictObject({
  categories: z.array(categorySchema),
});

const campusLocationResponseSchema = z.strictObject({
  campusLocations: z.array(campusLocationSchema),
});

const reportResponseSchema = z.strictObject({ report: createdReportSchema });

const errorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.string().min(1),
    message: z.string().min(1),
    fields: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

export class BrowserReportError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields?: Record<string, string[]>;

  constructor(options: {
    code: string;
    status: number;
    message: string;
    fields?: Record<string, string[]>;
  }) {
    super(options.message);
    this.name = "BrowserReportError";
    this.code = options.code;
    this.status = options.status;
    this.fields = options.fields;
  }
}

function requestFailedError(status: number) {
  return new BrowserReportError({
    code: "REQUEST_FAILED",
    status,
    message: GENERIC_MESSAGE,
  });
}

function networkError() {
  return new BrowserReportError({
    code: "NETWORK_ERROR",
    status: 0,
    message: NETWORK_MESSAGE,
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

async function responseError(response: Response) {
  const parsed = errorResponseSchema.safeParse(await readJson(response));
  if (!parsed.success) {
    return requestFailedError(response.status);
  }

  return new BrowserReportError({
    code: parsed.data.error.code,
    status: response.status,
    message: parsed.data.error.message,
    fields: parsed.data.error.fields,
  });
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

export async function getReportCategories(): Promise<ReportCategory[]> {
  const response = await fetchSameOrigin("/api/categories", { method: "GET" });
  const data = await parseResponse(response, categoryResponseSchema);
  return data.categories;
}

export async function getReportCampusLocations(): Promise<
  ReportCampusLocation[]
> {
  const response = await fetchSameOrigin("/api/campus-locations", {
    method: "GET",
  });
  const data = await parseResponse(response, campusLocationResponseSchema);
  return data.campusLocations;
}

export async function submitReport(
  input: CreateReportInput,
): Promise<CreatedReport> {
  const response = await fetchSameOrigin("/api/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseResponse(response, reportResponseSchema);
  return data.report;
}
