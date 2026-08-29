import { describe, expect, it } from "vitest";

import {
  parseStaffReportListSearchParams,
  staffReportListHref,
  type StaffReportListSearch,
} from "./list-search";

const defaultValues: StaffReportListSearch = {
  reportType: "all",
  reportStatus: "active",
  verificationStatus: "pending",
  custodyStatus: "all",
  page: 1,
};
const defaults = {
  values: defaultValues,
  request: { verificationStatus: "pending" },
  ignoredInvalidValues: false,
};

describe("staff report list search URLs", () => {
  it("uses the pending active queue as an empty canonical URL", () => {
    expect(parseStaffReportListSearchParams(new URLSearchParams())).toEqual(
      defaults,
    );
    expect(staffReportListHref(defaults.values)).toBe("/staff/reports");
  });

  it("round trips every filter in stable key order", () => {
    const values = {
      reportType: "found" as const,
      reportStatus: "resolved" as const,
      verificationStatus: "verified" as const,
      custodyStatus: "stored" as const,
      page: 3,
    };
    const href = staffReportListHref(values);
    expect(href).toBe(
      "/staff/reports?reportType=found&reportStatus=resolved&verificationStatus=verified&custodyStatus=stored&page=3",
    );
    expect(
      parseStaffReportListSearchParams(
        new URL(href, "https://example.test").searchParams,
      ),
    ).toEqual({
      values,
      request: values,
      ignoredInvalidValues: false,
    });
  });

  it("maps display-only all and active values to omitted API filters", () => {
    expect(
      parseStaffReportListSearchParams(
        new URLSearchParams(
          "reportType=all&reportStatus=active&verificationStatus=all&custodyStatus=all",
        ),
      ),
    ).toEqual({
      values: {
        ...defaults.values,
        verificationStatus: "all",
      },
      request: {},
      ignoredInvalidValues: false,
    });
  });

  it.each([
    ["unknown key", "sort=title"],
    ["duplicate", "reportType=lost&reportType=found"],
    ["invalid enum", "custodyStatus=missing"],
    ["noncanonical page", "page=01"],
    ["page above boundary", "page=10001"],
  ])("recovers from %s", async (_case, query) => {
    expect(
      parseStaffReportListSearchParams(new URLSearchParams(query)),
    ).toMatchObject({
      ignoredInvalidValues: true,
    });
  });

  it("keeps independent valid filters while dropping an invalid value", () => {
    expect(
      parseStaffReportListSearchParams(
        new URLSearchParams("reportType=found&custodyStatus=bad&page=4"),
      ),
    ).toEqual({
      values: {
        ...defaults.values,
        reportType: "found",
        page: 4,
      },
      request: { reportType: "found", verificationStatus: "pending", page: 4 },
      ignoredInvalidValues: true,
    });
  });

  it.each([
    ["Lost stored", "reportType=lost&custodyStatus=stored"],
    ["Found not applicable", "reportType=found&custodyStatus=not_applicable"],
    ["pending released", "verificationStatus=pending&custodyStatus=released"],
  ])("drops incompatible %s custody", (_case, query) => {
    const parsed = parseStaffReportListSearchParams(new URLSearchParams(query));
    expect(parsed.values.custodyStatus).toBe("all");
    expect(parsed.request).not.toHaveProperty("custodyStatus");
    expect(parsed.ignoredInvalidValues).toBe(true);
  });

  it("never serialises incompatible custody combinations", () => {
    expect(
      staffReportListHref({
        ...defaults.values,
        reportType: "lost",
        verificationStatus: "verified",
        custodyStatus: "stored",
      }),
    ).toBe(
      "/staff/reports?reportType=lost&verificationStatus=verified",
    );
  });

  it.each([0, -1, 1.5, Number.NaN, 10_001])(
    "does not serialise invalid page %s",
    (page) => {
      expect(staffReportListHref({ ...defaults.values, page })).toBe(
        "/staff/reports",
      );
    },
  );
});
