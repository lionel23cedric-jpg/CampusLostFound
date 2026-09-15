import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/item-report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/models/item-report")>();
  return {
    ...actual,
    ItemReportModel: { findOne: vi.fn() },
  };
});
vi.mock("@/models/report-flag", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/models/report-flag")>();
  return {
    ...actual,
    ReportFlagModel: { create: vi.fn() },
  };
});

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { ItemReportModel } from "@/models/item-report";
import {
  PENDING_REPORT_FLAG_INDEX,
  ReportFlagModel,
} from "@/models/report-flag";

import { submitReportFlag } from "./flag-service";

const memberId = "64b64c6f2f4d9f1a2b3c4d50";
const ownerId = "64b64c6f2f4d9f1a2b3c4d51";
const reportId = "64b64c6f2f4d9f1a2b3c4d52";
const flagId = "64b64c6f2f4d9f1a2b3c4d53";
const createdAt = new Date("2026-08-28T03:00:00.000Z");

function member(
  role: PublicUser["role"] = "student",
  status: PublicUser["status"] = "active",
): PublicUser {
  return {
    id: memberId,
    email: "member@example.test",
    role,
    status,
    emailVerifiedAt: null,
    lastLoginAt: null,
    profile: {
      displayName: "Example Member",
      preferredContactMethod: "in_app",
      preferredCampusLocationIds: [],
      notificationSettings: {
        possibleMatches: true,
        claimUpdates: true,
        statusChanges: true,
        handoverInstructions: true,
      },
    },
  };
}

const report = {
  _id: new mongoose.Types.ObjectId(reportId),
  reporterId: new mongoose.Types.ObjectId(ownerId),
};
const storedFlag = {
  _id: new mongoose.Types.ObjectId(flagId),
  reportId: report._id,
  submittedByUserId: new mongoose.Types.ObjectId(memberId),
  reason: "privacy_concern",
  details: "Public phone number",
  status: "pending",
  createdAt,
};
const reportExec = vi.fn();
const reportQuery = { exec: reportExec };

describe("member report flag service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectToDatabase).mockResolvedValue({} as never);
    reportExec.mockResolvedValue(report);
    vi.mocked(ItemReportModel.findOne).mockReturnValue(reportQuery as never);
    vi.mocked(ReportFlagModel.create).mockResolvedValue(storedFlag as never);
  });

  it.each(["student", "staff", "administrator"] as const)(
    "creates a flag for an active %s using the exact eligibility boundary",
    async (role) => {
      await expect(
        submitReportFlag(member(role), reportId, {
          reason: "privacy_concern",
          details: "Public phone number",
        }),
      ).resolves.toEqual({
        id: flagId,
        reportId,
        reason: "privacy_concern",
        status: "pending",
        createdAt: createdAt.toISOString(),
      });

      expect(connectToDatabase).toHaveBeenCalledOnce();
      expect(ItemReportModel.findOne).toHaveBeenCalledWith(
        {
          _id: expect.objectContaining({}),
          status: { $in: ["open", "claim_pending", "resolved", "closed"] },
          moderationStatus: { $ne: "hidden" },
        },
        { _id: 1, reporterId: 1 },
      );
      const filter = vi.mocked(ItemReportModel.findOne).mock.calls[0][0] as unknown as {
        _id: { toString(): string };
      };
      expect(filter._id.toString()).toBe(reportId);
      expect(ReportFlagModel.create).toHaveBeenCalledWith({
        reportId: report._id,
        submittedByUserId: expect.objectContaining({}),
        reason: "privacy_concern",
        details: "Public phone number",
        status: "pending",
      });
      const create = vi.mocked(ReportFlagModel.create).mock.calls[0][0] as {
        submittedByUserId: { toString(): string };
      };
      expect(create.submittedByUserId.toString()).toBe(memberId);
    },
  );

  it.each(["suspended", "deactivated"] as const)(
    "rejects a %s member before connecting",
    async (status) => {
      await expect(
        submitReportFlag(member("student", status), reportId, {
          reason: "suspected_fraud",
          details: null,
        }),
      ).rejects.toMatchObject({ code: "ACTIVE_ACCOUNT_REQUIRED" });
      expect(connectToDatabase).not.toHaveBeenCalled();
      expect(ItemReportModel.findOne).not.toHaveBeenCalled();
      expect(ReportFlagModel.create).not.toHaveBeenCalled();
    },
  );

  it("treats an absent, draft or hidden report as not found", async () => {
    reportExec.mockResolvedValue(null);

    await expect(
      submitReportFlag(member(), reportId, {
        reason: "duplicate_report",
        details: null,
      }),
    ).rejects.toMatchObject({ code: "REPORT_NOT_FOUND" });
    expect(ReportFlagModel.create).not.toHaveBeenCalled();
  });

  it("forbids flagging an owned report", async () => {
    reportExec.mockResolvedValue({
      ...report,
      reporterId: new mongoose.Types.ObjectId(memberId),
    });

    await expect(
      submitReportFlag(member(), reportId, {
        reason: "privacy_concern",
        details: null,
      }),
    ).rejects.toMatchObject({ code: "REPORT_FLAG_FORBIDDEN" });
    expect(ReportFlagModel.create).not.toHaveBeenCalled();
  });

  it("does not query prior flags before relying on the unique index", async () => {
    await submitReportFlag(member(), reportId, {
      reason: "other",
      details: "A new concern after earlier review",
    });

    expect(ReportFlagModel).not.toHaveProperty("findOne");
    expect(ReportFlagModel.create).toHaveBeenCalledOnce();
  });

  it("maps only the exact pending-index duplicate", async () => {
    vi.mocked(ReportFlagModel.create).mockRejectedValue({
      code: 11000,
      index: PENDING_REPORT_FLAG_INDEX,
    });

    await expect(
      submitReportFlag(member(), reportId, {
        reason: "privacy_concern",
        details: null,
      }),
    ).rejects.toMatchObject({ code: "REPORT_FLAG_ALREADY_PENDING" });
  });

  it.each([
    ["unrelated duplicate", { code: 11000, index: "another_index" }],
    ["database failure", new Error("private database detail")],
  ])("closes an %s", async (_label, failure) => {
    vi.mocked(ReportFlagModel.create).mockRejectedValue(failure);

    await expect(
      submitReportFlag(member(), reportId, {
        reason: "privacy_concern",
        details: null,
      }),
    ).rejects.toMatchObject({
      code: "REPORT_MODERATION_FAILED",
      message: "Report moderation could not be completed",
    });
  });

  it("closes malformed persisted output without exposing it", async () => {
    vi.mocked(ReportFlagModel.create).mockResolvedValue({
      ...storedFlag,
      createdAt: "PRIVATE-BAD-DATE",
    } as never);

    await expect(
      submitReportFlag(member(), reportId, {
        reason: "privacy_concern",
        details: null,
      }),
    ).rejects.toMatchObject({ code: "REPORT_MODERATION_FAILED" });
  });
});
