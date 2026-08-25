import type { HydratedDocument } from "mongoose";

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { ItemReportModel, type ItemReport } from "@/models/item-report";

import { MatchingError } from "./matching-errors";
import {
  scoreReportMatch,
  type MatchFactor,
  type ScoringReport,
} from "./matching-score";
import { toMemberReport, type MemberReport } from "./public-report";

const CANDIDATE_LIMIT = 500;
const RESULT_LIMIT = 5;
const MINIMUM_SCORE = 35;

const MATCH_REPORT_PROJECTION = {
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
  privacySettings: 1,
  resolvedAt: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

type MatchReportDocument = HydratedDocument<ItemReport> & {
  createdAt: Date;
  updatedAt: Date;
};

export type ReportMatch = {
  report: MemberReport;
  score: number;
  factors: MatchFactor[];
};

export type ReportMatches = {
  sourceReportId: string;
  matches: ReportMatch[];
};

function toSourceInput(report: MatchReportDocument): ScoringReport {
  return {
    id: report._id.toString(),
    title: report.title,
    publicDescription: report.publicDescription,
    categoryId: report.categoryId.toString(),
    campusLocationId: report.campusLocationId.toString(),
    occurredAt: report.occurredAt.toISOString(),
    colors: [...report.colors],
    tags: [...report.tags],
    createdAt: report.createdAt.toISOString(),
  };
}

function toCandidateInput(report: MemberReport): ScoringReport {
  return {
    id: report.id,
    title: report.title,
    publicDescription: report.publicDescription,
    categoryId: report.categoryId,
    campusLocationId: report.campusLocationId,
    occurredAt: report.occurredAt,
    colors: [...report.colors],
    tags: [...report.tags],
    createdAt: report.createdAt,
  };
}

export async function findReportMatches(
  user: PublicUser,
  reportId: string,
): Promise<ReportMatches> {
  await connectToDatabase();

  const source = await ItemReportModel.findOne(
    { _id: reportId, reporterId: user.id },
    MATCH_REPORT_PROJECTION,
  ).exec();

  if (!source) throw new MatchingError("REPORT_NOT_FOUND");
  if (source.status !== "open") {
    throw new MatchingError("REPORT_NOT_MATCHABLE");
  }

  const candidates = await ItemReportModel.find(
    {
      _id: { $ne: source._id },
      reporterId: { $ne: source.reporterId },
      reportType: source.reportType === "lost" ? "found" : "lost",
      status: "open",
    },
    MATCH_REPORT_PROJECTION,
  )
    .sort({ createdAt: -1, _id: -1 })
    .limit(CANDIDATE_LIMIT)
    .exec();

  const sourceInput = toSourceInput(source);
  const matches = candidates
    .map((document) => {
      const report = toMemberReport(document, user.id);
      const result = scoreReportMatch(sourceInput, toCandidateInput(report));
      return { report, score: result.score, factors: result.factors };
    })
    .filter((match) => match.score >= MINIMUM_SCORE)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.report.createdAt.localeCompare(left.report.createdAt) ||
        right.report.id.localeCompare(left.report.id),
    )
    .slice(0, RESULT_LIMIT);

  return { sourceReportId: source._id.toString(), matches };
}
