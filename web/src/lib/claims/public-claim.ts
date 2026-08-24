import type { ClaimStatus } from "@/models/claim";
import { REPORT_STATUSES, REPORT_TYPES } from "@/models/item-report";
import { CONTACT_METHODS } from "@/models/profile";

type Identifier = { toString(): string };

export type ClaimViewRecord = {
  _id: Identifier;
  reportId: Identifier;
  claimantId: Identifier;
  status: ClaimStatus;
  verificationQuestionCount: number;
  reviewedBy: Identifier | null;
  reviewedAt: Date | null;
  completedAt: Date | null;
  withdrawnAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StaffClaimRecord = ClaimViewRecord & {
  verificationMatchedCount: number;
};

export type StaffClaimDetailRecord = StaffClaimRecord & {
  reviewNote: string | null;
};

export type ClaimReportRecord = {
  _id: Identifier;
  title: string;
  reportType: (typeof REPORT_TYPES)[number];
  status: (typeof REPORT_STATUSES)[number];
};

export type SafeClaimantRecord = {
  _id: Identifier;
  email: string;
  displayName: string;
  preferredContactMethod: (typeof CONTACT_METHODS)[number];
};

export type ClaimEvidenceRecord = {
  claimId: Identifier;
  responses: Array<{
    questionIndex: number;
    question: string;
    answer: string;
    matched: boolean;
  }>;
};

function toReportSummary(report: ClaimReportRecord) {
  return {
    id: report._id.toString(),
    title: report.title,
    reportType: report.reportType,
    status: report.status,
  };
}

export function toClaimantClaim(
  claim: ClaimViewRecord,
  report: ClaimReportRecord,
) {
  return {
    id: claim._id.toString(),
    report: toReportSummary(report),
    status: claim.status,
    reviewedAt: claim.reviewedAt?.toISOString() ?? null,
    withdrawnAt: claim.withdrawnAt?.toISOString() ?? null,
    completedAt: claim.completedAt?.toISOString() ?? null,
    createdAt: claim.createdAt.toISOString(),
    updatedAt: claim.updatedAt.toISOString(),
  };
}
export type ClaimantClaim = ReturnType<typeof toClaimantClaim>;

export function toStaffClaimSummary(
  claim: StaffClaimRecord,
  report: ClaimReportRecord,
  claimant: SafeClaimantRecord,
) {
  return {
    ...toClaimantClaim(claim, report),
    claimant: {
      id: claimant._id.toString(),
      email: claimant.email,
      displayName: claimant.displayName,
      preferredContactMethod: claimant.preferredContactMethod,
    },
    verification: {
      questionCount: claim.verificationQuestionCount,
      matchedCount: claim.verificationMatchedCount,
    },
    reviewedBy: claim.reviewedBy?.toString() ?? null,
  };
}
export type StaffClaimSummary = ReturnType<typeof toStaffClaimSummary>;

export function toStaffClaimDetail(
  claim: StaffClaimDetailRecord,
  report: ClaimReportRecord,
  claimant: SafeClaimantRecord,
  evidence: ClaimEvidenceRecord,
) {
  return {
    ...toStaffClaimSummary(claim, report, claimant),
    reviewNote: claim.reviewNote,
    responses: evidence.responses.map((response) => ({
      questionIndex: response.questionIndex,
      question: response.question,
      answer: response.answer,
      matched: response.matched,
    })),
  };
}
export type StaffClaimDetail = ReturnType<typeof toStaffClaimDetail>;
