import { describe, expect, it } from "vitest";

import {
  adminReportFlagDecisionResponseSchema,
  adminReportFlagPageSchema,
  adminReportPageSchema,
  adminReportResponseSchema,
  reportFlagReceiptResponseSchema,
} from "./browser-contract";

const timestamp = "2026-08-29T01:00:00.000Z";
const report = {
  id: "a".repeat(24),
  reportType: "lost",
  title: "Black laptop charger",
  publicDescription: "A black laptop charger left near the library.",
  categoryId: "b".repeat(24),
  campusLocationId: "c".repeat(24),
  occurredAt: timestamp,
  colors: ["black"],
  tags: ["charger"],
  photoUrls: [],
  status: "open",
  moderationStatus: "visible",
  privacySettings: {
    showPhoto: true,
    showEventDate: true,
    showCampusLocation: true,
  },
  resolvedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};
const flag = {
  id: "d".repeat(24),
  reason: "privacy_concern",
  details: "The description contains a phone number.",
  status: "pending",
  reviewedAt: null,
  resolutionNote: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  report,
};

describe("moderation browser contracts", () => {
  it("accepts the approved response shapes", () => {
    expect(
      reportFlagReceiptResponseSchema.safeParse({
        flag: {
          id: flag.id,
          reportId: report.id,
          reason: flag.reason,
          status: "pending",
          createdAt: timestamp,
        },
      }).success,
    ).toBe(true);
    expect(
      adminReportPageSchema.safeParse({
        reports: [report],
        pagination: {
          page: 1,
          pageSize: 20,
          totalItems: 1,
          totalPages: 1,
        },
      }).success,
    ).toBe(true);
    expect(
      adminReportFlagPageSchema.safeParse({
        flags: [flag],
        pagination: {
          page: 1,
          pageSize: 20,
          totalItems: 1,
          totalPages: 1,
        },
      }).success,
    ).toBe(true);
    expect(
      adminReportFlagDecisionResponseSchema.safeParse({ flag, report }).success,
    ).toBe(true);
    expect(adminReportResponseSchema.safeParse({ report }).success).toBe(true);
  });

  it("rejects identity and private-verification fields", () => {
    expect(
      reportFlagReceiptResponseSchema.safeParse({
        flag: {
          id: flag.id,
          reportId: report.id,
          reason: flag.reason,
          status: "pending",
          createdAt: timestamp,
          submittedByUserId: "e".repeat(24),
        },
      }).success,
    ).toBe(false);
    expect(
      adminReportPageSchema.safeParse({
        reports: [{ ...report, reporterId: "e".repeat(24) }],
        pagination: {
          page: 1,
          pageSize: 20,
          totalItems: 1,
          totalPages: 1,
        },
      }).success,
    ).toBe(false);
    expect(
      adminReportFlagPageSchema.safeParse({
        flags: [{ ...flag, expectedAnswer: "private" }],
        pagination: {
          page: 1,
          pageSize: 20,
          totalItems: 1,
          totalPages: 1,
        },
      }).success,
    ).toBe(false);
  });

  it("rejects inconsistent pagination and status timestamps", () => {
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
        flags: [{ ...flag, reviewedAt: timestamp }],
        pagination: {
          page: 1,
          pageSize: 20,
          totalItems: 1,
          totalPages: 1,
        },
      }).success,
    ).toBe(false);
    expect(
      adminReportFlagPageSchema.safeParse({
        flags: [{ ...flag, status: "dismissed", reviewedAt: null }],
        pagination: {
          page: 1,
          pageSize: 20,
          totalItems: 1,
          totalPages: 1,
        },
      }).success,
    ).toBe(false);
  });

  it("requires resolved reports to include a resolved timestamp", () => {
    expect(
      adminReportResponseSchema.safeParse({
        report: { ...report, status: "resolved", resolvedAt: null },
      }).success,
    ).toBe(false);
  });
});
