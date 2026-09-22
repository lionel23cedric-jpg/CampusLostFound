import type { ClientSession } from "mongoose";

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import {
  createNotificationPlan,
  deliverNotifications,
} from "@/lib/notifications/delivery";
import { ClaimEvidenceModel } from "@/models/claim-evidence";
import { ClaimModel } from "@/models/claim";
import { ItemReportModel } from "@/models/item-report";
import { PrivateVerificationDetailsModel } from "@/models/private-verification-details";

import { ClaimError } from "./errors";
import {
  type ClaimantClaim,
  type ClaimReportRecord,
  type ClaimViewRecord,
  toClaimantClaim,
} from "./public-claim";
import type { ClaimListQuery, CreateClaimInput } from "./validation";
import { matchesVerificationAnswer } from "./verification";

const CLAIM_REPORT_PROJECTION = {
  _id: 1,
  reporterId: 1,
  title: 1,
  reportType: 1,
  status: 1,
} as const;
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

type ClaimReportWithOwner = ClaimReportRecord & {
  reporterId: { toString(): string };
};

function requireStudent(user: PublicUser) {
  if (user.status !== "active" || user.role !== "student") {
    throw new ClaimError("CLAIM_FORBIDDEN");
  }
}

function activeClaimKey(reportId: string, claimantId: string) {
  const canonical = (value: string) =>
    OBJECT_ID_PATTERN.test(value) ? value.toLowerCase() : value;
  return `${canonical(reportId)}:${canonical(claimantId)}`;
}

function isActiveClaimDuplicate(error: unknown): error is {
  code: 11000;
  keyPattern: { activeClaimKey: 1 };
} {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000 &&
    "keyPattern" in error &&
    typeof error.keyPattern === "object" &&
    error.keyPattern !== null &&
    "activeClaimKey" in error.keyPattern &&
    error.keyPattern.activeClaimKey === 1
  );
}

async function loadReport(
  reportId: { toString(): string },
  session?: ClientSession,
) {
  return ItemReportModel.findById(reportId, CLAIM_REPORT_PROJECTION, {
    session,
  })
    .lean<ClaimReportWithOwner | null>()
    .exec();
}

export async function getClaimQuestions(user: PublicUser, reportId: string) {
  requireStudent(user);
  await connectToDatabase();

  const report = await ItemReportModel.findOne(
    {
      _id: reportId,
      reportType: "found",
      status: "open",
      reporterId: { $ne: user.id },
      moderationStatus: { $ne: "hidden" },
    },
    CLAIM_REPORT_PROJECTION,
  )
    .lean<ClaimReportRecord | null>()
    .exec();
  if (!report) throw new ClaimError("REPORT_NOT_CLAIMABLE");

  const key = activeClaimKey(reportId, user.id);
  if (await ClaimModel.exists({ activeClaimKey: key }).exec()) {
    throw new ClaimError("CLAIM_ALREADY_EXISTS");
  }

  const verification = await PrivateVerificationDetailsModel.findOne(
    { reportId },
    { "verificationQuestions.question": 1 },
  )
    .lean<{ verificationQuestions: Array<{ question: string }> } | null>()
    .exec();
  const questions = verification?.verificationQuestions ?? [];
  if (questions.length < 1 || questions.length > 5) {
    throw new ClaimError("REPORT_NOT_CLAIMABLE");
  }

  return {
    report: {
      id: report._id.toString(),
      title: report.title,
      reportType: "found" as const,
    },
    questions: questions.map(({ question }, questionIndex) => ({
      questionIndex,
      question,
    })),
  };
}

export type ClaimQuestions = Awaited<ReturnType<typeof getClaimQuestions>>;

export async function createClaim(
  user: PublicUser,
  reportId: string,
  input: CreateClaimInput,
) {
  requireStudent(user);
  const database = await connectToDatabase();
  const transaction = await database.startSession();
  let result: ClaimantClaim | undefined;

  try {
    await transaction.withTransaction(async () => {
      const report = await ItemReportModel.findOneAndUpdate(
        {
          _id: reportId,
          reportType: "found",
          status: "open",
          reporterId: { $ne: user.id },
          moderationStatus: { $ne: "hidden" },
        },
        { $set: { status: "open" } },
        {
          returnDocument: "after",
          session: transaction,
          projection: CLAIM_REPORT_PROJECTION,
        },
      ).exec();
      if (!report) throw new ClaimError("REPORT_NOT_CLAIMABLE");
      const reportWithOwner =
        report as unknown as ClaimReportWithOwner;

      const key = activeClaimKey(reportId, user.id);
      if (
        await ClaimModel.exists({ activeClaimKey: key })
          .session(transaction)
          .exec()
      ) {
        throw new ClaimError("CLAIM_ALREADY_EXISTS");
      }

      const verification = await PrivateVerificationDetailsModel.findOne({
        reportId,
      })
        .select("+verificationQuestions.expectedAnswer")
        .session(transaction)
        .exec();
      const questions = verification?.verificationQuestions ?? [];
      if (questions.length < 1 || questions.length > 5) {
        throw new ClaimError("REPORT_NOT_CLAIMABLE");
      }
      if (questions.length !== input.responses.length) {
        throw new ClaimError("VALIDATION_ERROR");
      }

      const submitted = new Map(
        input.responses.map((entry) => [entry.questionIndex, entry.answer]),
      );
      const responses = questions.map((question, questionIndex) => {
        const answer = submitted.get(questionIndex);
        if (answer === undefined) throw new ClaimError("VALIDATION_ERROR");
        return {
          questionIndex,
          question: question.question,
          answer,
          matched: matchesVerificationAnswer(
            question.expectedAnswer,
            answer,
          ),
        };
      });

      const [claim] = await ClaimModel.create(
        [
          {
            reportId,
            claimantId: user.id,
            status: "pending",
            activeClaimKey: key,
            verificationQuestionCount: responses.length,
            verificationMatchedCount: responses.filter(
              ({ matched }) => matched,
            ).length,
          },
        ],
        { session: transaction },
      );
      await ClaimEvidenceModel.create(
        [{ claimId: claim._id, responses }],
        { session: transaction },
      );
      await deliverNotifications(
        [
          createNotificationPlan({
            kind: "claim_received",
            recipientId: reportWithOwner.reporterId.toString(),
            reportId: reportWithOwner._id.toString(),
            claimId: claim._id.toString(),
          }),
        ],
        transaction,
      );
      result = toClaimantClaim(
        claim as unknown as ClaimViewRecord,
        reportWithOwner,
      );
    });
  } catch (error) {
    if (isActiveClaimDuplicate(error)) {
      throw new ClaimError("CLAIM_ALREADY_EXISTS");
    }
    throw error;
  } finally {
    await transaction.endSession();
  }

  if (!result) throw new Error("Claim transaction did not produce a result");
  return result;
}

