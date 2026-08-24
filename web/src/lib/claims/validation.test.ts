import { describe, expect, it } from "vitest";

import {
  claimDecisionSchema,
  claimIdSchema,
  claimListQuerySchema,
  createClaimSchema,
  emptyClaimBodySchema,
  toClaimListQueryInput,
} from "./validation";

const response = (questionIndex: number, answer = "Blue paint mark") => ({
  questionIndex,
  answer,
});
const parseQuery = (query = "") =>
  claimListQuerySchema.safeParse(
    toClaimListQueryInput(new URLSearchParams(query)),
  );

describe("claim validation", () => {
  it("trims valid responses without changing their indexes", () => {
    expect(
      createClaimSchema.parse({ responses: [response(0, "  Blue mark  ")] }),
    ).toEqual({
      responses: [response(0, "Blue mark")],
    });
  });

  it("rejects an answer containing only Unicode whitespace", () => {
    expect(
      createClaimSchema.safeParse({ responses: [response(0, "\u0085")] })
        .success,
    ).toBe(false);
  });

  it("rejects an answer containing only a byte-order mark", () => {
    expect(
      createClaimSchema.safeParse({ responses: [response(0, "\uFEFF")] })
        .success,
    ).toBe(false);
  });

  it("trims mixed Unicode edge whitespace but preserves internal whitespace", () => {
    expect(
      createClaimSchema.parse({
        responses: [response(0, "\uFEFF\u0085\u2003Blue\u00a0\t mark\u3000\u0085\uFEFF")],
      }),
    ).toEqual({
      responses: [response(0, "Blue\u00a0\t mark")],
    });
  });

  it("checks the answer length after Unicode edge whitespace is trimmed", () => {
    expect(
      createClaimSchema.parse({
        responses: [response(0, `\u0085${"x".repeat(500)}\u0085`)],
      }),
    ).toEqual({ responses: [response(0, "x".repeat(500))] });
    expect(
      createClaimSchema.safeParse({
        responses: [response(0, `\u0085${"x".repeat(501)}\u0085`)],
      }).success,
    ).toBe(false);
  });

  it("leaves an ASCII answer without edge whitespace unchanged", () => {
    const answer = "Blue paint mark";

    expect(
      createClaimSchema.parse({ responses: [response(0, answer)] }),
    ).toEqual({ responses: [response(0, answer)] });
  });

  it.each([
    ["empty responses", { responses: [] }],
    ["missing zero index", { responses: [response(1)] }],
    ["duplicate index", { responses: [response(0), response(0)] }],
    ["non-contiguous indexes", { responses: [response(0), response(2)] }],
    [
      "too many responses",
      { responses: [0, 1, 2, 3, 4, 5].map((index) => response(index)) },
    ],
    ["blank answer", { responses: [response(0, " ")] }],
    ["long answer", { responses: [response(0, "x".repeat(501))] }],
    [
      "unknown body field",
      { responses: [response(0)], status: "approved" },
    ],
  ])("rejects %s", (_case, input) => {
    expect(createClaimSchema.safeParse(input).success).toBe(false);
  });

  it("normalises a blank review note to null", () => {
    expect(
      claimDecisionSchema.parse({ decision: "approve", reviewNote: "  " }),
    ).toEqual({
      decision: "approve",
      reviewNote: null,
    });
  });

  it.each([
    {},
    { decision: "accept" },
    { decision: "reject", reviewNote: "x".repeat(1001) },
    { decision: "approve", reviewedBy: "client-owned" },
  ])("rejects malformed decisions %#", (input) => {
    expect(claimDecisionSchema.safeParse(input).success).toBe(false);
  });

  it("accepts only an empty command object", () => {
    expect(emptyClaimBodySchema.safeParse({}).success).toBe(true);
    expect(
      emptyClaimBodySchema.safeParse({ status: "withdrawn" }).success,
    ).toBe(false);
  });

  it("applies list defaults and transforms bounded values", () => {
    expect(parseQuery()).toEqual({
      success: true,
      data: { page: 1, pageSize: 20 },
    });
    expect(parseQuery("status=pending&page=2&pageSize=50")).toEqual({
      success: true,
      data: { status: "pending", page: 2, pageSize: 50 },
    });
    expect(parseQuery("page=10000&pageSize=50")).toEqual({
      success: true,
      data: { page: 10_000, pageSize: 50 },
    });
  });

  it.each([
    "status=unknown",
    "page=0",
    "page=1.5",
    "page=10001",
    "pageSize=51",
    "sort=createdAt",
    "status=pending&status=approved",
  ])("rejects list query %s", (query) => {
    expect(parseQuery(query).success).toBe(false);
  });

  it("validates claim IDs", () => {
    expect(
      claimIdSchema.safeParse("64b64c6f2f4d9f1a2b3c4d54").success,
    ).toBe(true);
    expect(claimIdSchema.safeParse("not-an-id").success).toBe(false);
  });
});
