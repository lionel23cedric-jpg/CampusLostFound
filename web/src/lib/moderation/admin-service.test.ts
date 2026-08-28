import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/item-report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/models/item-report")>();
  return { ...actual, ItemReportModel: { aggregate: vi.fn() } };
});
vi.mock("@/models/report-flag", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/models/report-flag")>();
  return { ...actual, ReportFlagModel: { aggregate: vi.fn() } };
});

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { ItemReportModel } from "@/models/item-report";
import { ReportFlagModel } from "@/models/report-flag";

import { listAdminReportFlags, listAdminReports } from "./admin-service";

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
