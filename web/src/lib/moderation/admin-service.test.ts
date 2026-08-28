import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/item-report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/models/item-report")>();
  return {
    ...actual,
    ItemReportModel: {
      aggregate: vi.fn(),
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
    },
  };
});
vi.mock("@/models/report-flag", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/models/report-flag")>();
  return {
    ...actual,
    ReportFlagModel: {
      aggregate: vi.fn(),
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
      updateMany: vi.fn(),
    },
  };
});
vi.mock("@/models/user", () => ({ UserModel: { findOne: vi.fn() } }));
vi.mock("@/models/report-moderation-event", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/models/report-moderation-event")
  >();
  return {
    ...actual,
    ReportModerationEventModel: { create: vi.fn() },
  };
});

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { ItemReportModel } from "@/models/item-report";
import { ReportModerationEventModel } from "@/models/report-moderation-event";
import { ReportFlagModel } from "@/models/report-flag";
import { UserModel } from "@/models/user";

import {
  listAdminReportFlags,
  listAdminReports,
  moderateReport,
  resolveReportFlag,
} from "./admin-service";

const administrator = {
  id: "64b64c6f2f4d9f1a2b3c4d50",
  email: "admin@example.test",
  role: "administrator",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Admin User",
    preferredContactMethod: "in_app",
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
} satisfies PublicUser;

const reportId = new mongoose.Types.ObjectId("64b64c6f2f4d9f1a2b3c4d51");
const categoryId = new mongoose.Types.ObjectId("64b64c6f2f4d9f1a2b3c4d52");
const campusLocationId = new mongoose.Types.ObjectId(
  "64b64c6f2f4d9f1a2b3c4d53",
);
const flagId = new mongoose.Types.ObjectId("64b64c6f2f4d9f1a2b3c4d54");
const createdAt = new Date("2026-08-28T02:00:00.000Z");
const updatedAt = new Date("2026-08-28T03:00:00.000Z");

function reportRecord(overrides: Record<string, unknown> = {}) {
  return {
    _id: reportId,
    reportType: "lost",
    title: "Black laptop bag",
    publicDescription: "Black laptop bag with a shoulder strap.",
    categoryId,
    campusLocationId,
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
    _id: flagId,
    reportId,
    reason: "privacy_concern",
    details: "The description contains a phone number.",
    status: "pending",
    reviewedAt: null,
    resolutionNote: null,
    createdAt,
    updatedAt,
    report: reportRecord(),
    ...overrides,
  };
}

