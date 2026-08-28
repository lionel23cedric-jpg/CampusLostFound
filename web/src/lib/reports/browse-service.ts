import type { QueryFilter } from "mongoose";

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { ItemReportModel, type ItemReport } from "@/models/item-report";

import {
  MEMBER_REPORT_STATUSES,
  type ReportBrowseQuery,
} from "./browse-validation";
import { ReportError } from "./errors";
import { type MemberReport, toMemberReport } from "./public-report";

const MEMBER_REPORT_PROJECTION = {
  _id: 1,
  reporterId: 1,
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

export type ReportPage = {
  reports: MemberReport[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildFilter(query: ReportBrowseQuery): QueryFilter<ItemReport> {
  const filter: QueryFilter<ItemReport> = {
    status: query.status ?? { $in: [...MEMBER_REPORT_STATUSES] },
    moderationStatus: { $ne: "hidden" },
  };

  if (query.q) filter.$text = { $search: query.q };
  if (query.reportType) filter.reportType = query.reportType;
  if (query.categoryId) filter.categoryId = query.categoryId;
  if (query.color) {
    filter.colors = {
      $regex: new RegExp(`^${escapeRegularExpression(query.color)}$`, "i"),
    };
  }
  if (query.campusLocationId) {
    filter.campusLocationId = query.campusLocationId;
    filter["privacySettings.showCampusLocation"] = true;
  }
  if (query.occurredFrom || query.occurredTo) {
    filter.occurredAt = {
      ...(query.occurredFrom ? { $gte: query.occurredFrom } : {}),
      ...(query.occurredTo ? { $lte: query.occurredTo } : {}),
    };
    filter["privacySettings.showEventDate"] = true;
  }
  if (query.hasPhoto === true) {
    filter["privacySettings.showPhoto"] = true;
    filter["photoUrls.0"] = { $exists: true };
  }
  if (query.hasPhoto === false) {
    filter.$or = [
      { "privacySettings.showPhoto": false },
      { "photoUrls.0": { $exists: false } },
    ];
  }

  return filter;
}

export async function listReports(
  user: PublicUser,
  query: ReportBrowseQuery,
): Promise<ReportPage> {
  await connectToDatabase();
  const filter = buildFilter(query);
  const projection = query.q
    ? { ...MEMBER_REPORT_PROJECTION, score: { $meta: "textScore" } }
    : MEMBER_REPORT_PROJECTION;
  const sort: Record<string, -1 | { $meta: "textScore" }> = query.q
    ? { score: { $meta: "textScore" }, occurredAt: -1, _id: -1 }
    : { occurredAt: -1, _id: -1 };

  const reportsQuery = ItemReportModel.find(filter, projection)
    .sort(sort)
    .skip((query.page - 1) * query.pageSize)
    .limit(query.pageSize);

  const [documents, total] = await Promise.all([
    reportsQuery.exec(),
    ItemReportModel.countDocuments(filter).exec(),
  ]);

  return {
    reports: documents.map((report) => toMemberReport(report, user.id)),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

export async function getReport(user: PublicUser, reportId: string) {
  await connectToDatabase();
  const report = await ItemReportModel.findOne(
    {
      _id: reportId,
      status: { $in: [...MEMBER_REPORT_STATUSES] },
      $or: [
        { moderationStatus: { $ne: "hidden" } },
        { reporterId: user.id },
      ],
    },
    MEMBER_REPORT_PROJECTION,
  ).exec();

  if (!report) throw new ReportError("REPORT_NOT_FOUND");
  return toMemberReport(report, user.id);
}
