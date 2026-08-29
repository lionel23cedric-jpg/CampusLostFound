import {
  Types,
  type ClientSession,
  type PipelineStage,
  type QueryFilter,
} from "mongoose";

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { MEMBER_REPORT_STATUSES } from "@/lib/reports/browse-validation";
import {
  ItemReportModel,
  normalizeReportModerationStatus,
  type ItemReport,
} from "@/models/item-report";
import { ReportModerationEventModel } from "@/models/report-moderation-event";
import {
  REPORT_FLAG_REASONS,
  ReportFlagModel,
  type ReportFlagReason,
} from "@/models/report-flag";
import { UserModel } from "@/models/user";

import { requireModerationAdministrator } from "./access";
import {
  parseAdminReportFlagPage,
  parseAdminReportPage,
  toAdminReportFlag,
  toAdminReportSummary,
  type AdminReportFlagDecisionResult,
  type AdminReportFlagPage,
  type AdminReportRecord,
  type AdminReportSummary,
  type AdminReportPage,
  type ReportFlagRecord,
} from "./contracts";
import { ModerationError } from "./errors";
import {
  MODERATION_PAGE_SIZE,
  type AdminFlagListQuery,
  type AdminReportListQuery,
  type ReportFlagDecisionInput,
  type ReportModerationInput,
} from "./validation";

const adminReportProjection = {
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
  moderationStatus: { $ifNull: ["$moderationStatus", "visible"] },
  privacySettings: 1,
  resolvedAt: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

const adminReportSelect = {
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
  moderationStatus: 1,
  privacySettings: 1,
  resolvedAt: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

const adminFlagSelect = {
  _id: 1,
  reportId: 1,
  reason: 1,
  details: 1,
  status: 1,
  reviewedAt: 1,
  resolutionNote: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

const visibleReportState: QueryFilter<ItemReport> = {
  $or: [
    { moderationStatus: "visible" },
    { moderationStatus: { $exists: false } },
  ],
};

function buildAdminReportPipeline(
  match: PipelineStage.Match["$match"],
  query: AdminReportListQuery,
): PipelineStage[] {
  const sort: PipelineStage.Sort["$sort"] = query.q
    ? {
        score: { $meta: "textScore" as const },
        createdAt: -1 as const,
        _id: -1 as const,
      }
    : { createdAt: -1 as const, _id: -1 as const };

  return [
    { $match: match },
    {
      $facet: {
        reports: [
          { $sort: sort },
          { $skip: (query.page - 1) * MODERATION_PAGE_SIZE },
          { $limit: MODERATION_PAGE_SIZE },
          { $project: adminReportProjection },
        ],
        metadata: [{ $count: "totalItems" }],
      },
    },
  ];
}

function buildAdminReportFlagPipeline(
  query: AdminFlagListQuery,
): PipelineStage[] {
  return [
    {
      $match: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.reason ? { reason: query.reason } : {}),
      },
    },
    {
      $lookup: {
        from: "itemReports",
        let: { reportId: "$reportId" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$_id", "$$reportId"] },
              status: { $in: [...MEMBER_REPORT_STATUSES] },
            },
          },
          { $project: adminReportProjection },
        ],
        as: "report",
      },
    },
    { $unwind: "$report" },
    {
      $facet: {
        flags: [
          { $sort: { createdAt: -1, _id: -1 } },
          { $skip: (query.page - 1) * MODERATION_PAGE_SIZE },
          { $limit: MODERATION_PAGE_SIZE },
          {
            $project: {
              _id: 1,
              reportId: 1,
              reason: 1,
              details: 1,
              status: 1,
              reviewedAt: 1,
              resolutionNote: 1,
              createdAt: 1,
              updatedAt: 1,
              report: 1,
            },
          },
        ],
        metadata: [{ $count: "totalItems" }],
      },
    },
  ];
}

