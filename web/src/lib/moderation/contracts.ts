import { z } from "zod";

import { MEMBER_REPORT_STATUSES } from "@/lib/reports/browse-validation";
import {
  REPORT_MODERATION_STATUSES,
  REPORT_TYPES,
  normalizeReportModerationStatus,
} from "@/models/item-report";
import {
  REPORT_FLAG_REASONS,
  REPORT_FLAG_STATUSES,
} from "@/models/report-flag";

import { MODERATION_PAGE_SIZE } from "./validation";

type Identifier = { toString(): string };

const identifierSchema = z.custom<Identifier>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    "toString" in value &&
    typeof value.toString === "function" &&
    /^[a-f\d]{24}$/.test(value.toString()),
);
const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/);
const dateTimeSchema = z.string().datetime({ offset: true });
const photoUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  });

export const reportFlagReceiptSchema = z.strictObject({
  id: objectIdSchema,
  reportId: objectIdSchema,
  reason: z.enum(REPORT_FLAG_REASONS),
  status: z.literal("pending"),
  createdAt: dateTimeSchema,
});

export const adminReportSummarySchema = z
  .strictObject({
    id: objectIdSchema,
    reportType: z.enum(REPORT_TYPES),
    title: z.string().min(5).max(120),
    publicDescription: z.string().min(10).max(2000),
    categoryId: objectIdSchema,
    campusLocationId: objectIdSchema,
    occurredAt: dateTimeSchema,
    colors: z.array(z.string().min(1).max(32)).min(1).max(5),
    tags: z.array(z.string().min(1).max(40)).max(10),
    photoUrls: z.array(photoUrlSchema).max(5),
    status: z.enum(MEMBER_REPORT_STATUSES),
    moderationStatus: z.enum(REPORT_MODERATION_STATUSES),
    privacySettings: z.strictObject({
      showPhoto: z.boolean(),
      showEventDate: z.boolean(),
      showCampusLocation: z.boolean(),
    }),
    resolvedAt: dateTimeSchema.nullable(),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
  })
  .superRefine(({ status, resolvedAt }, context) => {
    if (status === "resolved" && resolvedAt === null) {
      context.addIssue({
        code: "custom",
        path: ["resolvedAt"],
        message: "Resolved reports require a resolved timestamp",
      });
    }
  });

export const adminReportFlagSchema = z
  .strictObject({
    id: objectIdSchema,
    reason: z.enum(REPORT_FLAG_REASONS),
    details: z.string().max(500).nullable(),
    status: z.enum(REPORT_FLAG_STATUSES),
    reviewedAt: dateTimeSchema.nullable(),
    resolutionNote: z.string().max(500).nullable(),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
    report: adminReportSummarySchema,
  })
  .superRefine(({ status, reviewedAt }, context) => {
    if (status === "pending" && reviewedAt !== null) {
      context.addIssue({
        code: "custom",
        path: ["reviewedAt"],
        message: "Pending flags cannot have a review timestamp",
      });
    }
    if (status !== "pending" && reviewedAt === null) {
      context.addIssue({
        code: "custom",
        path: ["reviewedAt"],
        message: "Resolved flags require a review timestamp",
      });
    }
  });

