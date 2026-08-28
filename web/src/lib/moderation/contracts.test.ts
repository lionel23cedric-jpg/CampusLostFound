import { describe, expect, it } from "vitest";

import {
  adminReportFlagDecisionResultSchema,
  adminReportFlagPageSchema,
  adminReportPageSchema,
  parseAdminReportFlagPage,
  parseAdminReportPage,
  reportFlagReceiptSchema,
  toAdminReportFlag,
  toAdminReportSummary,
  toReportFlagReceipt,
} from "./contracts";

const reportId = "64b64c6f2f4d9f1a2b3c4d51";
const categoryId = "64b64c6f2f4d9f1a2b3c4d52";
const campusLocationId = "64b64c6f2f4d9f1a2b3c4d53";
const flagId = "64b64c6f2f4d9f1a2b3c4d54";
const createdAt = new Date("2026-08-28T02:00:00.000Z");
const updatedAt = new Date("2026-08-28T03:00:00.000Z");

const identifier = (value: string) => ({ toString: () => value });

function adminReportRecord(overrides: Record<string, unknown> = {}) {
  return {
    _id: identifier(reportId),
    reportType: "lost",
    title: "Black laptop bag",
    publicDescription: "Black laptop bag with a shoulder strap.",
    categoryId: identifier(categoryId),
    campusLocationId: identifier(campusLocationId),
    occurredAt: new Date("2026-08-28T01:00:00.000Z"),
    colors: ["black"],
    tags: ["laptop", "bag"],
    photoUrls: ["https://images.example.test/bag.jpg"],
    status: "open",
    moderationStatus: "visible",
    privacySettings: {
      showPhoto: false,
      showEventDate: false,
      showCampusLocation: false,
    },
    resolvedAt: null,
    createdAt,
    updatedAt,
    ...overrides,
  };
}

function flagRecord(overrides: Record<string, unknown> = {}) {
  return {
    _id: identifier(flagId),
    reportId: identifier(reportId),
    reason: "privacy_concern",
    details: "The description contains a phone number.",
    status: "pending",
    reviewedAt: null,
    resolutionNote: null,
    createdAt,
    updatedAt,
    ...overrides,
  };
}

const expectedReport = {
  id: reportId,
  reportType: "lost" as const,
  title: "Black laptop bag",
  publicDescription: "Black laptop bag with a shoulder strap.",
  categoryId,
  campusLocationId,
  occurredAt: "2026-08-28T01:00:00.000Z",
  colors: ["black"],
  tags: ["laptop", "bag"],
  photoUrls: ["https://images.example.test/bag.jpg"],
  status: "open" as const,
  moderationStatus: "visible" as const,
  privacySettings: {
    showPhoto: false,
    showEventDate: false,
    showCampusLocation: false,
  },
  resolvedAt: null,
  createdAt: createdAt.toISOString(),
  updatedAt: updatedAt.toISOString(),
};