export async function listAdminReports(
  administrator: PublicUser,
  query: AdminReportListQuery,
): Promise<AdminReportPage> {
  requireModerationAdministrator(administrator);

  try {
    await connectToDatabase();
    const match: PipelineStage.Match["$match"] = {
      status: { $in: [...MEMBER_REPORT_STATUSES] },
      ...(query.q ? { $text: { $search: query.q } } : {}),
      ...(query.reportType ? { reportType: query.reportType } : {}),
      ...(query.reportStatus ? { status: query.reportStatus } : {}),
      ...(query.moderationStatus === "hidden"
        ? { moderationStatus: "hidden" }
        : query.moderationStatus === "visible"
          ? { moderationStatus: { $ne: "hidden" } }
          : {}),
    };
    const rows = await ItemReportModel.aggregate(
      buildAdminReportPipeline(match, query),
    ).exec();
    return parseAdminReportPage(rows, query.page);
  } catch (error) {
    if (error instanceof ModerationError) throw error;
    throw new ModerationError("REPORT_MODERATION_FAILED");
  }
}

export async function listAdminReportFlags(
  administrator: PublicUser,
  query: AdminFlagListQuery,
): Promise<AdminReportFlagPage> {
  requireModerationAdministrator(administrator);

  try {
    await connectToDatabase();
    const rows = await ReportFlagModel.aggregate(
      buildAdminReportFlagPipeline(query),
    ).exec();
    return parseAdminReportFlagPage(rows, query.page);
  } catch (error) {
    if (error instanceof ModerationError) throw error;
    throw new ModerationError("REPORT_MODERATION_FAILED");
  }
}

async function requireActiveAdministratorInTransaction(
  administratorId: Types.ObjectId,
  session: ClientSession,
) {
  const actor = await UserModel.findOne({
    _id: administratorId,
    role: "administrator",
    status: "active",
  })
    .select({ _id: 1 })
    .session(session)
    .lean<{ _id: unknown } | null>()
    .exec();
  if (!actor) throw new ModerationError("ADMINISTRATOR_REQUIRED");
}

function rethrowSafeModerationError(error: unknown): never {
  if (error instanceof ModerationError) throw error;
  throw new ModerationError("REPORT_MODERATION_FAILED");
}

async function runModerationTransaction<T>(
  administratorId: string,
  work: (
    administratorObjectId: Types.ObjectId,
    session: ClientSession,
  ) => Promise<T>,
): Promise<T> {
  let result: T | undefined;
  let session: ClientSession | null = null;
  let failure: unknown;
  let failed = false;

  try {
    const database = await connectToDatabase();
    const activeSession = await database.startSession();
    session = activeSession;
    const administratorObjectId = new Types.ObjectId(administratorId);

    await activeSession.withTransaction(async () => {
      await requireActiveAdministratorInTransaction(
        administratorObjectId,
        activeSession,
      );
      result = await work(administratorObjectId, activeSession);
    });
  } catch (error) {
    failure = error;
    failed = true;
  }

  if (session) {
    try {
      await session.endSession();
    } catch (error) {
      if (!failed) {
        failure = error;
        failed = true;
      }
    }
  }

  if (failed) rethrowSafeModerationError(failure);
  if (result === undefined) {
    throw new ModerationError("REPORT_MODERATION_FAILED");
  }
  return result;
}

async function findSubmittedReport(
  reportId: Types.ObjectId,
  session: ClientSession,
) {
  return ItemReportModel.findOne(
    {
      _id: reportId,
      status: { $in: [...MEMBER_REPORT_STATUSES] },
    },
    adminReportSelect,
  )
    .session(session)
    .lean<AdminReportRecord | null>()
    .exec();
}

function assertCurrentReport(
  report: AdminReportRecord,
  expectedUpdatedAt: string,
  nextStatus: "visible" | "hidden",
) {
  if (!(report.updatedAt instanceof Date)) {
    throw new Error("Report update timestamp is invalid");
  }
  const currentStatus = normalizeReportModerationStatus(
    report.moderationStatus,
  );
  if (
    report.updatedAt.toISOString() !== expectedUpdatedAt ||
    currentStatus === nextStatus
  ) {
    throw new ModerationError("REPORT_MODERATION_CONFLICT");
  }
  return currentStatus;
}

