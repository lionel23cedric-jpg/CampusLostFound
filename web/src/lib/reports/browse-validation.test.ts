import { describe, expect, it } from "vitest";

import {
  reportBrowseQuerySchema,
  reportIdSchema,
  toReportBrowseQueryInput,
} from "./browse-validation";

function parse(query = "") {
  return reportBrowseQuerySchema.safeParse(
    toReportBrowseQueryInput(new URLSearchParams(query)),
  );
}

describe("report browse validation", () => {
  it("applies empty-query pagination defaults", () => {
    expect(parse("")).toEqual({
      success: true,
      data: { page: 1, pageSize: 12 },
    });
  });

  it("normalises every supported query parameter", () => {
    const parsed = parse(
      "q=%20laptop%20bag%20&reportType=lost&categoryId=64b64c6f2f4d9f1a2b3c4d52" +
        "&campusLocationId=64b64c6f2f4d9f1a2b3c4d53&status=open&color=%20Black%20" +
        "&occurredFrom=2026-08-01T00%3A00%3A00%2B12%3A00" +
        "&occurredTo=2026-08-15T23%3A59%3A59%2B12%3A00&hasPhoto=true&page=2&pageSize=25",
    );

    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("Expected valid browse query");
    expect(parsed.data).toEqual({
      q: "laptop bag",
      reportType: "lost",
      categoryId: "64b64c6f2f4d9f1a2b3c4d52",
      campusLocationId: "64b64c6f2f4d9f1a2b3c4d53",
      status: "open",
      color: "Black",
      occurredFrom: new Date("2026-07-31T12:00:00.000Z"),
      occurredTo: new Date("2026-08-15T11:59:59.000Z"),
      hasPhoto: true,
      page: 2,
      pageSize: 25,
    });
  });

  it.each([
    ["unknown parameter", "sort=title"],
    ["duplicate parameter", "status=open&status=closed"],
    ["short keyword", "q=x"],
    ["long keyword", `q=${"x".repeat(101)}`],
    ["draft status", "status=draft"],
    ["invalid report type", "reportType=missing"],
    ["invalid category", "categoryId=not-an-id"],
    ["invalid location", "campusLocationId=not-an-id"],
    ["blank colour", "color=%20%20"],
    ["long colour", `color=${"x".repeat(33)}`],
    ["date without offset", "occurredFrom=2026-08-15T00:00:00"],
    ["invalid photo flag", "hasPhoto=yes"],
    ["zero page", "page=0"],
    ["fractional page", "page=1.5"],
    ["zero page size", "pageSize=0"],
    ["large page size", "pageSize=51"],
    [
      "reversed date range",
      "occurredFrom=2026-08-16T00%3A00%3A00Z&occurredTo=2026-08-15T00%3A00%3A00Z",
    ],
  ])("rejects %s", (_case, query) => {
    expect(parse(query).success).toBe(false);
  });

  it.each([
    ["two-character keyword", `q=${"x".repeat(2)}`, "q", "x".repeat(2)],
    ["100-character keyword", `q=${"x".repeat(100)}`, "q", "x".repeat(100)],
    ["one-character colour", "color=x", "color", "x"],
    ["32-character colour", `color=${"x".repeat(32)}`, "color", "x".repeat(32)],
    ["first page", "page=1", "page", 1],
    ["one-item page", "pageSize=1", "pageSize", 1],
    ["50-item page", "pageSize=50", "pageSize", 50],
  ])("accepts the %s boundary", (_case, query, field, expected) => {
    const parsed = parse(query);

    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("Expected valid boundary");
    expect(parsed.data[field as keyof typeof parsed.data]).toEqual(expected);
  });

  it.each(["lost", "found"])("accepts the %s report type", (reportType) => {
    const parsed = parse(`reportType=${reportType}`);

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.reportType).toBe(reportType);
  });

  it.each(["open", "claim_pending", "resolved", "closed"])(
    "accepts the %s report status",
    (status) => {
      const parsed = parse(`status=${status}`);

      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.status).toBe(status);
    },
  );

  it("accepts equal date limits and transforms both values", () => {
    const parsed = parse(
      "occurredFrom=2026-08-15T00%3A00%3A00Z&occurredTo=2026-08-15T00%3A00%3A00Z",
    );

    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("Expected equal dates to be valid");
    expect(parsed.data.occurredFrom).toEqual(
      new Date("2026-08-15T00:00:00.000Z"),
    );
    expect(parsed.data.occurredTo).toEqual(
      new Date("2026-08-15T00:00:00.000Z"),
    );
  });

  it.each([
    ["q", "laptop"],
    ["reportType", "lost"],
    ["categoryId", "64b64c6f2f4d9f1a2b3c4d52"],
    ["campusLocationId", "64b64c6f2f4d9f1a2b3c4d53"],
    ["status", "open"],
    ["color", "Black"],
    ["occurredFrom", "2026-08-15T00:00:00Z"],
    ["occurredTo", "2026-08-15T00:00:00Z"],
    ["hasPhoto", "true"],
    ["page", "1"],
    ["pageSize", "12"],
  ])("rejects duplicate %s parameters", (key, value) => {
    const query = new URLSearchParams();
    query.append(key, value);
    query.append(key, value);

    expect(
      reportBrowseQuerySchema.safeParse(toReportBrowseQueryInput(query)).success,
    ).toBe(false);
  });

  it("validates report path IDs", () => {
    expect(reportIdSchema.safeParse("64b64c6f2f4d9f1a2b3c4d54").success).toBe(
      true,
    );
    expect(reportIdSchema.safeParse("not-an-id").success).toBe(false);
  });
});
