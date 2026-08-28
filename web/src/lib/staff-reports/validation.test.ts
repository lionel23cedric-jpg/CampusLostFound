import { describe, expect, it } from "vitest";

import {
  staffReportIdSchema,
  staffReportListQuerySchema,
  storeReportSchema,
  toStaffReportQueryInput,
  verifyReportSchema,
} from "./validation";

describe("staff report validation", () => {
  it("applies only the fixed page default", () => {
    expect(staffReportListQuerySchema.parse({})).toEqual({ page: 1 });
  });

  it("accepts all compatible list dimensions", () => {
    expect(staffReportListQuerySchema.parse({
      reportType: "found",
      reportStatus: "claim_pending",
      verificationStatus: "verified",
      custodyStatus: "stored",
      page: "17",
    })).toEqual({
      reportType: "found",
      reportStatus: "claim_pending",
      verificationStatus: "verified",
      custodyStatus: "stored",
      page: 17,
    });
  });

  it.each([
    { reportType: "lost", custodyStatus: "stored" },
    { reportType: "found", custodyStatus: "not_applicable" },
    { verificationStatus: "pending", custodyStatus: "stored" },
    { verificationStatus: "pending", custodyStatus: "released" },
  ])("rejects incompatible filters %#", (input) => {
    expect(staffReportListQuerySchema.safeParse(input).success).toBe(false);
  });

  it.each([
    { page: "0" },
    { page: "+1" },
    { page: "01" },
    { page: "1.5" },
    { page: "10001" },
    { unknown: "value" },
    { reportStatus: "closed" },
  ])("rejects invalid list input %#", (input) => {
    expect(staffReportListQuerySchema.safeParse(input).success).toBe(false);
  });

  it("preserves repeated query values for strict rejection", () => {
    const input = toStaffReportQueryInput(
      new URLSearchParams("reportType=lost&reportType=found&page=2"),
    );
    expect(input).toEqual({ reportType: ["lost", "found"], page: "2" });
    expect(staffReportListQuerySchema.safeParse(input).success).toBe(false);
  });

  it("normalizes a controlled storage location", () => {
    expect(storeReportSchema.parse({
      expectedUpdatedAt: "2026-08-29T03:00:00.000Z",
      storageLocation: "  Library desk   - locker B12  ",
    })).toEqual({
      expectedUpdatedAt: "2026-08-29T03:00:00.000Z",
      storageLocation: "Library desk - locker B12",
    });
  });

  it.each(["", "A", "A".repeat(161), "Desk\u0000B12", "Desk\u200bB12"])(
    "rejects unsafe storage location %j",
    (storageLocation) => {
      expect(storeReportSchema.safeParse({
        expectedUpdatedAt: "2026-08-29T03:00:00.000Z",
        storageLocation,
      }).success).toBe(false);
    },
  );

  it("accepts only strict mutation bodies and exact timestamps", () => {
    expect(verifyReportSchema.parse({
      expectedUpdatedAt: "2026-08-29T03:00:00.000+00:00",
    })).toEqual({ expectedUpdatedAt: "2026-08-29T03:00:00.000+00:00" });
    expect(verifyReportSchema.safeParse({
      expectedUpdatedAt: "2026-08-29",
      userId: "64f0123456789abcdef01238",
    }).success).toBe(false);
  });

  it("normalizes valid ObjectIds and rejects other IDs", () => {
    expect(staffReportIdSchema.parse("64F0123456789ABCDEF01234")).toBe(
      "64f0123456789abcdef01234",
    );
    expect(staffReportIdSchema.safeParse("not-an-id").success).toBe(false);
  });
});
