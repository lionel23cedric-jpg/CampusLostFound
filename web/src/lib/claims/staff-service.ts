import type { ClientSession } from "mongoose";

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import {
  createNotificationPlan,
  deliverNotifications,
  type NotificationPlan,
} from "@/lib/notifications/delivery";
import { ClaimEvidenceModel } from "@/models/claim-evidence";
import { ClaimModel } from "@/models/claim";
import {
  ItemReportModel,
  normalizeStaffReportHandling,
} from "@/models/item-report";
import { ProfileModel } from "@/models/profile";
import { UserModel } from "@/models/user";

import { ClaimError } from "./errors";
import {
  type ClaimEvidenceRecord,
  type ClaimReportRecord,
  type SafeClaimantRecord,
  type StaffClaimDetail,
  type StaffClaimDetailRecord,
  type StaffClaimRecord,
  type StaffClaimSummary,
  toStaffClaimDetail,
  toStaffClaimSummary,
} from "./public-claim";
import type { ClaimDecisionInput, ClaimListQuery } from "./validation";

const CLAIM_REPORT_PROJECTION = {
  _id: 1,
  reporterId: 1,
  title: 1,
  reportType: 1,
  status: 1,
} as const;
const CLAIM_COMPLETION_REPORT_PROJECTION = {
  _id: 1,
  reportType: 1,
  status: 1,
  updatedAt: 1,
} as const;
const SAFE_USER_PROJECTION = { _id: 1, email: 1 } as const;
const SAFE_PROFILE_PROJECTION = {
  _id: 1,
  userId: 1,
  displayName: 1,
  preferredContactMethod: 1,
} as const;

