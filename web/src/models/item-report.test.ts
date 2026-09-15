import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import {
  ItemReportModel,
  REPORT_CUSTODY_STATUSES,
  REPORT_MODERATION_STATUSES,
  REPORT_VERIFICATION_STATUSES,
  itemReportSchema,
  normalizeReportModerationStatus,
  normalizeStaffReportHandling,
} from "./item-report";

const reporterId = new mongoose.Types.ObjectId();
const categoryId = new mongoose.Types.ObjectId();
const campusLocationId = new mongoose.Types.ObjectId();
const staffId = new mongoose.Types.ObjectId();
const internalPhotoPath =
  "/api/report-images/64f0123456789abcdef01234";

function report(overrides: Record<string, unknown> = {}) {
  return new ItemReportModel({
    reporterId,
    reportType: "lost",
    title: "Black laptop bag",
    publicDescription: "Black laptop bag with a shoulder strap.",
    categoryId,
    campusLocationId,
    occurredAt: new Date("2026-08-28T01:00:00.000Z"),
    colors: ["black"],
    status: "open",
    ...overrides,
  });
}

describe("ItemReport moderation state", () => {
  it("defaults new reports to visible", async () => {
    const record = report();

    await expect(record.validate()).resolves.toBeUndefined();
    expect(record.moderationStatus).toBe("visible");
  });

  it.each(REPORT_MODERATION_STATUSES)("accepts %s", async (moderationStatus) => {
    await expect(
      report({ moderationStatus }).validate(),
    ).resolves.toBeUndefined();
  });

  it("rejects an unknown moderation state", async () => {
    await expect(
      report({ moderationStatus: "removed" }).validate(),
    ).rejects.toMatchObject({
      errors: { moderationStatus: expect.anything() },
    });
  });

  it("normalizes only a missing legacy value", () => {
    expect(normalizeReportModerationStatus(undefined)).toBe("visible");
    expect(normalizeReportModerationStatus("visible")).toBe("visible");
    expect(normalizeReportModerationStatus("hidden")).toBe("hidden");
    expect(() => normalizeReportModerationStatus(null)).toThrow(
      "Report moderation status is invalid",
    );
    expect(() => normalizeReportModerationStatus("removed")).toThrow(
      "Report moderation status is invalid",
    );
  });

  it("stores moderation independently from recovery status", () => {
    expect(itemReportSchema.path("moderationStatus").options.required).toBe(
      true,
    );
    expect(itemReportSchema.path("moderationStatus").options.default).toBe(
      "visible",
    );
    expect(itemReportSchema.path("status").options.enum).not.toContain(
      "hidden",
    );
  });
});

