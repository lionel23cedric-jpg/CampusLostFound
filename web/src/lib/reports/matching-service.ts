import type { HydratedDocument } from "mongoose";

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { ItemReportModel, type ItemReport } from "@/models/item-report";

import { MatchingError } from "./matching-errors";
import { embedPublicText } from "./local-embedding";
import {
  scoreReportMatch,
  type MatchFactor,
  type ScoringReport,
} from "./matching-score";
import { toMemberReport, type MemberReport } from "./public-report";
import { replaceTextFactor, semanticTextPoints } from "./semantic-score";

export const MATCH_CANDIDATE_LIMIT = 500;
export const MATCH_RESULT_LIMIT = 5;
export const MATCH_MINIMUM_SCORE = 35;
export const MATCH_SEMANTIC_SHORTLIST_LIMIT = 30;

export const MATCH_REPORT_PROJECTION = {
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
  matchingMethod: "model_assisted" | "rule_fallback";
  matches: ReportMatch[];
};

function rankMatches(matches: ReportMatch[]): ReportMatch[] {
  return [...matches]
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.report.createdAt.localeCompare(left.report.createdAt) ||
        right.report.id.localeCompare(left.report.id),
    );
}

function publicText(report: Pick<ScoringReport, "title" | "publicDescription">) {
  return `${report.title}. ${report.publicDescription}`;
}

export function toSourceInput(report: MatchReportDocument): ScoringReport {
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

export function toCandidateInput(report: MemberReport): ScoringReport {
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
    {
      _id: reportId,
      reporterId: user.id,
      moderationStatus: { $ne: "hidden" },
    },
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
      moderationStatus: { $ne: "hidden" },
    },
    MATCH_REPORT_PROJECTION,
  )
    .sort({ createdAt: -1, _id: -1 })
    .limit(MATCH_CANDIDATE_LIMIT)
    .exec();

  const sourceInput = toSourceInput(source);
  const ruleMatches = candidates
    .map((document) => {
      const report = toMemberReport(document, user.id);
      const result = scoreReportMatch(sourceInput, toCandidateInput(report));
      return { report, score: result.score, factors: result.factors };
    });

  let matchingMethod: ReportMatches["matchingMethod"] = "rule_fallback";
  let ranked = rankMatches(ruleMatches);
  const eligible = ranked.filter((match) => match.score >= MATCH_MINIMUM_SCORE);
  if (eligible.length > 0) {
    try {
      const shortlist = eligible.slice(0, MATCH_SEMANTIC_SHORTLIST_LIMIT);
      const sourceVector = await embedPublicText(publicText(sourceInput));
      const modelMatches: ReportMatch[] = [];
      for (const match of shortlist) {
        const vector = await embedPublicText(publicText(match.report));
        const updated = replaceTextFactor(
          { score: match.score, factors: match.factors },
          semanticTextPoints(sourceVector, vector),
        );
        modelMatches.push({ report: match.report, ...updated });
      }
      ranked = rankMatches(modelMatches);
      matchingMethod = "model_assisted";
    } catch {
      // Missing model files or inference failure must not interrupt safe rule matching.
    }
  }

  const matches = ranked
    .filter((match) => match.score >= MATCH_MINIMUM_SCORE)
    .slice(0, MATCH_RESULT_LIMIT);

  return { sourceReportId: source._id.toString(), matchingMethod, matches };
}
