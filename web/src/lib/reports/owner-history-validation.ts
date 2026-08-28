import { z } from "zod";

import { REPORT_STATUSES } from "@/models/item-report";

export const OWNER_REPORT_HISTORY_PAGE_SIZE = 10;

const canonicalPage = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(10_000));

export const ownerReportHistoryQuerySchema = z.strictObject({
  reportType: z.enum(["lost", "found"]).optional(),
  status: z.enum(REPORT_STATUSES).optional(),
  page: canonicalPage.default(1),
});

export type OwnerReportHistoryQuery = z.output<
  typeof ownerReportHistoryQuerySchema
>;
