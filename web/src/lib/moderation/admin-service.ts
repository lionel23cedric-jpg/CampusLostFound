import type { PipelineStage } from "mongoose";

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { MEMBER_REPORT_STATUSES } from "@/lib/reports/browse-validation";
import { ItemReportModel } from "@/models/item-report";
import { ReportFlagModel } from "@/models/report-flag";

import { requireModerationAdministrator } from "./access";
import {
  parseAdminReportFlagPage,
  parseAdminReportPage,
  type AdminReportFlagPage,
  type AdminReportPage,
} from "./contracts";
import { ModerationError } from "./errors";
import {
  MODERATION_PAGE_SIZE,
  type AdminFlagListQuery,
  type AdminReportListQuery,
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