function requireReportFlagReason(value: unknown): ReportFlagReason {
  if (!REPORT_FLAG_REASONS.includes(value as ReportFlagReason)) {
    throw new Error("Report flag reason is invalid");
  }
  return value as ReportFlagReason;
}

function resolvedFlagUpdate(
  status: "dismissed" | "actioned",
  administratorObjectId: Types.ObjectId,
  reviewedAt: Date,
  note: string | null,
) {
  return {
    $set: {
      status,
      reviewedByAdministratorId: administratorObjectId,
      reviewedAt,
      resolutionNote: note,
    },
  } as const;
}

async function actionPendingFlags(
  reportId: Types.ObjectId,
  administratorObjectId: Types.ObjectId,
  reviewedAt: Date,
  note: string | null,
  session: ClientSession,
  excludedFlagId?: Types.ObjectId,
) {
  const result = await ReportFlagModel.updateMany(
    {
      reportId,
      status: "pending",
      ...(excludedFlagId ? { _id: { $ne: excludedFlagId } } : {}),
    },
    resolvedFlagUpdate(
      "actioned",
      administratorObjectId,
      reviewedAt,
      note,
    ),
    { runValidators: true, session },
  );
  if (!result.acknowledged) {
    throw new Error("Pending flag update was not acknowledged");
  }
}

export async function resolveReportFlag(
  administrator: PublicUser,
  flagId: string,
  input: ReportFlagDecisionInput,
): Promise<AdminReportFlagDecisionResult> {
  requireModerationAdministrator(administrator);

  return runModerationTransaction(
    administrator.id,
    async (administratorObjectId, session) => {
      const flagObjectId = new Types.ObjectId(flagId);
      const flag = await ReportFlagModel.findOne(
        { _id: flagObjectId },
        adminFlagSelect,
      )
        .session(session)
        .lean<ReportFlagRecord | null>()
        .exec();
      if (!flag) throw new ModerationError("REPORT_FLAG_NOT_FOUND");
      if (flag.status !== "pending") {
        throw new ModerationError("REPORT_FLAG_STATE_CONFLICT");
      }
      if (!(flag.updatedAt instanceof Date)) {
        throw new Error("Flag update timestamp is invalid");
      }
      if (flag.updatedAt.toISOString() !== input.expectedFlagUpdatedAt) {
        throw new ModerationError("REPORT_FLAG_STATE_CONFLICT");
      }

      const reportObjectId = new Types.ObjectId(flag.reportId.toString());
      const flagReason = requireReportFlagReason(flag.reason);
      const report = await findSubmittedReport(reportObjectId, session);
      if (!report) throw new ModerationError("REPORT_NOT_FOUND");
      const reviewedAt = new Date();

      if (input.decision === "dismiss") {
        const updatedFlag = await ReportFlagModel.findOneAndUpdate(
          {
            _id: flagObjectId,
            status: "pending",
            updatedAt: new Date(input.expectedFlagUpdatedAt),
          },
          resolvedFlagUpdate(
            "dismissed",
            administratorObjectId,
            reviewedAt,
            input.note,
          ),
          {
            new: true,
            runValidators: true,
            session,
            projection: adminFlagSelect,
          },
        )
          .lean<ReportFlagRecord | null>()
          .exec();
        if (!updatedFlag) {
          throw new ModerationError("REPORT_FLAG_STATE_CONFLICT");
        }

        await ReportModerationEventModel.create(
          [
            {
              actorAdministratorId: administratorObjectId,
              reportId: reportObjectId,
              sourceFlagId: flagObjectId,
              action: "flag_dismissed",
              reason: "flag_dismissed",
              previousModerationStatus: null,
              newModerationStatus: null,
              note: input.note,
              occurredAt: reviewedAt,
            },
          ],
          { session },
        );
        return {
          flag: toAdminReportFlag(updatedFlag, report),
          report: toAdminReportSummary(report),
        };
      }

      assertCurrentReport(
        report,
        input.expectedReportUpdatedAt,
        "hidden",
      );
      const hideReportFilter: QueryFilter<ItemReport> = {
        _id: reportObjectId,
        status: { $in: [...MEMBER_REPORT_STATUSES] },
        updatedAt: new Date(input.expectedReportUpdatedAt),
        ...visibleReportState,
      };
      const updatedReport = await ItemReportModel.findOneAndUpdate(
        hideReportFilter,
        { $set: { moderationStatus: "hidden" } },
        {
          new: true,
          runValidators: true,
          session,
          projection: adminReportSelect,
        },
      )
        .lean<AdminReportRecord | null>()
        .exec();
      if (!updatedReport) {
        throw new ModerationError("REPORT_MODERATION_CONFLICT");
      }

      const updatedFlag = await ReportFlagModel.findOneAndUpdate(
        {
          _id: flagObjectId,
          status: "pending",
          updatedAt: new Date(input.expectedFlagUpdatedAt),
        },
        resolvedFlagUpdate(
          "actioned",
          administratorObjectId,
          reviewedAt,
          input.note,
        ),
        {
          new: true,
          runValidators: true,
          session,
          projection: adminFlagSelect,
        },
      )
        .lean<ReportFlagRecord | null>()
        .exec();
      if (!updatedFlag) {
        throw new ModerationError("REPORT_FLAG_STATE_CONFLICT");
      }

      await actionPendingFlags(
        reportObjectId,
        administratorObjectId,
        reviewedAt,
        input.note,
        session,
        flagObjectId,
      );
      await ReportModerationEventModel.create(
        [
          {
            actorAdministratorId: administratorObjectId,
            reportId: reportObjectId,
            sourceFlagId: flagObjectId,
            action: "report_hidden",
            reason: flagReason,
            previousModerationStatus: "visible",
            newModerationStatus: "hidden",
            note: input.note,
            occurredAt: reviewedAt,
          },
        ],
        { session },
      );
      return {
        flag: toAdminReportFlag(updatedFlag, updatedReport),
        report: toAdminReportSummary(updatedReport),
      };
    },
  );
}

