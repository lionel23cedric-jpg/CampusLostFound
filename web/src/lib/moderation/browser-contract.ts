import { z } from "zod";

import {
  REPORT_IMAGE_LIMIT,
  reportPhotoReferenceSchema,
} from "@/lib/reports/photo-reference";

export const REPORT_FLAG_REASON_VALUES = [
  "inappropriate_content",
  "suspected_fraud",
  "privacy_concern",
  "duplicate_report",
  "other",
] as const;
export const REPORT_FLAG_STATUS_VALUES = [
  "pending",
  "dismissed",
  "actioned",
] as const;
export const DIRECT_HIDE_REASON_VALUES = [
  "inappropriate_content",
  "suspected_fraud",
  "privacy_concern",
  "duplicate_report",
  "administrative_review",
] as const;

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/);
const timestampSchema = z.string().datetime({ offset: true });
const paginationSchema = z
  .strictObject({
    page: z.number().int().min(1).max(10_000),
    pageSize: z.literal(20),
    totalItems: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    totalPages: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .refine(
    ({ totalItems, totalPages }) =>
      totalPages === Math.ceil(totalItems / 20),
    { message: "Moderation pagination total is inconsistent" },
  );

const adminReportSchema = z
  .strictObject({
    id: objectIdSchema,
    reportType: z.enum(["lost", "found"]),
    title: z.string().min(5).max(120),
    publicDescription: z.string().min(10).max(2000),
    categoryId: objectIdSchema,
    campusLocationId: objectIdSchema,
    occurredAt: timestampSchema,
    colors: z.array(z.string().min(1).max(32)).min(1).max(5),
    tags: z.array(z.string().min(1).max(40)).max(10),
    photoUrls: z.array(reportPhotoReferenceSchema).max(REPORT_IMAGE_LIMIT),
    status: z.enum(["open", "claim_pending", "resolved", "closed"]),
    moderationStatus: z.enum(["visible", "hidden"]),
    privacySettings: z.strictObject({
      showPhoto: z.boolean(),
      showEventDate: z.boolean(),
      showCampusLocation: z.boolean(),
    }),
    resolvedAt: timestampSchema.nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
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

const adminReportFlagSchema = z
  .strictObject({
    id: objectIdSchema,
    reason: z.enum(REPORT_FLAG_REASON_VALUES),
    details: z.string().max(500).nullable(),
    status: z.enum(REPORT_FLAG_STATUS_VALUES),
    reviewedAt: timestampSchema.nullable(),
    resolutionNote: z.string().max(500).nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    report: adminReportSchema,
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

export const reportFlagReceiptResponseSchema = z.strictObject({
  flag: z.strictObject({
    id: objectIdSchema,
    reportId: objectIdSchema,
    reason: z.enum(REPORT_FLAG_REASON_VALUES),
    status: z.literal("pending"),
    createdAt: timestampSchema,
  }),
});

export const adminReportPageSchema = z
  .strictObject({
    reports: z.array(adminReportSchema).max(20),
    pagination: paginationSchema,
  })
  .superRefine(({ reports, pagination }, context) => {
    if (reports.length > pagination.totalItems) {
      context.addIssue({
        code: "custom",
        path: ["reports"],
        message: "Moderation report count is inconsistent",
      });
    }
  });

export const adminReportFlagPageSchema = z
  .strictObject({
    flags: z.array(adminReportFlagSchema).max(20),
    pagination: paginationSchema,
  })
  .superRefine(({ flags, pagination }, context) => {
    if (flags.length > pagination.totalItems) {
      context.addIssue({
        code: "custom",
        path: ["flags"],
        message: "Moderation flag count is inconsistent",
      });
    }
  });

export const adminReportFlagDecisionResponseSchema = z.strictObject({
  flag: adminReportFlagSchema,
  report: adminReportSchema,
});

export const adminReportResponseSchema = z.strictObject({
  report: adminReportSchema,
});

export type BrowserReportFlagReason =
  (typeof REPORT_FLAG_REASON_VALUES)[number];
export type BrowserReportFlagStatus =
  (typeof REPORT_FLAG_STATUS_VALUES)[number];
export type BrowserDirectHideReason =
  (typeof DIRECT_HIDE_REASON_VALUES)[number];
export type BrowserReportFlag = z.infer<
  typeof reportFlagReceiptResponseSchema
>["flag"];
export type BrowserAdminReport = z.infer<typeof adminReportSchema>;
export type BrowserAdminReportFlag = z.infer<typeof adminReportFlagSchema>;
export type BrowserAdminReportPage = z.infer<typeof adminReportPageSchema>;
export type BrowserAdminReportFlagPage = z.infer<
  typeof adminReportFlagPageSchema
>;

export type BrowserAdminFlagQuery = {
  status?: BrowserReportFlagStatus;
  reason?: BrowserReportFlagReason;
  page: number;
};

export type BrowserAdminReportQuery = {
  q?: string;
  reportType?: BrowserAdminReport["reportType"];
  reportStatus?: BrowserAdminReport["status"];
  moderationStatus?: BrowserAdminReport["moderationStatus"];
  page: number;
};

export type SubmitBrowserReportFlagInput = {
  reason: BrowserReportFlagReason;
  details: string | null;
};

export type BrowserReportFlagDecisionInput =
  | {
      decision: "dismiss";
      expectedFlagUpdatedAt: string;
      note: string | null;
    }
  | {
      decision: "hide_report";
      expectedFlagUpdatedAt: string;
      expectedReportUpdatedAt: string;
      note: string | null;
    };

export type BrowserReportModerationInput =
  | {
      moderationStatus: "hidden";
      reason: BrowserDirectHideReason;
      expectedUpdatedAt: string;
      note: string | null;
    }
  | {
      moderationStatus: "visible";
      expectedUpdatedAt: string;
      note: string | null;
    };
