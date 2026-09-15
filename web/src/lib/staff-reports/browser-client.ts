import { z } from "zod";

import { reportPhotoReferenceSchema } from "@/lib/reports/photo-reference";

const GENERIC_MESSAGE = "We could not complete that request. Please try again.";
const NETWORK_MESSAGE = "We could not reach the service. Please try again.";
const ERROR_CODES = [
  "VALIDATION_ERROR",
  "AUTHENTICATION_REQUIRED",
  "STAFF_REPORT_FORBIDDEN",
  "STAFF_REPORT_NOT_FOUND",
  "STAFF_REPORT_STATE_CONFLICT",
  "STAFF_REPORT_OPERATION_FAILED",
] as const;
const errorDefinitions = {
  VALIDATION_ERROR: { status: 400, message: "Invalid staff report request" },
  AUTHENTICATION_REQUIRED: { status: 401, message: "Authentication required" },
  STAFF_REPORT_FORBIDDEN: {
    status: 403,
    message: "Staff report access is not permitted",
  },
  STAFF_REPORT_NOT_FOUND: { status: 404, message: "Staff report not found" },
  STAFF_REPORT_STATE_CONFLICT: {
    status: 409,
    message: "Staff report state has changed",
  },
  STAFF_REPORT_OPERATION_FAILED: {
    status: 500,
    message: "Staff report operation failed",
  },
} as const;

export type StaffReportListRequest = {
  reportType?: "lost" | "found";
  reportStatus?: "open" | "claim_pending" | "resolved";
  verificationStatus?: "pending" | "verified";
  custodyStatus?: "not_applicable" | "not_held" | "stored" | "released";
  page?: number;
};

export type StaffReportSummary = {
  id: string;
  reportType: "lost" | "found";
  title: string;
  photoUrls: string[];
  status: "open" | "claim_pending" | "resolved";
  moderationStatus: "visible";
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
  handling: {
    verificationStatus: "pending" | "verified";
    custodyStatus: "not_applicable" | "not_held" | "stored" | "released";
    verifiedAt: string | null;
    storedAt: string | null;
    releasedAt: string | null;
  };
};

export type StaffReportDetail = Omit<StaffReportSummary, "handling"> & {
  publicDescription: string;
  categoryId: string;
  campusLocationId: string;
  colors: string[];
  tags: string[];
  resolvedAt: string | null;
  handling: StaffReportSummary["handling"] & {
    verifiedBy: string | null;
    storageLocation: string | null;
    updatedBy: string | null;
  };
};

export type StaffReportPage = {
  reports: StaffReportSummary[];
  pagination: {
    page: number;
    pageSize: 10;
    total: number;
    totalPages: number;
  };
};

export type VerifyStaffReportInput = { expectedUpdatedAt: string };
export type StoreStaffReportInput = VerifyStaffReportInput & {
  storageLocation: string;
};

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i);
const dateTimeSchema = z.string().datetime({ offset: true });
const summaryHandlingSchema = z.strictObject({
  verificationStatus: z.enum(["pending", "verified"]),
  custodyStatus: z.enum([
    "not_applicable",
    "not_held",
    "stored",
    "released",
  ]),
  verifiedAt: dateTimeSchema.nullable(),
  storedAt: dateTimeSchema.nullable(),
  releasedAt: dateTimeSchema.nullable(),
});

function handlingIsConsistent(
  report: {
    reportType: "lost" | "found";
    handling: z.output<typeof summaryHandlingSchema>;
  },
) {
  const { handling } = report;
  if (handling.verificationStatus === "pending") {
    return (
      handling.verifiedAt === null &&
      handling.storedAt === null &&
      handling.releasedAt === null &&
      handling.custodyStatus ===
        (report.reportType === "lost" ? "not_applicable" : "not_held")
    );
  }
  if (handling.verifiedAt === null) return false;
  if (report.reportType === "lost") {
    return (
      handling.custodyStatus === "not_applicable" &&
      handling.storedAt === null &&
      handling.releasedAt === null
    );
  }
  if (handling.custodyStatus === "not_held") {
    return handling.storedAt === null && handling.releasedAt === null;
  }
  if (handling.custodyStatus === "stored") {
    return handling.storedAt !== null && handling.releasedAt === null;
  }
  return (
    handling.custodyStatus === "released" &&
    handling.storedAt !== null &&
    handling.releasedAt !== null
  );
}

const summaryObjectSchema = z.strictObject({
    id: objectIdSchema,
    reportType: z.enum(["lost", "found"]),
    title: z.string().min(1).max(120),
    photoUrls: z.array(reportPhotoReferenceSchema).max(5),
    status: z.enum(["open", "claim_pending", "resolved"]),
    moderationStatus: z.literal("visible"),
    occurredAt: dateTimeSchema,
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
    handling: summaryHandlingSchema,
  });

const summarySchema = summaryObjectSchema
  .superRefine((report, context) => {
    if (!handlingIsConsistent(report)) {
      context.addIssue({
        code: "custom",
        path: ["handling"],
        message: "Staff handling state is inconsistent",
      });
    }
  }) satisfies z.ZodType<StaffReportSummary>;

const detailHandlingSchema = summaryHandlingSchema.extend({
  verifiedBy: objectIdSchema.nullable(),
  storageLocation: z.string().min(2).max(160).nullable(),
  updatedBy: objectIdSchema.nullable(),
});

