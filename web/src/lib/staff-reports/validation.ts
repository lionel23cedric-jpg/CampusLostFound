import { z } from "zod";

import {
  REPORT_CUSTODY_STATUSES,
  REPORT_TYPES,
  REPORT_VERIFICATION_STATUSES,
} from "@/models/item-report";

export const STAFF_REPORT_PAGE_SIZE = 10;

const canonicalPage = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(10_000));
const exactTimestamp = z.string().datetime({ offset: true });
const invalidText = /[\p{Cc}\p{Cf}\p{Cs}]/u;
const storageLocation = z
  .string()
  .refine((value) => !invalidText.test(value))
  .transform((value) => value.normalize("NFKC").trim().replace(/\s+/gu, " "))
  .pipe(z.string().min(2).max(160));

export const staffReportIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Staff report reference is invalid")
  .transform((value) => value.toLowerCase());

export const staffReportListQuerySchema = z
  .strictObject({
    reportType: z.enum(REPORT_TYPES).optional(),
    reportStatus: z.enum(["open", "claim_pending", "resolved"]).optional(),
    verificationStatus: z.enum(REPORT_VERIFICATION_STATUSES).optional(),
    custodyStatus: z.enum(REPORT_CUSTODY_STATUSES).optional(),
    page: canonicalPage.default(1),
  })
  .superRefine((input, context) => {
    if (
      (input.reportType === "lost" &&
        input.custodyStatus !== undefined &&
        input.custodyStatus !== "not_applicable") ||
      (input.reportType === "found" && input.custodyStatus === "not_applicable")
    ) {
      context.addIssue({
        code: "custom",
        path: ["custodyStatus"],
        message: "Custody status is incompatible with the report type",
      });
    }
    if (
      input.verificationStatus === "pending" &&
      (input.custodyStatus === "stored" || input.custodyStatus === "released")
    ) {
      context.addIssue({
        code: "custom",
        path: ["custodyStatus"],
        message: "Pending reports cannot be stored or released",
      });
    }
  });

export const verifyReportSchema = z.strictObject({
  expectedUpdatedAt: exactTimestamp,
});

export const storeReportSchema = z.strictObject({
  expectedUpdatedAt: exactTimestamp,
  storageLocation,
});

export type StaffReportListQuery = z.output<typeof staffReportListQuerySchema>;
export type VerifyReportInput = z.output<typeof verifyReportSchema>;
export type StoreReportInput = z.output<typeof storeReportSchema>;

export function toStaffReportQueryInput(searchParams: URLSearchParams) {
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
