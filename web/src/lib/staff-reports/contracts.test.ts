import { describe, expect, it } from "vitest";
import mongoose from "mongoose";

import { toStaffReportDetail, toStaffReportSummary, type StaffReportRecord } from "./contracts";

const id = (value: string) => new mongoose.Types.ObjectId(value);

function record(overrides: Partial<StaffReportRecord> = {}): StaffReportRecord {
  return {
    _id: id("64f0123456789abcdef01234"),
    reportType: "found",
    title: "Black laptop charger",
    publicDescription: "A black laptop charger found beside a study table.",
    categoryId: id("64f0123456789abcdef01235"),
    campusLocationId: id("64f0123456789abcdef01236"),
    occurredAt: new Date("2026-08-28T01:00:00.000Z"),
    colors: ["black"],
    tags: ["charger"],
    photoUrls: ["/api/report-images/64f0123456789abcdef01237"],
    status: "open",
    moderationStatus: "visible",
    resolvedAt: null,
    staffHandling: {
      verificationStatus: "verified",
      verifiedBy: id("64f0123456789abcdef01238"),
      verifiedAt: new Date("2026-08-28T02:00:00.000Z"),
      custodyStatus: "stored",
      storageLocation: "Library desk - locker B12",
      storedAt: new Date("2026-08-28T03:00:00.000Z"),
      releasedAt: null,
      updatedBy: id("64f0123456789abcdef01238"),
    },
    createdAt: new Date("2026-08-28T01:10:00.000Z"),
    updatedAt: new Date("2026-08-28T03:00:00.000Z"),
    ...overrides,
  };
}

describe("staff report contracts", () => {
  it("maps a private-safe list summary without storage location", () => {
    const summary = toStaffReportSummary(record());

    expect(summary).toMatchObject({
      id: "64f0123456789abcdef01234",
      reportType: "found",
      title: "Black laptop charger",
      handling: {
        verificationStatus: "verified",
        custodyStatus: "stored",
        verifiedAt: "2026-08-28T02:00:00.000Z",
        storedAt: "2026-08-28T03:00:00.000Z",
        releasedAt: null,
      },
    });
    expect(JSON.stringify(summary)).not.toMatch(
      /reporterId|expectedAnswer|exactLocationDetails|serialNumber|privateNotes|storageLocation|verifiedBy|updatedBy/,
    );
  });

  it("adds authorised detail fields without spreading records", () => {
    const detail = toStaffReportDetail(
      Object.assign(record(), { reporterId: "private-owner", privateNotes: "secret" }),
    );

    expect(detail.handling).toMatchObject({
      verifiedBy: "64f0123456789abcdef01238",
      updatedBy: "64f0123456789abcdef01238",
      storageLocation: "Library desk - locker B12",
    });
    expect(detail.publicDescription).toContain("study table");
    expect(JSON.stringify(detail)).not.toMatch(/private-owner|privateNotes|secret/);
  });

  it.each([
    ["lost", "not_applicable"],
    ["found", "not_held"],
  ] as const)("normalizes missing legacy %s handling", (reportType, custodyStatus) => {
    const summary = toStaffReportSummary(record({ reportType, staffHandling: undefined }));
    expect(summary.handling).toEqual({
      verificationStatus: "pending",
      custodyStatus,
      verifiedAt: null,
      storedAt: null,
      releasedAt: null,
    });
  });

  it("clones arrays in the controlled result", () => {
    const source = record();
    const detail = toStaffReportDetail(source);
    expect(detail.colors).not.toBe(source.colors);
    expect(detail.tags).not.toBe(source.tags);
    expect(detail.photoUrls).not.toBe(source.photoUrls);
  });
});
