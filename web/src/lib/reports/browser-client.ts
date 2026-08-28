import { z } from "zod";

import type { CreateReportInput } from "./validation";

const GENERIC_MESSAGE = "We could not complete that request. Please try again.";
const NETWORK_MESSAGE = "We could not reach the service. Please try again.";

const httpsUrlSchema = z.string().refine((value) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
});

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
  moderationStatus: "visible" | "hidden";
  privacySettings: {
    showPhoto: boolean;
    showEventDate: boolean;
    showCampusLocation: boolean;
  };
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MemberReport = {
  id: string;
  reportType: "lost" | "found";
  title: string;
  publicDescription: string;
  categoryId: string;
  campusLocationId: string | null;
  occurredAt: string | null;
  colors: string[];
  tags: string[];
  photoUrls: string[];
  status: "open" | "claim_pending" | "resolved" | "closed";
  moderationStatus: "visible" | "hidden";
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isOwner: boolean;
};

export type ReportPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ReportPage = {
  reports: MemberReport[];
  pagination: ReportPagination;
};

export type MatchFactorKey =
  | "category"
  | "location"
  | "date"
  | "colors"
  | "tags"
  | "text";

export type MatchFactor = {
  key: MatchFactorKey;
  points: number;
  maximum: number;
  explanation: string;
};

export type ReportMatch = {
  report: MemberReport;
  score: number;
  factors: MatchFactor[];
};

export type ReportMatches = {
  sourceReportId: string;
  matches: ReportMatch[];
};

export type ReportBrowseRequest = {
  q?: string;
  reportType?: "lost" | "found";
  categoryId?: string;
  campusLocationId?: string;
  status?: MemberReport["status"];
  color?: string;
  occurredFrom?: string;
  occurredTo?: string;
  hasPhoto?: boolean;
  page?: number;
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
  moderationStatus: z.enum(["visible", "hidden"]),
  privacySettings: z.strictObject({
    showPhoto: z.boolean(),
    showEventDate: z.boolean(),
    showCampusLocation: z.boolean(),
  }),
  resolvedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
}) satisfies z.ZodType<CreatedReport>;

const memberReportSchema = z.strictObject({
  id: z.string().min(1),
  reportType: z.enum(["lost", "found"]),
  title: z.string(),
  publicDescription: z.string(),
  categoryId: z.string().min(1),
  campusLocationId: z.string().min(1).nullable(),
  occurredAt: z.string().datetime({ offset: true }).nullable(),
  colors: z.array(z.string()),
  tags: z.array(z.string()),
  photoUrls: z.array(httpsUrlSchema),
  status: z.enum(["open", "claim_pending", "resolved", "closed"]),
  moderationStatus: z.enum(["visible", "hidden"]),
  resolvedAt: z.string().datetime({ offset: true }).nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  isOwner: z.boolean(),
}) satisfies z.ZodType<MemberReport>;

const reportPaginationSchema = z.strictObject({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
}) satisfies z.ZodType<ReportPagination>;

const reportPageSchema = z.strictObject({
  reports: z.array(memberReportSchema),
  pagination: reportPaginationSchema,
}) satisfies z.ZodType<ReportPage>;

const matchFactorMaximums = {
  category: 25,
  location: 15,
  date: 15,
  colors: 15,
  tags: 10,
  text: 20,
} as const satisfies Record<MatchFactorKey, number>;

const matchFactorSchema = z
  .strictObject({
    key: z.enum(["category", "location", "date", "colors", "tags", "text"]),
    points: z.number().int().positive(),
    maximum: z.number().int().positive(),
    explanation: z.string().trim().min(1).max(80),
  })
  .superRefine((factor, context) => {
    if (factor.maximum !== matchFactorMaximums[factor.key]) {
      context.addIssue({
        code: "custom",
        path: ["maximum"],
        message: "Factor maximum does not match the fixed score",
      });
    }

    if (factor.points > factor.maximum) {
      context.addIssue({
        code: "custom",
        path: ["points"],
        message: "Factor points exceed the factor maximum",
      });
    }
  }) satisfies z.ZodType<MatchFactor>;

const reportMatchSchema = z
  .strictObject({
    report: memberReportSchema,
    score: z.number().int().min(35).max(100),
    factors: z.array(matchFactorSchema).min(1).max(6),
  })
  .superRefine((match, context) => {
    const keys = match.factors.map((factor) => factor.key);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: "custom",
        path: ["factors"],
        message: "Match factor keys must be unique",
      });
    }

    const score = match.factors.reduce(
      (total, factor) => total + factor.points,
      0,
    );
    if (score !== match.score) {
      context.addIssue({
        code: "custom",
        path: ["score"],
        message: "Match score must equal its factor total",
      });
    }
  }) satisfies z.ZodType<ReportMatch>;

const reportMatchesSchema = z
  .strictObject({
    sourceReportId: z.string().min(1),
    matches: z.array(reportMatchSchema).max(5),
  })
  .superRefine((data, context) => {
    const reportIds = data.matches.map((match) => match.report.id);
    if (new Set(reportIds).size !== reportIds.length) {
      context.addIssue({
        code: "custom",
        path: ["matches"],
        message: "Match candidate reports must be unique",
      });
    }
  }) satisfies z.ZodType<ReportMatches>;

const memberReportResponseSchema = z.strictObject({
  report: memberReportSchema,
});

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

export async function getReports(
  input: ReportBrowseRequest,
): Promise<ReportPage> {
  const search = new URLSearchParams();
  if (input.q) search.set("q", input.q);
  if (input.reportType) search.set("reportType", input.reportType);
  if (input.categoryId) search.set("categoryId", input.categoryId);
  if (input.campusLocationId) {
    search.set("campusLocationId", input.campusLocationId);
  }
  if (input.status) search.set("status", input.status);
  if (input.color) search.set("color", input.color);
  if (input.occurredFrom) search.set("occurredFrom", input.occurredFrom);
  if (input.occurredTo) search.set("occurredTo", input.occurredTo);
  if (input.hasPhoto !== undefined) {
    search.set("hasPhoto", String(input.hasPhoto));
  }
  if (input.page && input.page !== 1) search.set("page", String(input.page));

  const suffix = search.size > 0 ? `?${search.toString()}` : "";
  const response = await fetchSameOrigin(`/api/reports${suffix}`, {
    method: "GET",
  });
  return parseResponse(response, reportPageSchema);
}

export async function getReportById(id: string): Promise<MemberReport> {
  const response = await fetchSameOrigin(
    `/api/reports/${encodeURIComponent(id)}`,
    { method: "GET" },
  );
  const data = await parseResponse(response, memberReportResponseSchema);
  return data.report;
}

export async function getReportMatches(id: string): Promise<ReportMatches> {
  const response = await fetchSameOrigin(
    `/api/reports/${encodeURIComponent(id)}/matches`,
    { method: "GET" },
  );
  const data = await parseResponse(response, reportMatchesSchema);
  if (data.sourceReportId !== id) {
    throw requestFailedError(response.status);
  }
  return data;
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
