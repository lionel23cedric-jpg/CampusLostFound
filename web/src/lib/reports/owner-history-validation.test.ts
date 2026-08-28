import { describe, expect, it } from "vitest";

import {
  OWNER_REPORT_HISTORY_PAGE_SIZE,
  ownerReportHistoryQuerySchema,
} from "./owner-history-validation";

describe("owner report history query", () => {
  it("uses fixed defaults", () => {
    expect(ownerReportHistoryQuerySchema.parse({})).toEqual({ page: 1 });
    expect(OWNER_REPORT_HISTORY_PAGE_SIZE).toBe(10);
  });

  it.each(["lost", "found"])("accepts report type %s", (reportType) => {
    expect(ownerReportHistoryQuerySchema.parse({ reportType })).toEqual({
      reportType,
      page: 1,
    });
  });

  it.each(["draft", "open", "claim_pending", "resolved", "closed"])(
    "accepts status %s",
    (status) => {
      expect(ownerReportHistoryQuerySchema.parse({ status })).toEqual({
        status,
        page: 1,
      });
    },
  );

  it.each(["1", "2", "10000"])("accepts canonical page %s", (page) => {
    expect(ownerReportHistoryQuerySchema.parse({ page }).page).toBe(
      Number(page),
    );
  });

  it.each(["0", "-1", "+1", "01", "1.0", "1e2", "10001", ""])(
    "rejects non-canonical or out-of-range page %s",
    (page) => {
      expect(ownerReportHistoryQuerySchema.safeParse({ page }).success).toBe(
        false,
      );
    },
  );

  it.each([
    { reporterId: "64b64c6f2f4d9f1a2b3c4d51" },
    { userId: "64b64c6f2f4d9f1a2b3c4d51" },
    { moderationStatus: "hidden" },
    { pageSize: "50" },
    { sort: "createdAt" },
    { reportType: ["lost", "found"] },
    { status: ["open", "closed"] },
    { page: ["1", "2"] },
  ])("rejects an over-broad or repeated input %#", (input) => {
    expect(ownerReportHistoryQuerySchema.safeParse(input).success).toBe(false);
  });
});
