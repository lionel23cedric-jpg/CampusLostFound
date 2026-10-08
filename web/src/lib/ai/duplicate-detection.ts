import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { requireModerationAdministrator } from "@/lib/moderation/access";
import { ModerationError } from "@/lib/moderation/errors";
import { MEMBER_REPORT_STATUSES } from "@/lib/reports/browse-validation";
import { embedPublicText } from "@/lib/reports/local-embedding";
import {
  scoreReportMatch,
  type MatchScore,
  type ScoringReport,
} from "@/lib/reports/matching-score";
import { replaceTextFactor, semanticTextPoints } from "@/lib/reports/semantic-score";
import { ItemReportModel } from "@/models/item-report";

import {
  duplicateScanResponseSchema,
  type AiMethod,
  type DuplicatePair,
  type DuplicateScanResponse,
} from "./contracts";

export const DUPLICATE_REPORT_LIMIT = 200;
export const DUPLICATE_PAIR_LIMIT = 20;
export const DUPLICATE_SIMILARITY_THRESHOLD = 0.82;

export const DUPLICATE_REPORT_PROJECTION = {
  _id: 1,
  reportType: 1,
  title: 1,
  publicDescription: 1,
  categoryId: 1,
  campusLocationId: 1,
  occurredAt: 1,
  colors: 1,
  tags: 1,
  status: 1,
  moderationStatus: 1,
  createdAt: 1,
} as const;

type DuplicateReportRecord = {
  _id: { toString(): string } | string;
  reportType: "lost" | "found";
  title: string;
  publicDescription: string;
  categoryId: { toString(): string } | string;
  campusLocationId: { toString(): string } | string;
  occurredAt: Date;
  colors: string[];
  tags: string[];
  status: (typeof MEMBER_REPORT_STATUSES)[number] | "draft";
  moderationStatus?: "visible" | "hidden";
  createdAt: Date;
};

type CandidatePair = {
  left: ScoringReport & { reportType: "lost" | "found" };
  right: ScoringReport & { reportType: "lost" | "found" };
  ruleScore: MatchScore;
};

function toScoringReport(record: DuplicateReportRecord) {
  return {
    id: record._id.toString(),
    reportType: record.reportType,
    title: record.title,
    publicDescription: record.publicDescription,
    categoryId: record.categoryId.toString(),
    campusLocationId: record.campusLocationId.toString(),
    occurredAt: record.occurredAt.toISOString(),
    colors: [...record.colors],
    tags: [...record.tags],
    createdAt: record.createdAt.toISOString(),
  };
}

function publicText(report: ScoringReport) {
  const title = report.title.replace(/[.!?]+$/u, "");
  const description = report.publicDescription.replace(/[.!?]+$/u, "");
  return `${title}. ${description}. ${report.tags.join(" ")} ${report.colors.join(" ")}`.trim();
}

function isShortlisted(score: MatchScore) {
  return score.factors.some(({ key }) =>
    key === "category" || key === "location" || key === "date",
  );
}

function toDuplicatePair(
  candidate: CandidatePair,
  score: MatchScore,
  method: AiMethod,
): DuplicatePair | null {
  const similarity = Math.max(0, Math.min(1, score.score / 100));
  if (similarity < DUPLICATE_SIMILARITY_THRESHOLD) return null;

  const [left, right] = candidate.left.id < candidate.right.id
    ? [candidate.left, candidate.right]
    : [candidate.right, candidate.left];
  return {
    leftReport: {
      id: left.id,
      reportType: left.reportType,
      title: left.title,
      occurredAt: left.occurredAt!,
    },
    rightReport: {
      id: right.id,
      reportType: right.reportType,
      title: right.title,
      occurredAt: right.occurredAt!,
    },
    similarity,
    reasons: [...score.factors]
      .sort((first, second) => second.points - first.points)
      .slice(0, 6)
      .map(({ explanation }) => explanation),
    method,
  };
}

function rankPairs(pairs: DuplicatePair[]) {
  return pairs
    .sort(
      (left, right) =>
        right.similarity - left.similarity ||
        left.leftReport.id.localeCompare(right.leftReport.id) ||
        left.rightReport.id.localeCompare(right.rightReport.id),
    )
    .slice(0, DUPLICATE_PAIR_LIMIT);
}

async function modelScores(candidates: CandidatePair[]) {
  const vectors = new Map<string, Float32Array>();
  const reports = new Map<string, CandidatePair["left"]>();
  for (const candidate of candidates) {
    reports.set(candidate.left.id, candidate.left);
    reports.set(candidate.right.id, candidate.right);
  }
  for (const report of reports.values()) {
    vectors.set(report.id, await embedPublicText(publicText(report)));
  }
  return candidates.map((candidate) =>
    replaceTextFactor(
      candidate.ruleScore,
      semanticTextPoints(
        vectors.get(candidate.left.id)!,
        vectors.get(candidate.right.id)!,
      ),
    ),
  );
}
/**
 * Identifies potentially duplicate reports.
 *
 * Compares reports of the same type and uses structured
 * evidence to shortlist candidate pairs.
 *
 * Semantic similarity improves the text component
 * of the combined score without replacing rule-based
 * factors such as category, location and date.
 *
 * Returns ranked candidates for manual review.
 * Falls back to rule-based scoring if inference fails.
 */
export async function scanDuplicateReports(
  administrator: PublicUser,
): Promise<DuplicateScanResponse> {
  requireModerationAdministrator(administrator);

  let records: DuplicateReportRecord[];
  try {
    await connectToDatabase();
    records = await ItemReportModel.find(
      {
        status: { $in: [...MEMBER_REPORT_STATUSES] },
        moderationStatus: { $ne: "hidden" },
      },
      DUPLICATE_REPORT_PROJECTION,
    )
      .sort({ createdAt: -1, _id: -1 })
      .limit(DUPLICATE_REPORT_LIMIT)
      .lean<DuplicateReportRecord[]>()
      .exec();
  } catch (error) {
    if (error instanceof ModerationError) throw error;
    throw new ModerationError("REPORT_MODERATION_FAILED");
  }

  const reports = records
    .filter(
      (report) =>
        report.status !== "draft" && report.moderationStatus !== "hidden",
    )
    .map(toScoringReport);
  const candidates: CandidatePair[] = [];
  for (let leftIndex = 0; leftIndex < reports.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < reports.length; rightIndex += 1) {
      const left = reports[leftIndex];
      const right = reports[rightIndex];
      if (left.id === right.id || left.reportType !== right.reportType) continue;
      const ruleScore = scoreReportMatch(left, right);
      if (isShortlisted(ruleScore)) candidates.push({ left, right, ruleScore });
    }
  }

  let scores = candidates.map(({ ruleScore }) => ruleScore);
  let method: AiMethod = "fallback";
  if (candidates.length > 0) {
    try {
      scores = await modelScores(candidates);
      method = "model_assisted";
    } catch {
      // A local-model failure leaves the deterministic scan available.
    }
  }

  const pairs = rankPairs(
    candidates.flatMap((candidate, index) => {
      const pair = toDuplicatePair(candidate, scores[index], method);
      return pair ? [pair] : [];
    }),
  );
  return duplicateScanResponseSchema.parse({ pairs });
}
