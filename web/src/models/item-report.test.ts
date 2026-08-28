import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import {
  ItemReportModel,
  REPORT_MODERATION_STATUSES,
  itemReportSchema,
  normalizeReportModerationStatus,
} from "./item-report";

const reporterId = new mongoose.Types.ObjectId();
const categoryId = new mongoose.Types.ObjectId();
const campusLocationId = new mongoose.Types.ObjectId();

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