describe("moderation success contracts", () => {
  it("maps a legacy report to the complete administrator allow list", () => {
    expect(
      toAdminReportSummary(
        adminReportRecord({
          moderationStatus: undefined,
          reporterId: "PRIVATE-REPORTER",
          serialNumber: "PRIVATE-SERIAL",
          expectedAnswer: "PRIVATE-ANSWER",
        }),
      ),
    ).toEqual(expectedReport);
  });

  it("maps hidden state and clones stored arrays", () => {
    const source = adminReportRecord({ moderationStatus: "hidden" });
    const result = toAdminReportSummary(source);

    expect(result.moderationStatus).toBe("hidden");
    expect(result.colors).not.toBe(source.colors);
    expect(result.tags).not.toBe(source.tags);
    expect(result.photoUrls).not.toBe(source.photoUrls);
  });

  it("rejects an unknown stored moderation value", () => {
    expect(() =>
      toAdminReportSummary(
        adminReportRecord({ moderationStatus: "removed" }),
      ),
    ).toThrow("Report moderation status is invalid");
  });

  it("returns the minimal member receipt", () => {
    const receipt = toReportFlagReceipt({
      ...flagRecord(),
      submittedByUserId: "PRIVATE-FLAGGER",
      details: "PRIVATE-DETAIL",
    });

    expect(reportFlagReceiptSchema.parse(receipt)).toEqual({
      id: flagId,
      reportId,
      reason: "privacy_concern",
      status: "pending",
      createdAt: createdAt.toISOString(),
    });
    expect(JSON.stringify(receipt)).not.toContain("PRIVATE");
  });

  it("maps an administrator flag without actor identities", () => {
    const result = toAdminReportFlag(
      flagRecord({
        status: "dismissed",
        reviewedAt: updatedAt,
        resolutionNote: "No policy issue found",
        submittedByUserId: "PRIVATE-FLAGGER",
        reviewedByAdministratorId: "PRIVATE-ADMIN",
      }),
      adminReportRecord({
        reporterId: "PRIVATE-REPORTER",
        privateNotes: "PRIVATE-NOTE",
      }),
    );

    expect(result).toEqual({
      id: flagId,
      reason: "privacy_concern",
      details: "The description contains a phone number.",
      status: "dismissed",
      reviewedAt: updatedAt.toISOString(),
      resolutionNote: "No policy issue found",
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      report: expectedReport,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /PRIVATE|reporterId|submittedByUserId|reviewedByAdministratorId/,
    );
  });

  it("parses a complete report page and total", () => {
    expect(
      parseAdminReportPage(
        [
          {
            reports: [adminReportRecord()],
            metadata: [{ totalItems: 21 }],
          },
        ],
        2,
      ),
    ).toEqual({
      reports: [expectedReport],
      pagination: {
        page: 2,
        pageSize: 20,
        totalItems: 21,
        totalPages: 2,
      },
    });
  });

  it("parses a complete flag page and total", () => {
    expect(
      parseAdminReportFlagPage(
        [
          {
            flags: [
              {
                ...flagRecord(),
                report: adminReportRecord(),
              },
            ],
            metadata: [{ totalItems: 1 }],
          },
        ],
        1,
      ),
    ).toEqual({
      flags: [
        {
          id: flagId,
          reason: "privacy_concern",
          details: "The description contains a phone number.",
          status: "pending",
          reviewedAt: null,
          resolutionNote: null,
          createdAt: createdAt.toISOString(),
          updatedAt: updatedAt.toISOString(),
          report: expectedReport,
        },
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      },
    });
  });

  it("returns complete empty pages", () => {
    expect(
      parseAdminReportPage([{ reports: [], metadata: [] }], 3),
    ).toEqual({
      reports: [],
      pagination: {
        page: 3,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
      },
    });
    expect(
      parseAdminReportFlagPage([{ flags: [], metadata: [] }], 2),
    ).toEqual({
      flags: [],
      pagination: {
        page: 2,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
      },
    });
  });

  it("rejects inconsistent or over-size pages", () => {
    expect(
      adminReportPageSchema.safeParse({
        reports: [],
        pagination: {
          page: 1,
          pageSize: 20,
          totalItems: 21,
          totalPages: 1,
        },
      }).success,
    ).toBe(false);
    expect(
      adminReportFlagPageSchema.safeParse({
        flags: Array.from({ length: 21 }, () => ({
          ...flagRecord(),
          report: expectedReport,
        })),
        pagination: {
          page: 1,
          pageSize: 20,
          totalItems: 21,
          totalPages: 2,
        },
      }).success,
    ).toBe(false);
  });

  it("rejects malformed and unknown aggregate output", () => {
    expect(() =>
      parseAdminReportPage(
        [
          {
            reports: [adminReportRecord({ createdAt: "not-a-date" })],
            metadata: [],
          },
        ],
        1,
      ),
    ).toThrow();
    expect(() =>
      parseAdminReportFlagPage(
        [
          {
            flags: [
              {
                ...flagRecord(),
                report: adminReportRecord(),
                privateValue: "PRIVATE",
              },
            ],
            metadata: [],
          },
        ],
        1,
      ),
    ).toThrow();
  });

  it("validates the exact decision success envelope", () => {
    const flag = toAdminReportFlag(flagRecord(), adminReportRecord());
    expect(
      adminReportFlagDecisionResultSchema.parse({
        flag,
        report: expectedReport,
      }),
    ).toEqual({ flag, report: expectedReport });
    expect(
      adminReportFlagDecisionResultSchema.safeParse({
        flag,
        report: expectedReport,
        event: { id: "private" },
      }).success,
    ).toBe(false);
  });
});
