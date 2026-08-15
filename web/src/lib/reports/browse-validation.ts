import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Must be a valid ObjectId");

const dateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

const positiveInteger = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(Number.MAX_SAFE_INTEGER));

export const MEMBER_REPORT_STATUSES = [
  "open",
  "claim_pending",
  "resolved",
  "closed",
] as const;

export const reportBrowseQuerySchema = z
  .strictObject({
    q: z.string().trim().min(2).max(100).optional(),
    reportType: z.enum(["lost", "found"]).optional(),
    categoryId: objectIdSchema.optional(),
    campusLocationId: objectIdSchema.optional(),
    status: z.enum(MEMBER_REPORT_STATUSES).optional(),
    color: z.string().trim().min(1).max(32).optional(),
    occurredFrom: dateTimeSchema.optional(),
    occurredTo: dateTimeSchema.optional(),
    hasPhoto: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    page: positiveInteger.default(1),
    pageSize: positiveInteger.pipe(z.number().max(50)).default(12),
  })
  .superRefine((value, context) => {
    if (!Number.isSafeInteger((value.page - 1) * value.pageSize)) {
      context.addIssue({
        code: "custom",
        path: ["page"],
        message: "Page offset exceeds the safe integer range",
      });
    }

    if (
      value.occurredFrom &&
      value.occurredTo &&
      value.occurredFrom > value.occurredTo
    ) {
      context.addIssue({
        code: "custom",
        path: ["occurredTo"],
        message: "End date must not be earlier than start date",
      });
    }
  });

export type ReportBrowseQuery = z.output<typeof reportBrowseQuerySchema>;

export const reportIdSchema = objectIdSchema;

export function toReportBrowseQueryInput(searchParams: URLSearchParams) {
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
