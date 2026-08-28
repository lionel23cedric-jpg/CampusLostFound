import { describe, expect, it } from "vitest";

import {
  ownerReportHistoryHref,
  parseOwnerReportHistorySearchParams,
} from "./owner-history-search";

describe("owner report history URL state", () => {
  it("parses approved filters and page", () => {
    expect(
      parseOwnerReportHistorySearchParams(
        new URLSearchParams("reportType=found&status=closed&page=3"),
      ),
    ).toEqual({
      values: { reportType: "found", status: "closed" },
      request: { reportType: "found", status: "closed", page: 3 },
      ignoredInvalidValues: false,
    });
  });

  it("uses empty defaults and omits page one", () => {
    expect(parseOwnerReportHistorySearchParams(new URLSearchParams())).toEqual({
      values: { reportType: "", status: "" },
      request: {},
      ignoredInvalidValues: false,
    });
    expect(
      parseOwnerReportHistorySearchParams(new URLSearchParams("page=1")),
    ).toEqual({
      values: { reportType: "", status: "" },
      request: {},
      ignoredInvalidValues: false,
    });
  });

  it.each(["lost", "found"] as const)("parses report type %s", (reportType) => {
    expect(
      parseOwnerReportHistorySearchParams(
        new URLSearchParams(`reportType=${reportType}`),
      ).request,
    ).toEqual({ reportType });
  });

  it.each(["draft", "open", "claim_pending", "resolved", "closed"] as const)(
    "parses status %s",
    (status) => {
      expect(
        parseOwnerReportHistorySearchParams(
          new URLSearchParams(`status=${status}`),
        ).request,
      ).toEqual({ status });
    },
  );

  it.each([
    "reportType=lost&reportType=found",
    "status=open&status=closed",
    "page=1&page=2",
    "page=01",
    "page=0",
    "page=-1",
    "page=+1",
    "page=1.0",
    "page=1e2",
    "page=10001",
    "reportType=other",
    "status=other",
    "reporterId=other-user",
  ])("ignores and marks invalid URL state %s", (query) => {
    const parsed = parseOwnerReportHistorySearchParams(
      new URLSearchParams(query),
    );

    expect(parsed.ignoredInvalidValues).toBe(true);
    expect(parsed.request).toEqual({});
  });

  it("keeps valid siblings when another value is invalid", () => {
    expect(
      parseOwnerReportHistorySearchParams(
        new URLSearchParams("reportType=lost&status=other&page=2"),
      ),
    ).toEqual({
      values: { reportType: "lost", status: "" },
      request: { reportType: "lost", page: 2 },
      ignoredInvalidValues: true,
    });
  });

  it("builds canonical stable history hrefs", () => {
    expect(
      ownerReportHistoryHref({
        reportType: "lost",
        status: "draft",
        page: 2,
      }),
    ).toBe("/reports/mine?reportType=lost&status=draft&page=2");
    expect(ownerReportHistoryHref({ page: 1 })).toBe("/reports/mine");
    expect(ownerReportHistoryHref({})).toBe("/reports/mine");
  });

  it.each([0, -1, 1.5, 10_001, Number.NaN])(
    "omits unsafe href page %s",
    (page) => {
      expect(ownerReportHistoryHref({ reportType: "found", page })).toBe(
        "/reports/mine?reportType=found",
      );
    },
  );
});
