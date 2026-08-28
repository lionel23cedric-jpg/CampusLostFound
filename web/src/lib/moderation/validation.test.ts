import { describe, expect, it } from "vitest";

import {
  MODERATION_PAGE_SIZE,
  adminFlagListQuerySchema,
  adminReportListQuerySchema,
  isJsonRequest,
  moderationObjectIdSchema,
  reportFlagDecisionSchema,
  reportModerationSchema,
  submitReportFlagSchema,
  toModerationQueryInput,
} from "./validation";

const reportId = "64b64c6f2f4d9f1a2b3c4d51";
const flagUpdatedAt = "2026-08-28T01:00:00.000Z";
const reportUpdatedAt = "2026-08-28T01:05:00.000Z";

describe("moderation validation", () => {
  it("normalizes the complete administrator report query", () => {
    expect(
      adminReportListQuerySchema.parse(
        toModerationQueryInput(
          new URLSearchParams(
            "q=%EF%BC%ACaptop++bag&reportType=lost&reportStatus=open" +
              "&moderationStatus=hidden&page=2",
          ),
        ),
      ),
    ).toEqual({
      q: "Laptop bag",
      reportType: "lost",
      reportStatus: "open",
      moderationStatus: "hidden",
      page: 2,
    });
    expect(MODERATION_PAGE_SIZE).toBe(20);
  });

  it("applies exact list defaults", () => {
    expect(adminReportListQuerySchema.parse({})).toEqual({ page: 1 });
    expect(adminFlagListQuerySchema.parse({})).toEqual({ page: 1 });
  });

  it.each([
    "page=0",
    "page=01",
    "page=10001",
    "reportType=missing",
    "reportStatus=draft",
    "moderationStatus=deleted",
    "q=",
    "q=a&q=b",
    "page=1&page=2",
    "unknown=value",
  ])("rejects administrator report query %s", (query) => {
    expect(
      adminReportListQuerySchema.safeParse(
        toModerationQueryInput(new URLSearchParams(query)),
      ).success,
    ).toBe(false);
  });

  it("normalizes the exact flag query", () => {
    expect(
      adminFlagListQuerySchema.parse(
        toModerationQueryInput(
          new URLSearchParams(
            "status=pending&reason=privacy_concern&page=3",
          ),
        ),
      ),
    ).toEqual({
      status: "pending",
      reason: "privacy_concern",
      page: 3,
    });
  });

  it.each([
    "status=reopened",
    "reason=administrative_review",
    "reason=privacy_concern&reason=other",
    "page=-1",
    "ownerId=private",
  ])("rejects administrator flag query %s", (query) => {
    expect(
      adminFlagListQuerySchema.safeParse(
        toModerationQueryInput(new URLSearchParams(query)),
      ).success,
    ).toBe(false);
  });

  it("normalizes Unicode text and rejects unsafe controls", () => {
    expect(
      adminReportListQuerySchema.parse({ q: "  Ｋｅｙｓ   bag  " }),
    ).toEqual({ q: "Keys bag", page: 1 });
    expect(
      adminReportListQuerySchema.safeParse({ q: "keys\u0000bag" }).success,
    ).toBe(false);
    expect(
      adminReportListQuerySchema.safeParse({ q: "a".repeat(81) }).success,
    ).toBe(false);
  });

  it("canonicalizes ObjectIds", () => {
    expect(moderationObjectIdSchema.parse(reportId.toUpperCase())).toBe(
      reportId,
    );
    expect(moderationObjectIdSchema.safeParse("not-an-id").success).toBe(
      false,
    );
  });

  it("normalizes optional member details", () => {
    expect(
      submitReportFlagSchema.parse({
        reason: "privacy_concern",
        details: "  Public   phone number  ",
      }),
    ).toEqual({
      reason: "privacy_concern",
      details: "Public phone number",
    });
    expect(
      submitReportFlagSchema.parse({ reason: "suspected_fraud" }),
    ).toEqual({ reason: "suspected_fraud", details: null });
    expect(
      submitReportFlagSchema.parse({
        reason: "duplicate_report",
        details: "   ",
      }),
    ).toEqual({ reason: "duplicate_report", details: null });
  });

  it("requires details only for other", () => {
    expect(
      submitReportFlagSchema.safeParse({ reason: "other", details: " " })
        .success,
    ).toBe(false);
    expect(
      submitReportFlagSchema.safeParse({
        reason: "other",
        details: "A different concern",
      }).success,
    ).toBe(true);
  });

  it("enforces detail limits and rejects authority fields", () => {
    expect(
      submitReportFlagSchema.safeParse({
        reason: "privacy_concern",
        details: "a".repeat(500),
      }).success,
    ).toBe(true);
    expect(
      submitReportFlagSchema.safeParse({
        reason: "privacy_concern",
        details: "a".repeat(501),
      }).success,
    ).toBe(false);
    expect(
      submitReportFlagSchema.safeParse({
        reason: "privacy_concern",
        submittedByUserId: reportId,
      }).success,
    ).toBe(false);
  });

  it("accepts only the exact flag decision unions", () => {
    expect(
      reportFlagDecisionSchema.parse({
        decision: "dismiss",
        expectedFlagUpdatedAt: flagUpdatedAt,
        note: "  No   policy issue  ",
      }),
    ).toEqual({
      decision: "dismiss",
      expectedFlagUpdatedAt: flagUpdatedAt,
      note: "No policy issue",
    });
    expect(
      reportFlagDecisionSchema.safeParse({
        decision: "dismiss",
        expectedFlagUpdatedAt: flagUpdatedAt,
        expectedReportUpdatedAt: reportUpdatedAt,
      }).success,
    ).toBe(false);
    expect(
      reportFlagDecisionSchema.safeParse({
        decision: "hide_report",
        expectedFlagUpdatedAt: flagUpdatedAt,
        expectedReportUpdatedAt: reportUpdatedAt,
        note: null,
      }).success,
    ).toBe(true);
    expect(
      reportFlagDecisionSchema.safeParse({
        decision: "hide_report",
        expectedFlagUpdatedAt: flagUpdatedAt,
      }).success,
    ).toBe(false);
  });

  it("accepts exact direct hide and restore unions", () => {
    expect(
      reportModerationSchema.parse({
        moderationStatus: "hidden",
        reason: "administrative_review",
        expectedUpdatedAt: reportUpdatedAt,
        note: "  Manual   review  ",
      }),
    ).toEqual({
      moderationStatus: "hidden",
      reason: "administrative_review",
      expectedUpdatedAt: reportUpdatedAt,
      note: "Manual review",
    });
    expect(
      reportModerationSchema.safeParse({
        moderationStatus: "visible",
        reason: "administrative_review",
        expectedUpdatedAt: reportUpdatedAt,
      }).success,
    ).toBe(false);
    expect(
      reportModerationSchema.parse({
        moderationStatus: "visible",
        expectedUpdatedAt: reportUpdatedAt,
      }),
    ).toEqual({
      moderationStatus: "visible",
      expectedUpdatedAt: reportUpdatedAt,
      note: null,
    });
  });

  it("rejects malformed timestamps, unsafe notes and unknown mutation fields", () => {
    expect(
      reportFlagDecisionSchema.safeParse({
        decision: "dismiss",
        expectedFlagUpdatedAt: "yesterday",
        note: "a".repeat(501),
      }).success,
    ).toBe(false);
    expect(
      reportModerationSchema.safeParse({
        moderationStatus: "hidden",
        reason: "administrative_review",
        expectedUpdatedAt: reportUpdatedAt,
        note: "unsafe\u0000note",
      }).success,
    ).toBe(false);
    expect(
      reportModerationSchema.safeParse({
        moderationStatus: "hidden",
        reason: "administrative_review",
        expectedUpdatedAt: reportUpdatedAt,
        administratorId: reportId,
      }).success,
    ).toBe(false);
  });

  it.each([
    ["application/json", true],
    ["application/json; charset=utf-8", true],
    ["APPLICATION/JSON ; charset=UTF-8", true],
    ["text/plain", false],
    [null, false],
  ])("classifies content type %s", (contentType, expected) => {
    const headers = new Headers();
    if (contentType !== null) headers.set("content-type", contentType);
    expect(
      isJsonRequest(new Request("http://localhost", { headers })),
    ).toBe(expected);
  });
});
