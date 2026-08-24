import { describe, expect, it } from "vitest";

import {
  claimListHref,
  parseClaimListSearchParams,
} from "./list-search";

describe("claim list search URLs", () => {
  it("uses safe defaults for an empty query", () => {
    expect(parseClaimListSearchParams(new URLSearchParams())).toEqual({
      values: { status: "", page: 1 },
      request: {},
      ignoredInvalidValues: false,
    });
  });

  it.each([
    "pending",
    "approved",
    "rejected",
    "withdrawn",
    "completed",
  ] as const)("accepts the %s status", (status) => {
    expect(
      parseClaimListSearchParams(new URLSearchParams({ status })),
    ).toEqual({
      values: { status, page: 1 },
      request: { status },
      ignoredInvalidValues: false,
    });
  });

  it.each([
    ["duplicate status", "status=pending&status=approved"],
    ["duplicate page", "page=2&page=3"],
    ["unknown status", "status=unknown"],
    ["page zero", "page=0"],
    ["negative page", "page=-1"],
    ["fractional page", "page=1.5"],
    ["non-numeric page", "page=two"],
    ["unsafe page", "page=9007199254740992"],
    ["page above the backend boundary", "page=10001"],
    ["unknown key", "extra=value"],
  ])("recovers %s without forwarding it", (_case, query) => {
    const result = parseClaimListSearchParams(new URLSearchParams(query));

    expect(result.values).toEqual({ status: "", page: 1 });
    expect(result.request).toEqual({});
    expect(result.ignoredInvalidValues).toBe(true);
  });

  it("keeps valid values while recovering duplicate and unknown keys", () => {
    expect(
      parseClaimListSearchParams(
        new URLSearchParams(
          "status=pending&status=approved&page=4&sort=createdAt",
        ),
      ),
    ).toEqual({
      values: { status: "", page: 4 },
      request: { page: 4 },
      ignoredInvalidValues: true,
    });
  });

  it("accepts page 10,000 at the backend boundary", () => {
    expect(claimListHref({ status: "", page: 10_000 })).toBe(
      "/claims?page=10000",
    );
    expect(
      parseClaimListSearchParams(new URLSearchParams("page=10000")),
    ).toEqual({
      values: { status: "", page: 10_000 },
      request: { page: 10_000 },
      ignoredInvalidValues: false,
    });
  });

  it("round trips a filtered later page in fixed key order", () => {
    const href = claimListHref({ status: "approved", page: 3 });

    expect(href).toBe("/claims?status=approved&page=3");
    expect(
      parseClaimListSearchParams(
        new URL(href, "https://example.test").searchParams,
      ),
    ).toEqual({
      values: { status: "approved", page: 3 },
      request: { status: "approved", page: 3 },
      ignoredInvalidValues: false,
    });
  });

  it("omits page one and supports page-only URLs", () => {
    expect(claimListHref({ status: "", page: 1 })).toBe("/claims");
    expect(claimListHref({ status: "pending", page: 1 })).toBe(
      "/claims?status=pending",
    );
    expect(claimListHref({ status: "", page: 2 })).toBe("/claims?page=2");
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 10_001])(
    "does not serialise the invalid page %s",
    (page) => {
      expect(claimListHref({ status: "pending", page })).toBe(
        "/claims?status=pending",
      );
    },
  );
});
