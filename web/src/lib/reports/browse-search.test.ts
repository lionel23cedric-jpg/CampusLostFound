import { describe, expect, it } from "vitest";

import {
  createEmptyReportSearchValues,
  parseReportSearchParams,
  reportSearchHref,
  validateReportSearch,
  type ReportSearchValues,
} from "./browse-search";

const categoryId = "64b64c6f2f4d9f1a2b3c4d52";
const campusLocationId = "64b64c6f2f4d9f1a2b3c4d53";

function values(overrides: Partial<ReportSearchValues> = {}) {
  return { ...createEmptyReportSearchValues(), ...overrides };
}

describe("report browse search URLs", () => {
  it("creates blank browser values and an empty request", () => {
    expect(createEmptyReportSearchValues()).toEqual({
      q: "",
      reportType: "",
      categoryId: "",
      campusLocationId: "",
      status: "",
      color: "",
      occurredFrom: "",
      occurredTo: "",
      hasPhoto: "",
    });
    expect(parseReportSearchParams(new URLSearchParams())).toEqual({
      values: createEmptyReportSearchValues(),
      request: {},
      ignoredInvalidValues: false,
    });
  });

  it("round-trips valid filters and preserves a requested page", () => {
    const params = new URLSearchParams(
      "q=laptop+bag&reportType=lost&status=open&hasPhoto=true&page=3",
    );
    const parsed = parseReportSearchParams(params);

    expect(parsed.values.q).toBe("laptop bag");
    expect(parsed.request).toMatchObject({
      q: "laptop bag",
      reportType: "lost",
      status: "open",
      hasPhoto: true,
      page: 3,
    });
    expect(reportSearchHref(parsed.request)).toBe(
      "/reports?q=laptop+bag&reportType=lost&status=open&hasPhoto=true&page=3",
    );
  });

  it("trims text and serialises every filter in canonical order", () => {
    const result = validateReportSearch(
      values({
        q: "  laptop bag  ",
        reportType: "found",
        categoryId,
        campusLocationId,
        status: "claim_pending",
        color: "  Black  ",
        hasPhoto: "false",
      }),
    );

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("Expected valid filters");
    expect(reportSearchHref(result.request)).toBe(
      `/reports?q=laptop+bag&reportType=found&categoryId=${categoryId}` +
        `&campusLocationId=${campusLocationId}&status=claim_pending` +
        "&color=Black&hasPhoto=false",
    );
  });

  it("converts complete local date bounds to explicit ISO offsets", () => {
    const result = validateReportSearch(
      values({ occurredFrom: "2026-08-01", occurredTo: "2026-08-02" }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.request.occurredFrom).toBe(
      new Date(2026, 7, 1, 0, 0, 0, 0).toISOString(),
    );
    expect(result.request.occurredTo).toBe(
      new Date(2026, 7, 2, 23, 59, 59, 999).toISOString(),
    );
  });

  it("restores canonical ISO date bounds as local date controls", () => {
    const occurredFrom = new Date(2026, 7, 1, 0, 0, 0, 0).toISOString();
    const occurredTo = new Date(2026, 7, 2, 23, 59, 59, 999).toISOString();
    const parsed = parseReportSearchParams(
      new URLSearchParams({ occurredFrom, occurredTo }),
    );

    expect(parsed.values.occurredFrom).toBe("2026-08-01");
    expect(parsed.values.occurredTo).toBe("2026-08-02");
    expect(parsed.request).toMatchObject({ occurredFrom, occurredTo });
  });

  it.each([
    ["two-character keyword", { q: "xx" }, "q", "xx"],
    ["100-character keyword", { q: "x".repeat(100) }, "q", "x".repeat(100)],
    ["one-character colour", { color: "x" }, "color", "x"],
    ["32-character colour", { color: "x".repeat(32) }, "color", "x".repeat(32)],
  ] as const)("accepts the %s boundary", (_case, overrides, field, expected) => {
    const result = validateReportSearch(values(overrides));

    expect(result.success).toBe(true);
    if (result.success) expect(result.request[field]).toBe(expected);
  });

  it.each([
    ["one-character keyword", { q: "x" }, "q"],
    ["101-character keyword", { q: "x".repeat(101) }, "q"],
    ["33-character colour", { color: "x".repeat(33) }, "color"],
    ["invalid category", { categoryId: "not-an-object-id" }, "categoryId"],
    ["invalid location", { campusLocationId: "not-an-object-id" }, "campusLocationId"],
    ["invalid calendar start", { occurredFrom: "2026-02-30" }, "occurredFrom"],
    ["invalid calendar end", { occurredTo: "2026-13-01" }, "occurredTo"],
  ] as const)("returns a field error for %s", (_case, overrides, field) => {
    const result = validateReportSearch(values(overrides));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[field]).toBeTruthy();
  });

  it("rejects a reversed local date range on the end field", () => {
    const result = validateReportSearch(
      values({ occurredFrom: "2026-08-03", occurredTo: "2026-08-02" }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.occurredTo).toBeTruthy();
  });

  it.each([
    ["report type", "reportType=missing", "reportType"],
    ["status", "status=draft", "status"],
    ["photo flag", "hasPhoto=yes", "hasPhoto"],
    ["category", "categoryId=invalid", "categoryId"],
    ["location", "campusLocationId=invalid", "campusLocationId"],
    ["page zero", "page=0", "page"],
    ["fractional page", "page=1.5", "page"],
    ["unsafe page", `page=${Math.floor(Number.MAX_SAFE_INTEGER / 12) + 2}`, "page"],
  ])("ignores an invalid URL %s", (_case, query, invalidKey) => {
    const parsed = parseReportSearchParams(
      new URLSearchParams(`q=laptop&${query}`),
    );

    expect(parsed.ignoredInvalidValues).toBe(true);
    expect(parsed.request.q).toBe("laptop");
    expect(parsed.request).not.toHaveProperty(invalidKey);
  });

  it("ignores duplicate and unknown keys without dropping valid filters", () => {
    const parsed = parseReportSearchParams(
      new URLSearchParams(
        "q=laptop&q=charger&status=open&sort=createdAt&pageSize=50",
      ),
    );

    expect(parsed).toMatchObject({
      values: { q: "", status: "open" },
      request: { status: "open" },
      ignoredInvalidValues: true,
    });
  });

  it("recovers from invalid text and reversed URL dates", () => {
    const from = new Date(2026, 7, 3, 0, 0, 0, 0).toISOString();
    const to = new Date(2026, 7, 2, 23, 59, 59, 999).toISOString();
    const parsed = parseReportSearchParams(
      new URLSearchParams({ q: "x", color: "x".repeat(33), occurredFrom: from, occurredTo: to }),
    );

    expect(parsed.ignoredInvalidValues).toBe(true);
    expect(parsed.values).toMatchObject({
      q: "",
      color: "",
      occurredFrom: "2026-08-03",
      occurredTo: "",
    });
    expect(parsed.request).toEqual({ occurredFrom: from });
  });

  it.each([
    ["invalid date text", "occurredFrom=2026-08-01", "occurredFrom"],
    ["invalid ISO date", "occurredTo=2026-02-30T00%3A00%3A00.000Z", "occurredTo"],
  ])("ignores %s", (_case, query, invalidKey) => {
    const parsed = parseReportSearchParams(new URLSearchParams(query));

    expect(parsed.ignoredInvalidValues).toBe(true);
    expect(parsed.request).not.toHaveProperty(invalidKey);
  });

  it("omits page one, supports page-only URLs and preserves filters for pagination", () => {
    expect(reportSearchHref({ page: 1 })).toBe("/reports");
    expect(reportSearchHref({ page: 2 })).toBe("/reports?page=2");
    expect(
      reportSearchHref({ q: "laptop", status: "open", hasPhoto: false, page: 4 }),
    ).toBe("/reports?q=laptop&status=open&hasPhoto=false&page=4");
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER])(
    "does not serialise the unsafe page %s",
    (page) => {
      expect(reportSearchHref({ q: "laptop", page })).toBe("/reports?q=laptop");
    },
  );
});