export async function moderateReport(
  administrator: PublicUser,
  reportId: string,
  input: ReportModerationInput,
): Promise<AdminReportSummary> {
  requireModerationAdministrator(administrator);

  return runModerationTransaction(
    administrator.id,
    async (administratorObjectId, session) => {
      const reportObjectId = new Types.ObjectId(reportId);
      const report = await findSubmittedReport(reportObjectId, session);
      if (!report) throw new ModerationError("REPORT_NOT_FOUND");
      const previousStatus = assertCurrentReport(
        report,
        input.expectedUpdatedAt,
        input.moderationStatus,
      );
      const reviewedAt = new Date();
      const stateFilter: QueryFilter<ItemReport> =
        input.moderationStatus === "hidden"
          ? visibleReportState
          : { moderationStatus: "hidden" as const };
      const transitionFilter: QueryFilter<ItemReport> = {
        _id: reportObjectId,
        status: { $in: [...MEMBER_REPORT_STATUSES] },
        updatedAt: new Date(input.expectedUpdatedAt),
        ...stateFilter,
      };
      const updatedReport = await ItemReportModel.findOneAndUpdate(
        transitionFilter,
        { $set: { moderationStatus: input.moderationStatus } },
        {
          new: true,
          runValidators: true,
          session,
          projection: adminReportSelect,
        },
      )
        .lean<AdminReportRecord | null>()
        .exec();
      if (!updatedReport) {
        throw new ModerationError("REPORT_MODERATION_CONFLICT");
      }

      if (input.moderationStatus === "hidden") {
        await actionPendingFlags(
          reportObjectId,
          administratorObjectId,
          reviewedAt,
          input.note,
          session,
        );
      }
      await ReportModerationEventModel.create(
        [
          {
            actorAdministratorId: administratorObjectId,
            reportId: reportObjectId,
            sourceFlagId: null,
            action:
              input.moderationStatus === "hidden"
                ? "report_hidden"
                : "report_restored",
            reason:
              input.moderationStatus === "hidden"
                ? input.reason
                : "moderation_reversed",
            previousModerationStatus: previousStatus,
            newModerationStatus: input.moderationStatus,
            note: input.note,
            occurredAt: reviewedAt,
          },
        ],
        { session },
      );
      return toAdminReportSummary(updatedReport);
    },
  );
}
