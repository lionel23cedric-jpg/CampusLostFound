import { describe, expect, it } from "vitest";

import {
  parseStaffClaimListSearchParams,
  staffClaimListHref,
} from "./staff-list-search";

describe("staff claim list search URLs", () => {
  it("uses pending page one as the canonical default", () => {
    expect(parseStaffClaimListSearchParams(new URLSearchParams())).toEqual({
      values: { status: "pending", page: 1 },
      request: {},
      ignoredInvalidValues: false,
    });
    expect(staffClaimListHref({ status: "pending", page: 1 })).toBe(
      "/staff/claims",
    );
  });

  it.each([
    "pending",
    "approved",
    "rejected",
    "withdrawn",
    "completed",
  ] as const)("accepts and canonicalises the %s status", (status) => {
    expect(
      parseStaffClaimListSearchParams(new URLSearchParams({ status })),
    ).toEqual({
      values: { status, page: 1 },
      request: status === "pending" ? {} : { status },
      ignoredInvalidValues: false,
    });
    expect(staffClaimListHref({ status, page: 1 })).toBe(
      status === "pending" ? "/staff/claims" : `/staff/claims?status=${status}`,
    );
  });

  it("preserves a supported status and bounded page", () => {
    expect(
      parseStaffClaimListSearchParams(
        new URLSearchParams("status=completed&page=2"),
      ),
    ).toEqual({
      values: { status: "completed", page: 2 },
      request: { status: "completed", page: 2 },
      ignoredInvalidValues: false,
    });
    expect(staffClaimListHref({ status: "completed", page: 2 })).toBe(
      "/staff/claims?status=completed&page=2",
    );
  });

  it("omits an explicit pending status while preserving a later page", () => {
    expect(
      parseStaffClaimListSearchParams(
        new URLSearchParams("status=pending&page=2"),
      ),
    ).toEqual({
      values: { status: "pending", page: 2 },
      request: { page: 2 },
      ignoredInvalidValues: false,
    });
    expect(staffClaimListHref({ status: "pending", page: 2 })).toBe(
      "/staff/claims?page=2",
    );
  });

  it.each([
    ["unknown status", "status=unknown"],
    ["empty status", "status="],
    ["duplicate status", "status=pending&status=approved"],
    ["duplicate page", "page=2&page=3"],
    ["empty page", "page="],
    ["page zero", "page=0"],
    ["negative page", "page=-1"],
    ["fractional page", "page=1.5"],
    ["exponent page", "page=1e2"],
    ["whitespace page", "page=%202"],
    ["unsafe page", "page=9007199254740992"],
    ["page above the backend boundary", "page=10001"],
    ["unknown key", "sort=createdAt"],
  ])("recovers %s to the canonical defaults", (_case, query) => {
    expect(
      parseStaffClaimListSearchParams(new URLSearchParams(query)),
    ).toEqual({
      values: { status: "pending", page: 1 },
      request: {},
      ignoredInvalidValues: true,
    });
  });

  it("keeps valid values while ignoring duplicate and unknown keys", () => {
    expect(
      parseStaffClaimListSearchParams(
        new URLSearchParams(
          "status=approved&status=completed&page=4&sort=createdAt",
        ),
      ),
    ).toEqual({
      values: { status: "pending", page: 4 },
      request: { page: 4 },
      ignoredInvalidValues: true,
    });
  });

  it("accepts page 10,000 at the backend boundary", () => {
    expect(
      parseStaffClaimListSearchParams(new URLSearchParams("page=10000")),
    ).toEqual({
      values: { status: "pending", page: 10_000 },
      request: { page: 10_000 },
      ignoredInvalidValues: false,
    });
    expect(staffClaimListHref({ status: "pending", page: 10_000 })).toBe(
      "/staff/claims?page=10000",
    );
  });

  it.each([
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    10_001,
  ])("does not serialise the invalid page %s", (page) => {
    expect(staffClaimListHref({ status: "pending", page })).toBe(
      "/staff/claims",
    );
  });

  it("round trips a filtered later page in fixed key order", () => {
    const href = staffClaimListHref({ status: "approved", page: 3 });

    expect(href).toBe("/staff/claims?status=approved&page=3");
    expect(
      parseStaffClaimListSearchParams(
        new URL(href, "https://example.test").searchParams,
      ),
    ).toEqual({
      values: { status: "approved", page: 3 },
      request: { status: "approved", page: 3 },
      ignoredInvalidValues: false,
    });
  });
});
