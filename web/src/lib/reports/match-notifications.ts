import type { ClientSession, HydratedDocument } from "mongoose";

import {
  createNotificationPlan,
  type NotificationPlan,
} from "@/lib/notifications/delivery";
import { ItemReportModel, type ItemReport } from "@/models/item-report";

import { scoreReportMatch } from "./matching-score";
import {
  MATCH_CANDIDATE_LIMIT,
  MATCH_MINIMUM_SCORE,
  MATCH_REPORT_PROJECTION,
  MATCH_RESULT_LIMIT,
  toCandidateInput,
  toSourceInput,
} from "./matching-service";
import { toMemberReport } from "./public-report";

type MatchReportDocument = HydratedDocument<ItemReport> & {
  createdAt: Date;
  updatedAt: Date;
};

export async function planPossibleMatchNotifications(
  report: MatchReportDocument,
  session: ClientSession,
): Promise<NotificationPlan[]> {
  const candidates = await ItemReportModel.find(
    {
      _id: { $ne: report._id },
      reporterId: { $ne: report.reporterId },
      reportType: report.reportType === "lost" ? "found" : "lost",
      status: "open",
      moderationStatus: { $ne: "hidden" },
    },
    MATCH_REPORT_PROJECTION,
  )
    .sort({ createdAt: -1, _id: -1 })
    .limit(MATCH_CANDIDATE_LIMIT)
    .session(session)
    .exec();

  const ranked = candidates
    .map((candidate) => {
      const recipientId = candidate.reporterId.toString();
      const publicNewReport = toMemberReport(report, recipientId);
      const { score } = scoreReportMatch(
        toSourceInput(candidate),
        toCandidateInput(publicNewReport),
      );
      return { candidate, recipientId, score };
    })
    .filter(({ score }) => score >= MATCH_MINIMUM_SCORE)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.candidate.createdAt.getTime() -
          left.candidate.createdAt.getTime() ||
        right.candidate._id
          .toString()
          .localeCompare(left.candidate._id.toString()),
    )
    .slice(0, MATCH_RESULT_LIMIT);

  const retainedRecipients = new Set<string>();
  return ranked.flatMap(({ candidate, recipientId }) => {
    if (retainedRecipients.has(recipientId)) return [];
    retainedRecipients.add(recipientId);
    return [
      createNotificationPlan({
        kind: "possible_match",
        recipientId,
        reportId: candidate._id.toString(),
        claimId: null,
        eventId: report._id.toString(),
      }),
    ];
  });
}