export type ClaimPage = {
  claims: ClaimantClaim[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

async function loadReportMap(claims: ClaimViewRecord[]) {
  const reports = await ItemReportModel.find(
    { _id: { $in: claims.map(({ reportId }) => reportId) } },
    CLAIM_REPORT_PROJECTION,
  )
    .lean<ClaimReportRecord[]>()
    .exec();
  return new Map(
    reports.map((report) => [report._id.toString(), report]),
  );
}

export async function listOwnClaims(
  user: PublicUser,
  query: ClaimListQuery,
): Promise<ClaimPage> {
  requireStudent(user);
  await connectToDatabase();

  const filter = {
    claimantId: user.id,
    ...(query.status ? { status: query.status } : {}),
  };
  const claimsQuery = ClaimModel.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip((query.page - 1) * query.pageSize)
    .limit(query.pageSize)
    .lean<ClaimViewRecord[]>();
  const [claims, total] = await Promise.all([
    claimsQuery.exec(),
    ClaimModel.countDocuments(filter).exec(),
  ]);
  const reports = await loadReportMap(claims);

  return {
    claims: claims.map((claim) => {
      const report = reports.get(claim.reportId.toString());
      if (!report) throw new Error("Claim report is missing");
      return toClaimantClaim(claim, report);
    }),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

export async function getOwnClaim(user: PublicUser, claimId: string) {
  requireStudent(user);
  await connectToDatabase();

  const claim = await ClaimModel.findOne({
    _id: claimId,
    claimantId: user.id,
  })
    .lean<ClaimViewRecord | null>()
    .exec();
  if (!claim) throw new ClaimError("CLAIM_NOT_FOUND");

  const report = await loadReport(claim.reportId);
  if (!report) throw new Error("Claim report is missing");
  return toClaimantClaim(claim, report);
}

export async function withdrawOwnClaim(
  user: PublicUser,
  claimId: string,
) {
  requireStudent(user);
  const database = await connectToDatabase();
  const transaction = await database.startSession();
  let result: ClaimantClaim | undefined;

  try {
    await transaction.withTransaction(async () => {
      const current = await ClaimModel.findOne({
        _id: claimId,
        claimantId: user.id,
      })
        .session(transaction)
        .exec();
      if (!current) throw new ClaimError("CLAIM_NOT_FOUND");
      if (current.status !== "pending" && current.status !== "approved") {
        throw new ClaimError("CLAIM_STATE_CONFLICT");
      }

      if (current.status === "approved") {
        const report = await ItemReportModel.findOneAndUpdate(
          { _id: current.reportId, status: "claim_pending" },
          { $set: { status: "open", resolvedAt: null } },
          {
            returnDocument: "after",
            session: transaction,
            projection: CLAIM_REPORT_PROJECTION,
          },
        ).exec();
        if (!report) throw new ClaimError("CLAIM_STATE_CONFLICT");
      }

      const updated = await ClaimModel.findOneAndUpdate(
        { _id: claimId, claimantId: user.id, status: current.status },
        {
          $set: {
            status: "withdrawn",
            activeClaimKey: null,
            withdrawnAt: new Date(),
          },
        },
        { returnDocument: "after", session: transaction },
      ).exec();
      if (!updated) throw new ClaimError("CLAIM_STATE_CONFLICT");

      const report = await loadReport(updated.reportId, transaction);
      if (!report) throw new Error("Claim report is missing");
      await deliverNotifications(
        [
          createNotificationPlan({
            kind: "claim_withdrawn",
            recipientId: report.reporterId.toString(),
            reportId: report._id.toString(),
            claimId: updated._id.toString(),
          }),
        ],
        transaction,
      );
      result = toClaimantClaim(
        updated as unknown as ClaimViewRecord,
        report,
      );
    });
  } finally {
    await transaction.endSession();
  }

  if (!result) throw new Error("Claim withdrawal did not produce a result");
  return result;
}