describe("ItemReport staff handling", () => {
  it.each([
    ["lost", "not_applicable"],
    ["found", "not_held"],
  ] as const)("defaults a new %s report safely", async (reportType, custodyStatus) => {
    const record = report({ reportType });

    await expect(record.validate()).resolves.toBeUndefined();
    expect(record.staffHandling).toMatchObject({
      verificationStatus: "pending",
      verifiedBy: null,
      verifiedAt: null,
      custodyStatus,
      storageLocation: null,
      storedAt: null,
      releasedAt: null,
      updatedBy: null,
    });
  });

  it("excludes staff handling unless a staff query selects it", () => {
    expect(itemReportSchema.path("staffHandling").options.select).toBe(false);
  });

  it("exports the complete handling enums", () => {
    expect(REPORT_VERIFICATION_STATUSES).toEqual(["pending", "verified"]);
    expect(REPORT_CUSTODY_STATUSES).toEqual([
      "not_applicable",
      "not_held",
      "stored",
      "released",
    ]);
  });

  it.each([
    ["lost", "not_applicable"],
    ["found", "not_held"],
  ] as const)("normalizes missing legacy %s handling", (reportType, custodyStatus) => {
    expect(normalizeStaffReportHandling(reportType, undefined)).toEqual({
      verificationStatus: "pending",
      verifiedBy: null,
      verifiedAt: null,
      custodyStatus,
      storageLocation: null,
      storedAt: null,
      releasedAt: null,
      updatedBy: null,
    });
  });

  it("normalizes a complete stored state without sharing its object", () => {
    const verifiedAt = new Date("2026-08-29T01:00:00.000Z");
    const storedAt = new Date("2026-08-29T02:00:00.000Z");
    const value = {
      verificationStatus: "verified",
      verifiedBy: staffId,
      verifiedAt,
      custodyStatus: "stored",
      storageLocation: "Library desk - locker B12",
      storedAt,
      releasedAt: null,
      updatedBy: staffId,
    } as const;

    const normalized = normalizeStaffReportHandling("found", value);

    expect(normalized).toEqual(value);
    expect(normalized).not.toBe(value);
  });

  it.each([
    [
      "pending with verification actor",
      "found",
      {
        verificationStatus: "pending",
        verifiedBy: staffId,
        verifiedAt: null,
        custodyStatus: "not_held",
        storageLocation: null,
        storedAt: null,
        releasedAt: null,
        updatedBy: staffId,
      },
    ],
    [
      "verified without timestamp",
      "found",
      {
        verificationStatus: "verified",
        verifiedBy: staffId,
        verifiedAt: null,
        custodyStatus: "not_held",
        storageLocation: null,
        storedAt: null,
        releasedAt: null,
        updatedBy: staffId,
      },
    ],
    [
      "lost item in storage",
      "lost",
      {
        verificationStatus: "verified",
        verifiedBy: staffId,
        verifiedAt: new Date(),
        custodyStatus: "stored",
        storageLocation: "Desk A",
        storedAt: new Date(),
        releasedAt: null,
        updatedBy: staffId,
      },
    ],
    [
      "not-held item with a location",
      "found",
      {
        verificationStatus: "verified",
        verifiedBy: staffId,
        verifiedAt: new Date(),
        custodyStatus: "not_held",
        storageLocation: "Desk A",
        storedAt: null,
        releasedAt: null,
        updatedBy: staffId,
      },
    ],
    [
      "stored item without location",
      "found",
      {
        verificationStatus: "verified",
        verifiedBy: staffId,
        verifiedAt: new Date(),
        custodyStatus: "stored",
        storageLocation: null,
        storedAt: new Date(),
        releasedAt: null,
        updatedBy: staffId,
      },
    ],
    [
      "released item without release time",
      "found",
      {
        verificationStatus: "verified",
        verifiedBy: staffId,
        verifiedAt: new Date(),
        custodyStatus: "released",
        storageLocation: "Desk A",
        storedAt: new Date(),
        releasedAt: null,
        updatedBy: staffId,
      },
    ],
  ] as const)("rejects %s", async (_label, reportType, staffHandling) => {
    await expect(
      report({ reportType, staffHandling }).validate(),
    ).rejects.toMatchObject({
      errors: { staffHandling: expect.anything() },
    });
    expect(() =>
      normalizeStaffReportHandling(reportType, staffHandling),
    ).toThrow("Staff report handling is invalid");
  });

  it("rejects an unknown present legacy handling state", () => {
    expect(() =>
      normalizeStaffReportHandling("found", {
        verificationStatus: "approved",
        custodyStatus: "not_held",
      }),
    ).toThrow("Staff report handling is invalid");
  });
});

describe("ItemReport photo references", () => {
  it.each([
    internalPhotoPath,
    "https://images.example.test/item.jpg",
  ])("accepts %s", async (photoUrl) => {
    await expect(
      report({ photoUrls: [photoUrl] }).validate(),
    ).resolves.toBeUndefined();
  });

  it.each([
    "http://images.example.test/item.jpg",
    "/images/arbitrary-relative-path.jpg",
  ])("rejects %s", async (photoUrl) => {
    await expect(
      report({ photoUrls: [photoUrl] }).validate(),
    ).rejects.toMatchObject({
      errors: { "photoUrls.0": expect.anything() },
    });
  });
});