const expectedReport = {
  id: reportId.toString(),
  reportType: "lost" as const,
  title: "Black laptop bag",
  publicDescription: "Black laptop bag with a shoulder strap.",
  categoryId: categoryId.toString(),
  campusLocationId: campusLocationId.toString(),
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

const reportExec = vi.fn();
const flagExec = vi.fn();

function reportPipeline() {
  return vi.mocked(ItemReportModel.aggregate).mock.calls[0][0] as unknown[];
}

function flagPipeline() {
  return vi.mocked(ReportFlagModel.aggregate).mock.calls[0][0] as unknown[];
}

describe("administrator moderation query service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectToDatabase).mockResolvedValue({} as never);
    reportExec.mockResolvedValue([
      { reports: [reportRecord()], metadata: [{ totalItems: 1 }] },
    ]);
    flagExec.mockResolvedValue([
      { flags: [flagRecord()], metadata: [{ totalItems: 1 }] },
    ]);
    vi.mocked(ItemReportModel.aggregate).mockReturnValue({
      exec: reportExec,
    } as never);
    vi.mocked(ReportFlagModel.aggregate).mockReturnValue({
      exec: flagExec,
    } as never);
  });

  it.each([
    ["student", { ...administrator, role: "student" as const }],
    ["staff", { ...administrator, role: "staff" as const }],
    [
      "suspended administrator",
      { ...administrator, status: "suspended" as const },
    ],
    [
      "deactivated administrator",
      { ...administrator, status: "deactivated" as const },
    ],
  ])("rejects a %s before report database work", async (_label, user) => {
    await expect(listAdminReports(user, { page: 1 })).rejects.toMatchObject({
      code: "ADMINISTRATOR_REQUIRED",
    });
    expect(connectToDatabase).not.toHaveBeenCalled();
    expect(ItemReportModel.aggregate).not.toHaveBeenCalled();
  });

  it.each([
    ["student", { ...administrator, role: "student" as const }],
    ["staff", { ...administrator, role: "staff" as const }],
    [
      "suspended administrator",
      { ...administrator, status: "suspended" as const },
    ],
    [
      "deactivated administrator",
      { ...administrator, status: "deactivated" as const },
    ],
  ])("rejects a %s before flag database work", async (_label, user) => {
    await expect(
      listAdminReportFlags(user, { page: 1 }),
    ).rejects.toMatchObject({ code: "ADMINISTRATOR_REQUIRED" });
    expect(connectToDatabase).not.toHaveBeenCalled();
    expect(ReportFlagModel.aggregate).not.toHaveBeenCalled();
  });

  it("returns the complete report-authored administrator summary", async () => {
    await expect(listAdminReports(administrator, { page: 1 })).resolves.toEqual({
      reports: [expectedReport],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      },
    });
    expect(connectToDatabase).toHaveBeenCalledOnce();
  });

  it("builds the exact filtered, scored and paged report aggregate", async () => {
    await listAdminReports(administrator, {
      q: "laptop bag",
      reportType: "lost",
      moderationStatus: "hidden",
      page: 2,
    });

    const pipeline = reportPipeline() as Array<Record<string, unknown>>;
    expect(pipeline[0]).toEqual({
      $match: {
        status: { $in: ["open", "claim_pending", "resolved", "closed"] },
        $text: { $search: "laptop bag" },
        reportType: "lost",
        moderationStatus: "hidden",
      },
    });
    expect(pipeline[1]).toEqual({
      $facet: {
        reports: [
          {
            $sort: {
              score: { $meta: "textScore" },
              createdAt: -1,
              _id: -1,
            },
          },
          { $skip: 20 },
          { $limit: 20 },
          expect.objectContaining({ $project: expect.any(Object) }),
        ],
        metadata: [{ $count: "totalItems" }],
      },
    });
    const serialised = JSON.stringify(pipeline);
    expect(serialised).not.toMatch(
      /reporterId|serialNumber|expectedAnswer|exactLocationDetails|privateNotes/,
    );
  });

  it("uses exact report status and legacy-safe visible filtering", async () => {
    await listAdminReports(administrator, {
      reportStatus: "closed",
      moderationStatus: "visible",
      page: 1,
    });

    expect(reportPipeline()[0]).toEqual({
      $match: {
        status: "closed",
        moderationStatus: { $ne: "hidden" },
      },
    });
    expect(reportPipeline()[1]).toMatchObject({
      $facet: {
        reports: [
          { $sort: { createdAt: -1, _id: -1 } },
          { $skip: 0 },
          { $limit: 20 },
          expect.any(Object),
        ],
      },
    });
  });

  it("normalizes projected legacy moderation state", async () => {
    reportExec.mockResolvedValue([
      {
        reports: [reportRecord({ moderationStatus: undefined })],
        metadata: [{ totalItems: 1 }],
      },
    ]);

    const result = await listAdminReports(administrator, { page: 1 });

    expect(result.reports[0].moderationStatus).toBe("visible");
    const project = (
      (
        (reportPipeline()[1] as { $facet: { reports: unknown[] } }).$facet
          .reports[3] as { $project: Record<string, unknown> }
      ).$project
    );
    expect(project.moderationStatus).toEqual({
      $ifNull: ["$moderationStatus", "visible"],
    });
  });

  it("returns a complete safe flag page", async () => {
    const result = await listAdminReportFlags(administrator, { page: 1 });

    expect(result).toEqual({
      flags: [
        {
          id: flagId.toString(),
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

  it("builds the bounded filtered flag lookup and page", async () => {
    await listAdminReportFlags(administrator, {
      status: "pending",
      reason: "privacy_concern",
      page: 3,
    });

    const pipeline = flagPipeline() as Array<Record<string, unknown>>;
    expect(pipeline[0]).toEqual({
      $match: { status: "pending", reason: "privacy_concern" },
    });
    expect(pipeline[1]).toEqual({
      $lookup: {
        from: "itemReports",
        let: { reportId: "$reportId" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$_id", "$$reportId"] },
              status: {
                $in: ["open", "claim_pending", "resolved", "closed"],
              },
            },
          },
          {
            $project: {
              _id: 1,
              reportType: 1,
              title: 1,
              publicDescription: 1,
              categoryId: 1,
              campusLocationId: 1,
              occurredAt: 1,
              colors: 1,
              tags: 1,
              photoUrls: 1,
              status: 1,
              moderationStatus: {
                $ifNull: ["$moderationStatus", "visible"],
              },
              privacySettings: 1,
              resolvedAt: 1,
              createdAt: 1,
              updatedAt: 1,
            },
          },
        ],
        as: "report",
      },
    });
    expect(pipeline.slice(2)).toEqual([
      { $unwind: "$report" },
      {
        $facet: {
          flags: [
            { $sort: { createdAt: -1, _id: -1 } },
            { $skip: 40 },
            { $limit: 20 },
            expect.objectContaining({ $project: expect.any(Object) }),
          ],
          metadata: [{ $count: "totalItems" }],
        },
      },
    ]);
    expect(JSON.stringify(pipeline)).not.toMatch(
      /submittedByUserId|reviewedByAdministratorId|reporterId|verification|password/i,
    );
  });

  it("keeps empty and beyond-range pages complete", async () => {
    reportExec.mockResolvedValue([
      { reports: [], metadata: [{ totalItems: 1 }] },
    ]);
    flagExec.mockResolvedValue([{ flags: [], metadata: [] }]);

    await expect(listAdminReports(administrator, { page: 9 })).resolves.toEqual({
      reports: [],
      pagination: {
        page: 9,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      },
    });
    await expect(
      listAdminReportFlags(administrator, { page: 4 }),
    ).resolves.toEqual({
      flags: [],
      pagination: {
        page: 4,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
      },
    });
  });

  it.each([
    [
      "malformed report aggregate",
      () => reportExec.mockResolvedValue([{ reports: [{}], metadata: [] }]),
      () => listAdminReports(administrator, { page: 1 }),
    ],
    [
      "malformed flag aggregate",
      () => flagExec.mockResolvedValue([{ flags: [{}], metadata: [] }]),
      () => listAdminReportFlags(administrator, { page: 1 }),
    ],
    [
      "report model failure",
      () => reportExec.mockRejectedValue(new Error("PRIVATE-REPORT-DB")),
      () => listAdminReports(administrator, { page: 1 }),
    ],
    [
      "flag model failure",
      () => flagExec.mockRejectedValue(new Error("PRIVATE-FLAG-DB")),
      () => listAdminReportFlags(administrator, { page: 1 }),
    ],
  ])("fails closed for %s", async (_label, arrange, invoke) => {
    arrange();

    await expect(invoke()).rejects.toMatchObject({
      code: "REPORT_MODERATION_FAILED",
      message: "Report moderation could not be completed",
    });
  });
});

type QueryResult = ReturnType<typeof queryResult>;
function queryResult(value: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    session: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(value),
  };
}

const expectedFlagUpdatedAt = "2026-08-28T03:00:00.000Z";
const expectedReportUpdatedAt = "2026-08-28T03:05:00.000Z";
const administratorObjectId = new mongoose.Types.ObjectId(administrator.id);
const transaction = {
  withTransaction: vi.fn(
    async (work: () => Promise<void>) => await work(),
  ),
  endSession: vi.fn(async () => undefined),
};
const startSession = vi.fn(async () => transaction);

let actorQuery: QueryResult;
let currentFlagQuery: QueryResult;
let currentReportQuery: QueryResult;
let updatedFlagQuery: QueryResult;
let updatedReportQuery: QueryResult;

function currentFlag(overrides: Record<string, unknown> = {}) {
  return {
    _id: flagId,
    reportId,
    reason: "privacy_concern",
    details: "The description contains a phone number.",
    status: "pending",
    reviewedAt: null,
    resolutionNote: null,
    createdAt,
    updatedAt: new Date(expectedFlagUpdatedAt),
    ...overrides,
  };
}

function currentReport(overrides: Record<string, unknown> = {}) {
  return reportRecord({
    moderationStatus: "visible",
    updatedAt: new Date(expectedReportUpdatedAt),
    ...overrides,
  });
}

function resolvedFlag(
  status: "dismissed" | "actioned",
  overrides: Record<string, unknown> = {},
) {
  return currentFlag({
    status,
    reviewedAt: new Date("2026-08-28T04:00:00.000Z"),
    resolutionNote: "No policy issue found",
    updatedAt: new Date("2026-08-28T04:00:00.000Z"),
    ...overrides,
  });
}

describe("administrator moderation decisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transaction.withTransaction.mockImplementation(
      async (work: () => Promise<void>) => await work(),
    );
    transaction.endSession.mockResolvedValue(undefined);
    startSession.mockResolvedValue(transaction);
    vi.mocked(connectToDatabase).mockResolvedValue({ startSession } as never);

    actorQuery = queryResult({ _id: administratorObjectId });
    currentFlagQuery = queryResult(currentFlag());
    currentReportQuery = queryResult(currentReport());
    updatedFlagQuery = queryResult(resolvedFlag("dismissed"));
    updatedReportQuery = queryResult(
      currentReport({
        moderationStatus: "hidden",
        updatedAt: new Date("2026-08-28T04:00:00.000Z"),
      }),
    );

    vi.mocked(UserModel.findOne).mockReturnValue(actorQuery as never);
    vi.mocked(ReportFlagModel.findOne).mockReturnValue(
      currentFlagQuery as never,
    );
    vi.mocked(ItemReportModel.findOne).mockReturnValue(
      currentReportQuery as never,
    );
    vi.mocked(ReportFlagModel.findOneAndUpdate).mockReturnValue(
      updatedFlagQuery as never,
    );
    vi.mocked(ItemReportModel.findOneAndUpdate).mockReturnValue(
      updatedReportQuery as never,
    );
    vi.mocked(ReportFlagModel.updateMany).mockResolvedValue({
      acknowledged: true,
      matchedCount: 0,
      modifiedCount: 0,
    } as never);
    vi.mocked(ReportModerationEventModel.create).mockResolvedValue([
      {},
    ] as never);
  });

  it.each([
    ["student", { ...administrator, role: "student" as const }],
    ["staff", { ...administrator, role: "staff" as const }],
    [
      "suspended administrator",
      { ...administrator, status: "suspended" as const },
    ],
    [
      "deactivated administrator",
      { ...administrator, status: "deactivated" as const },
    ],
  ])("rejects a %s before flag-decision connection", async (_label, user) => {
    await expect(
      resolveReportFlag(user, flagId.toString(), {
        decision: "dismiss",
        expectedFlagUpdatedAt,
        note: null,
      }),
    ).rejects.toMatchObject({ code: "ADMINISTRATOR_REQUIRED" });
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  it.each([
    ["student", { ...administrator, role: "student" as const }],
    ["staff", { ...administrator, role: "staff" as const }],
    [
      "suspended administrator",
      { ...administrator, status: "suspended" as const },
    ],
    [
      "deactivated administrator",
      { ...administrator, status: "deactivated" as const },
    ],
  ])("rejects a %s before direct-moderation connection", async (_label, user) => {
    await expect(
      moderateReport(user, reportId.toString(), {
        moderationStatus: "hidden",
        reason: "administrative_review",
        expectedUpdatedAt: expectedReportUpdatedAt,
        note: null,
      }),
    ).rejects.toMatchObject({ code: "ADMINISTRATOR_REQUIRED" });
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  it("dismisses one pending flag without changing report state", async () => {
    const result = await resolveReportFlag(administrator, flagId.toString(), {
      decision: "dismiss",
      expectedFlagUpdatedAt,
      note: "No policy issue found",
    });

    expect(startSession).toHaveBeenCalledOnce();
    expect(transaction.withTransaction).toHaveBeenCalledOnce();
    expect(UserModel.findOne).toHaveBeenCalledWith({
      _id: administratorObjectId,
      role: "administrator",
      status: "active",
    });
    expect(actorQuery.select).toHaveBeenCalledWith({ _id: 1 });
    expect(actorQuery.session).toHaveBeenCalledWith(transaction);
    expect(
      vi.mocked(UserModel.findOne).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(ReportFlagModel.findOne).mock.invocationCallOrder[0],
    );
    expect(ReportFlagModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: flagId,
        status: "pending",
        updatedAt: new Date(expectedFlagUpdatedAt),
      },
      {
        $set: {
          status: "dismissed",
          reviewedByAdministratorId: administratorObjectId,
          reviewedAt: expect.any(Date),
          resolutionNote: "No policy issue found",
        },
      },
      expect.objectContaining({
        new: true,
        runValidators: true,
        session: transaction,
      }),
    );
    expect(ItemReportModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(ReportFlagModel.updateMany).not.toHaveBeenCalled();
    expect(ReportModerationEventModel.create).toHaveBeenCalledWith(
      [
        {
          actorAdministratorId: administratorObjectId,
          reportId,
          sourceFlagId: flagId,
          action: "flag_dismissed",
          reason: "flag_dismissed",
          previousModerationStatus: null,
          newModerationStatus: null,
          note: "No policy issue found",
          occurredAt: expect.any(Date),
        },
      ],
      { session: transaction },
    );
    expect(result.flag).toMatchObject({
      id: flagId.toString(),
      status: "dismissed",
    });
    expect(result.report).toEqual({
      ...expectedReport,
      updatedAt: expectedReportUpdatedAt,
    });
    expect(JSON.stringify(result)).not.toMatch(
      /submittedByUserId|reviewedByAdministratorId|actorAdministratorId/,
    );
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("reauthorizes the actor first inside each transaction", async () => {
    actorQuery.exec.mockResolvedValue(null);

    await expect(
      resolveReportFlag(administrator, flagId.toString(), {
        decision: "dismiss",
        expectedFlagUpdatedAt,
        note: null,
      }),
    ).rejects.toMatchObject({ code: "ADMINISTRATOR_REQUIRED" });

    expect(ReportFlagModel.findOne).not.toHaveBeenCalled();
    expect(ItemReportModel.findOne).not.toHaveBeenCalled();
    expect(ReportFlagModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(ReportModerationEventModel.create).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it.each([
    ["absent", null, expectedFlagUpdatedAt, "REPORT_FLAG_NOT_FOUND"],
    [
      "resolved",
      currentFlag({ status: "dismissed" }),
      expectedFlagUpdatedAt,
      "REPORT_FLAG_STATE_CONFLICT",
    ],
    [
      "stale",
      currentFlag(),
      "2026-08-28T02:00:00.000Z",
      "REPORT_FLAG_STATE_CONFLICT",
    ],
  ])("rejects an %s flag safely", async (_label, record, timestamp, code) => {
    currentFlagQuery.exec.mockResolvedValue(record);

    await expect(
      resolveReportFlag(administrator, flagId.toString(), {
        decision: "dismiss",
        expectedFlagUpdatedAt: timestamp,
        note: null,
      }),
    ).rejects.toMatchObject({ code });

    expect(ReportFlagModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(ReportModerationEventModel.create).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("rejects an absent submitted report", async () => {
    currentReportQuery.exec.mockResolvedValue(null);

    await expect(
      resolveReportFlag(administrator, flagId.toString(), {
        decision: "dismiss",
        expectedFlagUpdatedAt,
        note: null,
      }),
    ).rejects.toMatchObject({ code: "REPORT_NOT_FOUND" });
    expect(ReportFlagModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("treats a lost dismiss update as a flag conflict", async () => {
    updatedFlagQuery.exec.mockResolvedValue(null);

    await expect(
      resolveReportFlag(administrator, flagId.toString(), {
        decision: "dismiss",
        expectedFlagUpdatedAt,
        note: null,
      }),
    ).rejects.toMatchObject({ code: "REPORT_FLAG_STATE_CONFLICT" });
    expect(ReportModerationEventModel.create).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("hides a report, resolves all pending flags and audits once", async () => {
    updatedFlagQuery.exec.mockResolvedValue(
      resolvedFlag("actioned", { resolutionNote: "Hide for review" }),
    );

    const result = await resolveReportFlag(administrator, flagId.toString(), {
      decision: "hide_report",
      expectedFlagUpdatedAt,
      expectedReportUpdatedAt,
      note: "Hide for review",
    });

    expect(ItemReportModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: reportId,
        status: { $in: ["open", "claim_pending", "resolved", "closed"] },
        updatedAt: new Date(expectedReportUpdatedAt),
        $or: [
          { moderationStatus: "visible" },
          { moderationStatus: { $exists: false } },
        ],
      },
      { $set: { moderationStatus: "hidden" } },
      expect.objectContaining({
        new: true,
        runValidators: true,
        session: transaction,
      }),
    );
    const reportUpdate = vi.mocked(ItemReportModel.findOneAndUpdate).mock
      .calls[0][1];
    expect(JSON.stringify(reportUpdate)).not.toMatch(/resolvedAt|"status"/);
    expect(ReportFlagModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: flagId,
        status: "pending",
        updatedAt: new Date(expectedFlagUpdatedAt),
      },
      {
        $set: {
          status: "actioned",
          reviewedByAdministratorId: administratorObjectId,
          reviewedAt: expect.any(Date),
          resolutionNote: "Hide for review",
        },
      },
      expect.objectContaining({ session: transaction }),
    );
    expect(ReportFlagModel.updateMany).toHaveBeenCalledWith(
      { reportId, status: "pending", _id: { $ne: flagId } },
      {
        $set: {
          status: "actioned",
          reviewedByAdministratorId: administratorObjectId,
          reviewedAt: expect.any(Date),
          resolutionNote: "Hide for review",
        },
      },
      { runValidators: true, session: transaction },
    );
    const selectedUpdate = vi.mocked(ReportFlagModel.findOneAndUpdate).mock
      .calls[0]?.[1] as unknown as { $set: { reviewedAt: Date } };
    const siblingUpdate = vi.mocked(ReportFlagModel.updateMany).mock
      .calls[0]?.[1] as unknown as { $set: { reviewedAt: Date } };
    const selectedReviewTime = selectedUpdate.$set.reviewedAt;
    const siblingReviewTime = siblingUpdate.$set.reviewedAt;
    expect(siblingReviewTime).toBe(selectedReviewTime);
    expect(ReportModerationEventModel.create).toHaveBeenCalledWith(
      [
        {
          actorAdministratorId: administratorObjectId,
          reportId,
          sourceFlagId: flagId,
          action: "report_hidden",
          reason: "privacy_concern",
          previousModerationStatus: "visible",
          newModerationStatus: "hidden",
          note: "Hide for review",
          occurredAt: selectedReviewTime,
        },
      ],
      { session: transaction },
    );
    expect(result.flag.status).toBe("actioned");
    expect(result.report.moderationStatus).toBe("hidden");
  });

  it.each([
    ["already hidden", currentReport({ moderationStatus: "hidden" })],
    [
      "stale",
      currentReport({ updatedAt: new Date("2026-08-28T02:00:00.000Z") }),
    ],
  ])("rejects an %s report before flag writes", async (_label, record) => {
    currentReportQuery.exec.mockResolvedValue(record);

    await expect(
      resolveReportFlag(administrator, flagId.toString(), {
        decision: "hide_report",
        expectedFlagUpdatedAt,
        expectedReportUpdatedAt,
        note: null,
      }),
    ).rejects.toMatchObject({ code: "REPORT_MODERATION_CONFLICT" });
    expect(ItemReportModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(ReportFlagModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("maps lost conditional hide writes to exact conflicts", async () => {
    updatedReportQuery.exec.mockResolvedValue(null);
    await expect(
      resolveReportFlag(administrator, flagId.toString(), {
        decision: "hide_report",
        expectedFlagUpdatedAt,
        expectedReportUpdatedAt,
        note: null,
      }),
    ).rejects.toMatchObject({ code: "REPORT_MODERATION_CONFLICT" });

    updatedReportQuery.exec.mockResolvedValue(
      currentReport({ moderationStatus: "hidden" }),
    );
    updatedFlagQuery.exec.mockResolvedValue(null);
    await expect(
      resolveReportFlag(administrator, flagId.toString(), {
        decision: "hide_report",
        expectedFlagUpdatedAt,
        expectedReportUpdatedAt,
        note: null,
      }),
    ).rejects.toMatchObject({ code: "REPORT_FLAG_STATE_CONFLICT" });
  });

  it("directly hides a report and actions every pending flag", async () => {
    const result = await moderateReport(administrator, reportId.toString(), {
      moderationStatus: "hidden",
      reason: "administrative_review",
      expectedUpdatedAt: expectedReportUpdatedAt,
      note: "Manual review",
    });

    expect(ItemReportModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: reportId,
        status: { $in: ["open", "claim_pending", "resolved", "closed"] },
        updatedAt: new Date(expectedReportUpdatedAt),
        $or: [
          { moderationStatus: "visible" },
          { moderationStatus: { $exists: false } },
        ],
      },
      { $set: { moderationStatus: "hidden" } },
      expect.objectContaining({ session: transaction }),
    );
    expect(ReportFlagModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(ReportFlagModel.updateMany).toHaveBeenCalledWith(
      { reportId, status: "pending" },
      {
        $set: {
          status: "actioned",
          reviewedByAdministratorId: administratorObjectId,
          reviewedAt: expect.any(Date),
          resolutionNote: "Manual review",
        },
      },
      { runValidators: true, session: transaction },
    );
    expect(ReportModerationEventModel.create).toHaveBeenCalledWith(
      [
        {
          actorAdministratorId: administratorObjectId,
          reportId,
          sourceFlagId: null,
          action: "report_hidden",
          reason: "administrative_review",
          previousModerationStatus: "visible",
          newModerationStatus: "hidden",
          note: "Manual review",
          occurredAt: expect.any(Date),
        },
      ],
      { session: transaction },
    );
    expect(result.moderationStatus).toBe("hidden");
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("restores only a hidden report and never reopens flags", async () => {
    currentReportQuery.exec.mockResolvedValue(
      currentReport({ moderationStatus: "hidden" }),
    );
    updatedReportQuery.exec.mockResolvedValue(
      currentReport({
        moderationStatus: "visible",
        updatedAt: new Date("2026-08-28T04:00:00.000Z"),
      }),
    );

    const result = await moderateReport(administrator, reportId.toString(), {
      moderationStatus: "visible",
      expectedUpdatedAt: expectedReportUpdatedAt,
      note: "Review complete",
    });

    expect(ItemReportModel.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: reportId,
        status: { $in: ["open", "claim_pending", "resolved", "closed"] },
        updatedAt: new Date(expectedReportUpdatedAt),
        moderationStatus: "hidden",
      },
      { $set: { moderationStatus: "visible" } },
      expect.objectContaining({ session: transaction }),
    );
    expect(ReportFlagModel.updateMany).not.toHaveBeenCalled();
    expect(ReportModerationEventModel.create).toHaveBeenCalledWith(
      [
        {
          actorAdministratorId: administratorObjectId,
          reportId,
          sourceFlagId: null,
          action: "report_restored",
          reason: "moderation_reversed",
          previousModerationStatus: "hidden",
          newModerationStatus: "visible",
          note: "Review complete",
          occurredAt: expect.any(Date),
        },
      ],
      { session: transaction },
    );
    expect(result.moderationStatus).toBe("visible");
  });

  it.each([
    ["absent", null, "hidden", expectedReportUpdatedAt, "REPORT_NOT_FOUND"],
    [
      "repeated hidden",
      currentReport({ moderationStatus: "hidden" }),
      "hidden",
      expectedReportUpdatedAt,
      "REPORT_MODERATION_CONFLICT",
    ],
    [
      "repeated visible",
      currentReport({ moderationStatus: "visible" }),
      "visible",
      expectedReportUpdatedAt,
      "REPORT_MODERATION_CONFLICT",
    ],
    [
      "stale",
      currentReport(),
      "hidden",
      "2026-08-28T02:00:00.000Z",
      "REPORT_MODERATION_CONFLICT",
    ],
  ] as const)(
    "rejects an %s direct transition",
    async (_label, record, next, timestamp, code) => {
      currentReportQuery.exec.mockResolvedValue(record);
      const input =
        next === "hidden"
          ? {
              moderationStatus: "hidden" as const,
              reason: "administrative_review" as const,
              expectedUpdatedAt: timestamp,
              note: null,
            }
          : {
              moderationStatus: "visible" as const,
              expectedUpdatedAt: timestamp,
              note: null,
            };

      await expect(
        moderateReport(administrator, reportId.toString(), input),
      ).rejects.toMatchObject({ code });
      expect(ItemReportModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(ReportModerationEventModel.create).not.toHaveBeenCalled();
      expect(transaction.endSession).toHaveBeenCalledOnce();
    },
  );

  it("treats a lost direct conditional update as a conflict", async () => {
    updatedReportQuery.exec.mockResolvedValue(null);

    await expect(
      moderateReport(administrator, reportId.toString(), {
        moderationStatus: "hidden",
        reason: "administrative_review",
        expectedUpdatedAt: expectedReportUpdatedAt,
        note: null,
      }),
    ).rejects.toMatchObject({ code: "REPORT_MODERATION_CONFLICT" });
    expect(ReportModerationEventModel.create).not.toHaveBeenCalled();
  });

  it.each(["sibling update", "event insertion", "mapper"])(
    "fails closed for a %s failure and ends the session",
    async (stage) => {
      if (stage === "sibling update") {
        vi.mocked(ReportFlagModel.updateMany).mockRejectedValue(
          new Error("PRIVATE-SIBLING-WRITE"),
        );
      } else if (stage === "event insertion") {
        vi.mocked(ReportModerationEventModel.create).mockRejectedValue(
          new Error("PRIVATE-EVENT-WRITE"),
        );
      } else {
        updatedReportQuery.exec.mockResolvedValue(
          currentReport({ createdAt: "PRIVATE-BAD-DATE" }),
        );
      }

      await expect(
        moderateReport(administrator, reportId.toString(), {
          moderationStatus: "hidden",
          reason: "administrative_review",
          expectedUpdatedAt: expectedReportUpdatedAt,
          note: null,
        }),
      ).rejects.toMatchObject({
        code: "REPORT_MODERATION_FAILED",
        message: "Report moderation could not be completed",
      });
      expect(transaction.endSession).toHaveBeenCalledOnce();
    },
  );

  it("ends the session after transaction and end-session failures", async () => {
    transaction.withTransaction.mockRejectedValueOnce(
      new Error("PRIVATE-TRANSACTION"),
    );
    await expect(
      moderateReport(administrator, reportId.toString(), {
        moderationStatus: "hidden",
        reason: "administrative_review",
        expectedUpdatedAt: expectedReportUpdatedAt,
        note: null,
      }),
    ).rejects.toMatchObject({ code: "REPORT_MODERATION_FAILED" });
    expect(transaction.endSession).toHaveBeenCalledOnce();

    transaction.withTransaction.mockImplementationOnce(
      async (work: () => Promise<void>) => await work(),
    );
    transaction.endSession.mockRejectedValueOnce(new Error("PRIVATE-END"));
    await expect(
      moderateReport(administrator, reportId.toString(), {
        moderationStatus: "hidden",
        reason: "administrative_review",
        expectedUpdatedAt: expectedReportUpdatedAt,
        note: null,
      }),
    ).rejects.toMatchObject({ code: "REPORT_MODERATION_FAILED" });
  });

  it("does not resolve before transaction completion and session closure", async () => {
    const order: string[] = [];
    transaction.withTransaction.mockImplementationOnce(async (work) => {
      await work();
      order.push("transaction");
    });
    transaction.endSession.mockImplementationOnce(async () => {
      order.push("session");
    });

    await moderateReport(administrator, reportId.toString(), {
      moderationStatus: "hidden",
      reason: "administrative_review",
      expectedUpdatedAt: expectedReportUpdatedAt,
      note: null,
    });
    order.push("returned");

    expect(order).toEqual(["transaction", "session", "returned"]);
  });
});
