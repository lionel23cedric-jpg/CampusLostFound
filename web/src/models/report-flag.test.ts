import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import {
  PENDING_REPORT_FLAG_INDEX,
  REPORT_FLAG_REASONS,
  REPORT_FLAG_STATUSES,
  ReportFlagModel,
  reportFlagSchema,
} from "./report-flag";

const reportId = new mongoose.Types.ObjectId();
const submittedByUserId = new mongoose.Types.ObjectId();
const administratorId = new mongoose.Types.ObjectId();

function flag(overrides: Record<string, unknown> = {}) {
  return new ReportFlagModel({
    reportId,
    submittedByUserId,
    reason: "privacy_concern",
    details: "The description contains a phone number.",
    ...overrides,
  });
}

describe("ReportFlag model", () => {
  it("defaults a valid record to pending with null review fields", async () => {
    const record = flag();

    await expect(record.validate()).resolves.toBeUndefined();
    expect(record.status).toBe("pending");
    expect(record.reviewedByAdministratorId).toBeNull();
    expect(record.reviewedAt).toBeNull();
    expect(record.resolutionNote).toBeNull();
  });

  it.each(REPORT_FLAG_REASONS)("accepts reason %s", async (reason) => {
    await expect(
      flag({
        reason,
        details: reason === "other" ? "A different safety concern" : null,
      }).validate(),
    ).resolves.toBeUndefined();
  });

  it.each(REPORT_FLAG_STATUSES)("accepts resolved state %s consistently", async (status) => {
    await expect(
      flag({
        status,
        ...(status === "pending"
          ? {}
          : {
              reviewedByAdministratorId: administratorId,
              reviewedAt: new Date("2026-08-28T02:00:00.000Z"),
            }),
      }).validate(),
    ).resolves.toBeUndefined();
  });

  it("requires details only for other", async () => {
    await expect(
      flag({ reason: "other", details: null }).validate(),
    ).rejects.toMatchObject({ errors: { details: expect.anything() } });
    await expect(
      flag({ reason: "other", details: "   " }).validate(),
    ).rejects.toMatchObject({ errors: { details: expect.anything() } });
    await expect(
      flag({
        reason: "other",
        details: "A different safety concern",
      }).validate(),
    ).resolves.toBeUndefined();
  });

  it("requires reviewer and review time for resolved states", async () => {
    await expect(
      flag({ status: "dismissed" }).validate(),
    ).rejects.toMatchObject({
      errors: {
        reviewedByAdministratorId: expect.anything(),
        reviewedAt: expect.anything(),
      },
    });
  });

  it("forbids review fields while pending", async () => {
    await expect(
      flag({
        reviewedByAdministratorId: administratorId,
        reviewedAt: new Date("2026-08-28T02:00:00.000Z"),
        resolutionNote: "Reviewed too soon",
      }).validate(),
    ).rejects.toMatchObject({
      errors: {
        reviewedByAdministratorId: expect.anything(),
        reviewedAt: expect.anything(),
        resolutionNote: expect.anything(),
      },
    });
  });

  it("requires report, submitter and reason", async () => {
    await expect(new ReportFlagModel({}).validate()).rejects.toMatchObject({
      errors: {
        reportId: expect.anything(),
        submittedByUserId: expect.anything(),
        reason: expect.anything(),
      },
    });
  });

  it("enforces enums and controlled-text limits", async () => {
    await expect(
      flag({ reason: "unknown" }).validate(),
    ).rejects.toMatchObject({ errors: { reason: expect.anything() } });
    await expect(
      flag({ status: "reopened" }).validate(),
    ).rejects.toMatchObject({ errors: { status: expect.anything() } });
    await expect(
      flag({ details: "a".repeat(501) }).validate(),
    ).rejects.toMatchObject({ errors: { details: expect.anything() } });
    await expect(
      flag({
        status: "actioned",
        reviewedByAdministratorId: administratorId,
        reviewedAt: new Date("2026-08-28T02:00:00.000Z"),
        resolutionNote: "a".repeat(501),
      }).validate(),
    ).rejects.toMatchObject({ errors: { resolutionNote: expect.anything() } });
  });

  it("hides identities and controlled text by default", () => {
    expect(reportFlagSchema.path("submittedByUserId").options.select).toBe(
      false,
    );
    expect(
      reportFlagSchema.path("reviewedByAdministratorId").options.select,
    ).toBe(false);
    expect(reportFlagSchema.path("details").options.select).toBe(false);
    expect(reportFlagSchema.path("resolutionNote").options.select).toBe(
      false,
    );
  });

  it.each(["reportId", "submittedByUserId", "reason", "details"])(
    "marks %s immutable",
    (path) => {
      expect(reportFlagSchema.path(path).options.immutable).toBe(true);
    },
  );

  it("defines only the named pending uniqueness and queue indexes", () => {
    expect(reportFlagSchema.indexes()).toHaveLength(4);
    expect(reportFlagSchema.indexes()).toEqual(
      expect.arrayContaining([
        [
          { reportId: 1, submittedByUserId: 1, status: 1 },
          expect.objectContaining({
            name: PENDING_REPORT_FLAG_INDEX,
            unique: true,
            partialFilterExpression: { status: "pending" },
          }),
        ],
        [{ status: 1, createdAt: -1, _id: -1 }, expect.any(Object)],
        [
          { reason: 1, status: 1, createdAt: -1, _id: -1 },
          expect.any(Object),
        ],
        [
          { reportId: 1, status: 1, createdAt: -1 },
          expect.any(Object),
        ],
      ]),
    );
    expect(reportFlagSchema.get("timestamps")).toBe(true);
  });
});