const paginationSchema = z
  .strictObject({
    page: z.number().int().min(1).max(10_000),
    pageSize: z.literal(MODERATION_PAGE_SIZE),
    totalItems: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    totalPages: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .refine(
    ({ totalItems, totalPages }) =>
      totalPages === Math.ceil(totalItems / MODERATION_PAGE_SIZE),
    { message: "Moderation pagination total is inconsistent" },
  );

export const adminReportPageSchema = z.strictObject({
  reports: z.array(adminReportSummarySchema).max(MODERATION_PAGE_SIZE),
  pagination: paginationSchema,
});

export const adminReportFlagPageSchema = z.strictObject({
  flags: z.array(adminReportFlagSchema).max(MODERATION_PAGE_SIZE),
  pagination: paginationSchema,
});

export const adminReportFlagDecisionResultSchema = z.strictObject({
  flag: adminReportFlagSchema,
  report: adminReportSummarySchema,
});

export type ReportFlagReceipt = z.infer<typeof reportFlagReceiptSchema>;
export type AdminReportSummary = z.infer<typeof adminReportSummarySchema>;
export type AdminReportFlag = z.infer<typeof adminReportFlagSchema>;
export type AdminReportPage = z.infer<typeof adminReportPageSchema>;
export type AdminReportFlagPage = z.infer<typeof adminReportFlagPageSchema>;
export type AdminReportFlagDecisionResult = z.infer<
  typeof adminReportFlagDecisionResultSchema
>;

export type ReportFlagRecord = {
  _id: Identifier;
  reportId: Identifier;
  submittedByUserId?: unknown;
  reason: unknown;
  status: unknown;
  createdAt: Date;
  details?: unknown;
  reviewedByAdministratorId?: unknown;
  reviewedAt?: Date | null;
  resolutionNote?: unknown;
  updatedAt?: Date;
};

export type AdminReportRecord = {
  _id: Identifier;
  reportType: unknown;
  title: unknown;
  publicDescription: unknown;
  categoryId: Identifier;
  campusLocationId: Identifier;
  occurredAt: Date;
  colors: unknown;
  tags: unknown;
  photoUrls: unknown;
  status: unknown;
  moderationStatus?: unknown;
  privacySettings: {
    showPhoto: unknown;
    showEventDate: unknown;
    showCampusLocation: unknown;
  };
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminReportFlagRecord = ReportFlagRecord;

export function toReportFlagReceipt(
  record: ReportFlagRecord,
): ReportFlagReceipt {
  return reportFlagReceiptSchema.parse({
    id: record._id.toString(),
    reportId: record.reportId.toString(),
    reason: record.reason,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
  });
}

export function toAdminReportSummary(
  record: AdminReportRecord,
): AdminReportSummary {
  const colors = Array.isArray(record.colors) ? [...record.colors] : record.colors;
  const tags = Array.isArray(record.tags) ? [...record.tags] : record.tags;
  const photoUrls = Array.isArray(record.photoUrls)
    ? [...record.photoUrls]
    : record.photoUrls;

  return adminReportSummarySchema.parse({
    id: record._id.toString(),
    reportType: record.reportType,
    title: record.title,
    publicDescription: record.publicDescription,
    categoryId: record.categoryId.toString(),
    campusLocationId: record.campusLocationId.toString(),
    occurredAt: record.occurredAt.toISOString(),
    colors,
    tags,
    photoUrls,
    status: record.status,
    moderationStatus: normalizeReportModerationStatus(
      record.moderationStatus,
    ),
    privacySettings: {
      showPhoto: record.privacySettings.showPhoto,
      showEventDate: record.privacySettings.showEventDate,
      showCampusLocation: record.privacySettings.showCampusLocation,
    },
    resolvedAt: record.resolvedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

export function toAdminReportFlag(
  record: AdminReportFlagRecord,
  report: AdminReportRecord,
): AdminReportFlag {
  return adminReportFlagSchema.parse({
    id: record._id.toString(),
    reason: record.reason,
    details: record.details ?? null,
    status: record.status,
    reviewedAt: record.reviewedAt?.toISOString() ?? null,
    resolutionNote: record.resolutionNote ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt?.toISOString(),
    report: toAdminReportSummary(report),
  });
}

const rawAdminReportSchema = z.strictObject({
  _id: identifierSchema,
  reportType: z.enum(REPORT_TYPES),
  title: z.string(),
  publicDescription: z.string(),
  categoryId: identifierSchema,
  campusLocationId: identifierSchema,
  occurredAt: z.date(),
  colors: z.array(z.string()),
  tags: z.array(z.string()),
  photoUrls: z.array(z.string()),
  status: z.enum(MEMBER_REPORT_STATUSES),
  moderationStatus: z.enum(REPORT_MODERATION_STATUSES).optional(),
  privacySettings: z.strictObject({
    showPhoto: z.boolean(),
    showEventDate: z.boolean(),
    showCampusLocation: z.boolean(),
  }),
  resolvedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const rawAdminFlagSchema = z.strictObject({
  _id: identifierSchema,
  reportId: identifierSchema,
  reason: z.enum(REPORT_FLAG_REASONS),
  details: z.string().max(500).nullable(),
  status: z.enum(REPORT_FLAG_STATUSES),
  reviewedAt: z.date().nullable(),
  resolutionNote: z.string().max(500).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  report: rawAdminReportSchema,
});

const metadataSchema = z
  .array(
    z.strictObject({
      totalItems: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    }),
  )
  .max(1);
const rawReportFacetSchema = z.strictObject({
  reports: z.array(rawAdminReportSchema).max(MODERATION_PAGE_SIZE),
  metadata: metadataSchema,
});
const rawFlagFacetSchema = z.strictObject({
  flags: z.array(rawAdminFlagSchema).max(MODERATION_PAGE_SIZE),
  metadata: metadataSchema,
});

export function parseAdminReportPage(
  input: unknown,
  page: number,
): AdminReportPage {
  const facet = z.array(rawReportFacetSchema).length(1).parse(input)[0];
  const totalItems = facet.metadata[0]?.totalItems ?? 0;
  return adminReportPageSchema.parse({
    reports: facet.reports.map(toAdminReportSummary),
    pagination: {
      page,
      pageSize: MODERATION_PAGE_SIZE,
      totalItems,
      totalPages: Math.ceil(totalItems / MODERATION_PAGE_SIZE),
    },
  });
}

export function parseAdminReportFlagPage(
  input: unknown,
  page: number,
): AdminReportFlagPage {
  const facet = z.array(rawFlagFacetSchema).length(1).parse(input)[0];
  const totalItems = facet.metadata[0]?.totalItems ?? 0;
  return adminReportFlagPageSchema.parse({
    flags: facet.flags.map(({ report, ...flag }) =>
      toAdminReportFlag(flag, report),
    ),
    pagination: {
      page,
      pageSize: MODERATION_PAGE_SIZE,
      totalItems,
      totalPages: Math.ceil(totalItems / MODERATION_PAGE_SIZE),
    },
  });
}
