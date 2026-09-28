import type { QueryFilter } from "mongoose";

import type { AiMethod } from "@/lib/ai/contracts";
import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { ItemReportModel, type ItemReport } from "@/models/item-report";

import {
  MEMBER_REPORT_STATUSES,
  type ReportBrowseQuery,
} from "./browse-validation";
import { ReportError } from "./errors";
import { embedPublicText } from "./local-embedding";
import { type MemberReport, toMemberReport } from "./public-report";
import { cosineSimilarity } from "./semantic-score";

const SMART_SEARCH_CANDIDATE_LIMIT = 100;

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
  searchMethod?: AiMethod;
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

function publicSearchText(
  report: Pick<ItemReport, "title" | "publicDescription" | "tags">,
) {
  return `${report.title}. ${report.publicDescription}. ${report.tags.join(" ")}`;
}

async function listKeywordReports(
  user: PublicUser,
  query: ReportBrowseQuery,
  filter: QueryFilter<ItemReport>,
  searchMethod?: AiMethod,
): Promise<ReportPage> {
  const usesTextScore = filter.$text !== undefined;
  const projection = usesTextScore
    ? { ...MEMBER_REPORT_PROJECTION, score: { $meta: "textScore" } }
    : MEMBER_REPORT_PROJECTION;
  const sort: Record<string, -1 | { $meta: "textScore" }> = usesTextScore
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
    ...(searchMethod ? { searchMethod } : {}),
  };
}

async function listSmartReports(
  user: PublicUser,
  query: ReportBrowseQuery & { smartQuery: string },
  filter: QueryFilter<ItemReport>,
): Promise<ReportPage> {
  const candidates = await ItemReportModel.find(filter, MEMBER_REPORT_PROJECTION)
    .sort({ createdAt: -1, _id: -1 })
    .limit(SMART_SEARCH_CANDIDATE_LIMIT)
    .exec();

  try {
    const queryVector = await embedPublicText(query.smartQuery);
    const ranked: Array<{ report: (typeof candidates)[number]; similarity: number }> = [];
    for (const report of candidates) {
      const reportVector = await embedPublicText(publicSearchText(report));
      ranked.push({
        report,
        similarity: cosineSimilarity(queryVector, reportVector),
      });
    }
    ranked.sort(
      (left, right) =>
        right.similarity - left.similarity ||
        right.report.createdAt.getTime() - left.report.createdAt.getTime() ||
        String(right.report._id).localeCompare(String(left.report._id)),
    );

    const start = (query.page - 1) * query.pageSize;
    const page = ranked.slice(start, start + query.pageSize);
    return {
      reports: page.map(({ report }) => toMemberReport(report, user.id)),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: ranked.length,
        totalPages: Math.ceil(ranked.length / query.pageSize),
      },
      searchMethod: "model_assisted",
    };
  } catch {
    const keywordFilter = {
      ...filter,
      $text: {
        $search: [query.q, query.smartQuery].filter(Boolean).join(" "),
      },
    };
    return listKeywordReports(user, query, keywordFilter, "fallback");
  }
}

export async function listReports(
  user: PublicUser,
  query: ReportBrowseQuery,
): Promise<ReportPage> {
  await connectToDatabase();
  const filter = buildFilter(query);
  return query.smartQuery
    ? listSmartReports(user, { ...query, smartQuery: query.smartQuery }, filter)
    : listKeywordReports(user, query, filter);
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