type SafeUserRow = {
  _id: { toString(): string };
  email: string;
};
type SafeProfileRow = {
  userId: { toString(): string };
  displayName: string;
  preferredContactMethod: "in_app" | "email";
};
type ClaimReportWithOwner = ClaimReportRecord & {
  reporterId: { toString(): string };
};
type CompetingClaimRow = {
  _id: { toString(): string };
  claimantId: { toString(): string };
};
export type StaffClaimPage = {
  claims: StaffClaimSummary[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

function requireStaff(user: PublicUser) {
  if (
    user.status !== "active" ||
    (user.role !== "staff" && user.role !== "administrator")
  ) {
    throw new ClaimError("CLAIM_FORBIDDEN");
  }
}

function safeClaimant(
  user: SafeUserRow,
  profile: SafeProfileRow,
): SafeClaimantRecord {
  return {
    _id: user._id,
    email: user.email,
    displayName: profile.displayName,
    preferredContactMethod: profile.preferredContactMethod,
  };
}

function assertConsistentVerificationCounts(
  claim: {
    verificationQuestionCount: number;
    verificationMatchedCount: number;
  },
) {
  const { verificationQuestionCount, verificationMatchedCount } = claim;
  if (
    !Number.isInteger(verificationQuestionCount) ||
    verificationQuestionCount < 1 ||
    verificationQuestionCount > 5 ||
    !Number.isInteger(verificationMatchedCount) ||
    verificationMatchedCount < 0 ||
    verificationMatchedCount > verificationQuestionCount
  ) {
    throw new Error("Claim verification counts are inconsistent");
  }
}

async function loadStaffDetailRecords(
  claimId: string,
  session?: ClientSession,
) {
  const claim = await ClaimModel.findById(claimId)
    .select("+verificationMatchedCount +reviewNote")
    .session(session ?? null)
    .lean<StaffClaimDetailRecord | null>()
    .exec();
  if (!claim) throw new ClaimError("CLAIM_NOT_FOUND");

  const report = await ItemReportModel.findById(
    claim.reportId.toString(),
    CLAIM_REPORT_PROJECTION,
  )
    .session(session ?? null)
    .lean<ClaimReportWithOwner | null>()
    .exec();
  const user = await UserModel.findById(
    claim.claimantId.toString(),
    SAFE_USER_PROJECTION,
  )
    .session(session ?? null)
    .lean<SafeUserRow | null>()
    .exec();
  const profile = await ProfileModel.findOne(
    { userId: claim.claimantId.toString() },
    SAFE_PROFILE_PROJECTION,
  )
    .session(session ?? null)
    .lean<SafeProfileRow | null>()
    .exec();
  const evidence = await ClaimEvidenceModel.findOne({ claimId })
    .select("+responses.answer +responses.matched")
    .session(session ?? null)
    .lean<ClaimEvidenceRecord | null>()
    .exec();

  if (!report || !user || !profile || !evidence) {
    throw new Error("Claim review data is incomplete");
  }
  return {
    claim,
    report,
    claimant: safeClaimant(user, profile),
    evidence,
  };
}

export async function listStaffClaims(
  user: PublicUser,
  query: ClaimListQuery,
): Promise<StaffClaimPage> {
  requireStaff(user);
  await connectToDatabase();

  const status = query.status ?? "pending";
  const filter = { status };
  const claimsQuery = ClaimModel.find(filter)
    .select("+verificationMatchedCount")
    .sort(
      status === "pending"
        ? { createdAt: 1, _id: 1 }
        : { createdAt: -1, _id: -1 },
    )
    .skip((query.page - 1) * query.pageSize)
    .limit(query.pageSize)
    .lean<StaffClaimRecord[]>();
  const [claims, total] = await Promise.all([
    claimsQuery.exec(),
    ClaimModel.countDocuments(filter).exec(),
  ]);
  const reportIds = claims.map(({ reportId }) => reportId);
  const claimantIds = claims.map(({ claimantId }) => claimantId);
  const claimantIdStrings = claimantIds.map((id) => id.toString());
  const [reports, users, profiles] = await Promise.all([
    ItemReportModel.find(
      { _id: { $in: reportIds } },
      CLAIM_REPORT_PROJECTION,
    )
      .lean<ClaimReportWithOwner[]>()
      .exec(),
    UserModel.find(
      { _id: { $in: claimantIdStrings } },
      SAFE_USER_PROJECTION,
    )
      .lean<SafeUserRow[]>()
      .exec(),
    ProfileModel.find(
      { userId: { $in: claimantIdStrings } },
      SAFE_PROFILE_PROJECTION,
    )
      .lean<SafeProfileRow[]>()
      .exec(),
  ]);

  const reportMap = new Map(
    reports.map((record) => [record._id.toString(), record]),
  );
  const userMap = new Map(
    users.map((record) => [record._id.toString(), record]),
  );
  const profileMap = new Map(
    profiles.map((record) => [record.userId.toString(), record]),
  );

  return {
    claims: claims.map((claim) => {
      const claimantId = claim.claimantId.toString();
      const report = reportMap.get(claim.reportId.toString());
      const account = userMap.get(claimantId);
      const profile = profileMap.get(claimantId);
      if (!report || !account || !profile) {
        throw new Error("Claim review data is incomplete");
      }
      return toStaffClaimSummary(
        claim,
        report,
        safeClaimant(account, profile),
      );
    }),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

export async function getStaffClaim(user: PublicUser, claimId: string) {
  requireStaff(user);
  await connectToDatabase();
  const records = await loadStaffDetailRecords(claimId);
  return toStaffClaimDetail(
    records.claim,
    records.report,
    records.claimant,
    records.evidence,
  );
}

export async function decideClaim(
  user: PublicUser,
  claimId: string,
  input: ClaimDecisionInput,
) {
  requireStaff(user);
  const database = await connectToDatabase();
  const transaction = await database.startSession();
  let result: StaffClaimDetail | undefined;

  try {
    await transaction.withTransaction(async () => {
      const current = await ClaimModel.findById(claimId)
        .select("+verificationMatchedCount")
        .session(transaction)
        .exec();
      if (!current) throw new ClaimError("CLAIM_NOT_FOUND");
      if (current.status !== "pending") {
        throw new ClaimError("CLAIM_STATE_CONFLICT");
      }

      const plans: NotificationPlan[] = [];
      const now = new Date();
      const nextStatus =
        input.decision === "approve" ? "approved" : "rejected";

      if (input.decision === "approve") {
        assertConsistentVerificationCounts(current);
        if (
          typeof current.activeClaimKey !== "string" ||
          current.activeClaimKey.length === 0
        ) {
          throw new Error("Claim active key is inconsistent");
        }
        const report = await ItemReportModel.findOneAndUpdate(
          { _id: current.reportId, status: "open" },
          { $set: { status: "claim_pending", resolvedAt: null } },
          { returnDocument: "after", session: transaction },
        ).exec();
        if (!report) throw new ClaimError("CLAIM_STATE_CONFLICT");

        const updated = await ClaimModel.findOneAndUpdate(
          { _id: claimId, status: "pending" },
          {
            $set: {
              status: nextStatus,
              activeClaimKey: current.activeClaimKey,
              reviewedBy: user.id,
              reviewedAt: now,
              reviewNote: input.reviewNote,
            },
          },
          { returnDocument: "after", session: transaction },
        ).exec();
        if (!updated) throw new ClaimError("CLAIM_STATE_CONFLICT");

        const competing = await ClaimModel.find(
          {
            reportId: current.reportId,
            _id: { $ne: current._id },
            status: "pending",
          },
          { _id: 1, claimantId: 1 },
        )
          .session(transaction)
          .lean<CompetingClaimRow[]>()
          .exec();

        if (competing.length > 0) {
          const rejected = await ClaimModel.updateMany(
            {
              _id: { $in: competing.map(({ _id }) => _id) },
              status: "pending",
            },
            {
              $set: {
                status: "rejected",
                activeClaimKey: null,
                reviewedBy: user.id,
                reviewedAt: now,
                reviewNote: null,
              },
            },
            { session: transaction },
          );
          if (rejected.modifiedCount !== competing.length) {
            throw new ClaimError("CLAIM_STATE_CONFLICT");
          }
        }

        plans.push(
          createNotificationPlan({
            kind: "claim_approved",
            recipientId: current.claimantId.toString(),
            reportId: current.reportId.toString(),
            claimId: current._id.toString(),
          }),
          createNotificationPlan({
            kind: "claim_handover_ready",
            recipientId: current.claimantId.toString(),
            reportId: current.reportId.toString(),
            claimId: current._id.toString(),
          }),
          ...competing.map((claim) =>
            createNotificationPlan({
              kind: "claim_rejected",
              recipientId: claim.claimantId.toString(),
              reportId: current.reportId.toString(),
              claimId: claim._id.toString(),
            }),
          ),
        );
      } else {
        const updated = await ClaimModel.findOneAndUpdate(
          { _id: claimId, status: "pending" },
          {
            $set: {
              status: nextStatus,
              activeClaimKey: null,
              reviewedBy: user.id,
              reviewedAt: now,
              reviewNote: input.reviewNote,
            },
          },
          { returnDocument: "after", session: transaction },
        ).exec();
        if (!updated) throw new ClaimError("CLAIM_STATE_CONFLICT");

        plans.push(
          createNotificationPlan({
            kind: "claim_rejected",
            recipientId: current.claimantId.toString(),
            reportId: current.reportId.toString(),
            claimId: current._id.toString(),
          }),
        );
      }

      await deliverNotifications(plans, transaction);
      const records = await loadStaffDetailRecords(claimId, transaction);
      result = toStaffClaimDetail(
        records.claim,
        records.report,
        records.claimant,
        records.evidence,
      );
    });
  } finally {
    await transaction.endSession();
  }

  if (!result) throw new Error("Claim decision did not produce a result");
  return result;
}

export async function completeClaim(user: PublicUser, claimId: string) {
  requireStaff(user);
  const database = await connectToDatabase();
  const transaction = await database.startSession();
  let result: StaffClaimDetail | undefined;

  try {
    await transaction.withTransaction(async () => {
      const current = await ClaimModel.findById(claimId)
        .session(transaction)
        .exec();
      if (!current) throw new ClaimError("CLAIM_NOT_FOUND");
      if (current.status !== "approved") {
        throw new ClaimError("CLAIM_STATE_CONFLICT");
      }

      const now = new Date();
      const currentReport = await ItemReportModel.findOne(
        { _id: current.reportId, status: "claim_pending" },
        CLAIM_COMPLETION_REPORT_PROJECTION,
      )
        .select("+staffHandling")
        .session(transaction)
        .lean<{
          reportType: "lost" | "found";
          updatedAt: Date;
          staffHandling?: unknown;
        } | null>()
        .exec();
      if (!currentReport) throw new ClaimError("CLAIM_STATE_CONFLICT");

      let handling;
      try {
        handling = normalizeStaffReportHandling(
          currentReport.reportType,
          currentReport.staffHandling,
        );
      } catch {
        throw new ClaimError("CLAIM_STATE_CONFLICT");
      }

      const reportFilter: Record<string, unknown> = {
        _id: current.reportId,
        status: "claim_pending",
        updatedAt: currentReport.updatedAt,
      };
      if (currentReport.staffHandling === undefined) {
        reportFilter.staffHandling = { $exists: false };
      } else {
        reportFilter["staffHandling.custodyStatus"] = handling.custodyStatus;
      }

      const reportChanges: Record<string, unknown> = {
        status: "resolved",
        resolvedAt: now,
      };
      if (
        currentReport.reportType === "found" &&
        handling.custodyStatus === "stored"
      ) {
        reportChanges["staffHandling.custodyStatus"] = "released";
        reportChanges["staffHandling.releasedAt"] = now;
        reportChanges["staffHandling.updatedBy"] = user.id;
      }

      const report = await ItemReportModel.findOneAndUpdate(
        reportFilter,
        { $set: reportChanges },
        { returnDocument: "after", runValidators: true, session: transaction },
      ).exec();
      if (!report) throw new ClaimError("CLAIM_STATE_CONFLICT");

      const updated = await ClaimModel.findOneAndUpdate(
        { _id: claimId, status: "approved" },
        {
          $set: {
            status: "completed",
            activeClaimKey: null,
            completedAt: now,
          },
        },
        { returnDocument: "after", session: transaction },
      ).exec();
      if (!updated) throw new ClaimError("CLAIM_STATE_CONFLICT");

      await deliverNotifications(
        [
          createNotificationPlan({
            kind: "claim_completed",
            recipientId: current.claimantId.toString(),
            reportId: current.reportId.toString(),
            claimId: current._id.toString(),
          }),
          createNotificationPlan({
            kind: "report_recovered",
            recipientId: report.reporterId.toString(),
            reportId: report._id.toString(),
            claimId: current._id.toString(),
          }),
        ],
        transaction,
      );

      const records = await loadStaffDetailRecords(claimId, transaction);
      result = toStaffClaimDetail(
        records.claim,
        records.report,
        records.claimant,
        records.evidence,
      );
    });
  } finally {
    await transaction.endSession();
  }

  if (!result) throw new Error("Claim completion did not produce a result");
  return result;
}
