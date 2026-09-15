import { z } from "zod";

import { MEMBER_REPORT_STATUSES } from "@/lib/reports/browse-validation";
import {
  REPORT_MODERATION_STATUSES,
  REPORT_TYPES,
} from "@/models/item-report";
import {
  DIRECT_REPORT_HIDE_REASONS,
} from "@/models/report-moderation-event";
import {
  REPORT_FLAG_REASONS,
  REPORT_FLAG_STATUSES,
} from "@/models/report-flag";

export const MODERATION_PAGE_SIZE = 20;

const INVALID_TEXT_PATTERN = /[\p{Cc}\p{Cf}\p{Cs}]/u;
const normalizeText = (value: string) =>
  value.normalize("NFKC").trim().replace(/\s+/gu, " ");
const controlledText = (maximum: number) =>
  z
    .string()
    .refine((value) => !INVALID_TEXT_PATTERN.test(value))
    .transform(normalizeText)
    .pipe(z.string().min(1).max(maximum));
const optionalControlledText = (maximum: number) =>
  z
    .union([
      z
        .string()
        .refine((value) => !INVALID_TEXT_PATTERN.test(value))
        .transform(normalizeText)
        .pipe(z.string().max(maximum)),
      z.null(),
    ])
    .optional()
    .transform((value) => (value === undefined || value === "" ? null : value));
const canonicalPage = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(10_000));
const exactTimestamp = z.string().datetime({ offset: true });

export const moderationObjectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Moderation reference is invalid")
  .transform((value) => value.toLowerCase());

export const submitReportFlagSchema = z
  .strictObject({
    reason: z.enum(REPORT_FLAG_REASONS),
    details: optionalControlledText(500),
  })
  .superRefine(({ reason, details }, context) => {
    if (reason === "other" && details === null) {
      context.addIssue({
        code: "custom",
        path: ["details"],
        message: "Details are required for another concern",
      });
    }
  });

export const adminReportListQuerySchema = z.strictObject({
  q: controlledText(80).optional(),
  reportType: z.enum(REPORT_TYPES).optional(),
  reportStatus: z.enum(MEMBER_REPORT_STATUSES).optional(),
  moderationStatus: z.enum(REPORT_MODERATION_STATUSES).optional(),
  page: canonicalPage.default(1),
});

export const adminFlagListQuerySchema = z.strictObject({
  status: z.enum(REPORT_FLAG_STATUSES).optional(),
  reason: z.enum(REPORT_FLAG_REASONS).optional(),
  page: canonicalPage.default(1),
});

const decisionNote = optionalControlledText(500);

export const reportFlagDecisionSchema = z.discriminatedUnion("decision", [
  // Dismiss resolves only the concern, so only the flag version is required.
  z.strictObject({
    decision: z.literal("dismiss"),
    expectedFlagUpdatedAt: exactTimestamp,
    note: decisionNote,
  }),
  // Hide changes both records and therefore requires both displayed versions.
  z.strictObject({
    decision: z.literal("hide_report"),
    expectedFlagUpdatedAt: exactTimestamp,
    expectedReportUpdatedAt: exactTimestamp,
    note: decisionNote,
  }),
]);

export const reportModerationSchema = z.discriminatedUnion(
  "moderationStatus",
  [
    z.strictObject({
      // Direct moderation is also optimistic: stale screens receive HTTP 409.
      moderationStatus: z.literal("hidden"),
      reason: z.enum(DIRECT_REPORT_HIDE_REASONS),
      expectedUpdatedAt: exactTimestamp,
      note: decisionNote,
    }),
    z.strictObject({
      moderationStatus: z.literal("visible"),
      expectedUpdatedAt: exactTimestamp,
      note: decisionNote,
    }),
  ],
);

export type SubmitReportFlagInput = z.output<typeof submitReportFlagSchema>;
export type AdminReportListQuery = z.output<
  typeof adminReportListQuerySchema
>;
export type AdminFlagListQuery = z.output<typeof adminFlagListQuerySchema>;
export type ReportFlagDecisionInput = z.output<
  typeof reportFlagDecisionSchema
>;
export type ReportModerationInput = z.output<typeof reportModerationSchema>;

export function toModerationQueryInput(searchParams: URLSearchParams) {
  const input: Record<string, string | string[]> = {};
  for (const [key, value] of searchParams) {
    const current = input[key];
    input[key] =
      current === undefined
        ? value
        : Array.isArray(current)
          ? [...current, value]
          : [current, value];
  }
  return input;
}

export function isJsonRequest(request: Request) {
  const value = request.headers.get("content-type");
  return value !== null && /^application\/json\s*(?:;|$)/i.test(value);
}