const detailSchema = summaryObjectSchema
  .omit({ handling: true })
  .extend({
    publicDescription: z.string().min(1).max(2000),
    categoryId: objectIdSchema,
    campusLocationId: objectIdSchema,
    colors: z.array(z.string()).min(1).max(5),
    tags: z.array(z.string()).max(10),
    resolvedAt: dateTimeSchema.nullable(),
    handling: detailHandlingSchema,
  })
  .superRefine((report, context) => {
    const { handling } = report;
    const actorsValid =
      handling.verificationStatus === "pending"
        ? handling.verifiedBy === null && handling.updatedBy === null
        : handling.verifiedBy !== null && handling.updatedBy !== null;
    const locationValid =
      handling.custodyStatus === "stored" ||
      handling.custodyStatus === "released"
        ? handling.storageLocation !== null
        : handling.storageLocation === null;
    const resolutionValid =
      report.status === "resolved"
        ? report.resolvedAt !== null
        : report.resolvedAt === null;
    if (
      !handlingIsConsistent(report) ||
      !actorsValid ||
      !locationValid ||
      !resolutionValid
    ) {
      context.addIssue({
        code: "custom",
        path: ["handling"],
        message: "Staff report detail is inconsistent",
      });
    }
  }) satisfies z.ZodType<StaffReportDetail>;

const pageSchema = z
  .strictObject({
    reports: z.array(summarySchema).max(10),
    pagination: z.strictObject({
      page: z.number().int().min(1).max(10_000),
      pageSize: z.literal(10),
      total: z.number().int().nonnegative(),
      totalPages: z.number().int().nonnegative(),
    }),
  })
  .superRefine(({ reports, pagination }, context) => {
    if (
      pagination.totalPages !== Math.ceil(pagination.total / 10) ||
      reports.length > pagination.total ||
      (reports.length > 0 && pagination.page > pagination.totalPages)
    ) {
      context.addIssue({
        code: "custom",
        path: ["pagination"],
        message: "Staff report pagination is inconsistent",
      });
    }
  }) satisfies z.ZodType<StaffReportPage>;

const detailResponseSchema = z.strictObject({ report: detailSchema });
const errorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(ERROR_CODES),
    message: z.string().min(1),
    fields: z
      .strictObject({
        reportType: z.array(z.string()).min(1).optional(),
        reportStatus: z.array(z.string()).min(1).optional(),
        verificationStatus: z.array(z.string()).min(1).optional(),
        custodyStatus: z.array(z.string()).min(1).optional(),
        page: z.array(z.string()).min(1).optional(),
        reportId: z.array(z.string()).min(1).optional(),
        expectedUpdatedAt: z.array(z.string()).min(1).optional(),
        storageLocation: z.array(z.string()).min(1).optional(),
      })
      .optional(),
  }),
});

export class StaffReportBrowserError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "StaffReportBrowserError";
    this.code = code;
    this.status = status;
  }
}

function requestFailed(status: number) {
  return new StaffReportBrowserError("REQUEST_FAILED", status, GENERIC_MESSAGE);
}

async function fetchSameOrigin(path: string, init: RequestInit) {
  try {
    return await fetch(path, { ...init, credentials: "same-origin" });
  } catch {
    throw new StaffReportBrowserError("NETWORK_ERROR", 0, NETWORK_MESSAGE);
  }
}

async function parseResponse<T>(response: Response, schema: z.ZodType<T>) {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw requestFailed(response.status);
  }

  if (!response.ok) {
    const parsed = errorResponseSchema.safeParse(body);
    if (!parsed.success) throw requestFailed(response.status);
    const definition = errorDefinitions[parsed.data.error.code];
    if (definition.status !== response.status) {
      throw requestFailed(response.status);
    }
    throw new StaffReportBrowserError(
      parsed.data.error.code,
      response.status,
      definition.message,
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) throw requestFailed(response.status);
  return parsed.data;
}

export async function getStaffReports(
  input: StaffReportListRequest,
  signal?: AbortSignal,
) {
  const search = new URLSearchParams();
  if (input.reportType) search.set("reportType", input.reportType);
  if (input.reportStatus) search.set("reportStatus", input.reportStatus);
  if (input.verificationStatus) {
    search.set("verificationStatus", input.verificationStatus);
  }
  if (input.custodyStatus) search.set("custodyStatus", input.custodyStatus);
  if (input.page && input.page !== 1) search.set("page", String(input.page));
  const query = search.toString();
  const response = await fetchSameOrigin(
    query ? `/api/staff/reports?${query}` : "/api/staff/reports",
    { method: "GET", signal },
  );
  return parseResponse(response, pageSchema);
}

export async function getStaffReport(id: string, signal?: AbortSignal) {
  const response = await fetchSameOrigin(
    `/api/staff/reports/${encodeURIComponent(id)}`,
    { method: "GET", signal },
  );
  return (await parseResponse(response, detailResponseSchema)).report;
}

export async function verifyStaffReport(
  id: string,
  input: VerifyStaffReportInput,
) {
  const response = await fetchSameOrigin(
    `/api/staff/reports/${encodeURIComponent(id)}/verify`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedUpdatedAt: input.expectedUpdatedAt }),
    },
  );
  return (await parseResponse(response, detailResponseSchema)).report;
}

export async function storeStaffReport(
  id: string,
  input: StoreStaffReportInput,
) {
  const response = await fetchSameOrigin(
    `/api/staff/reports/${encodeURIComponent(id)}/storage`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedUpdatedAt: input.expectedUpdatedAt,
        storageLocation: input.storageLocation,
      }),
    },
  );
  return (await parseResponse(response, detailResponseSchema)).report;
}
