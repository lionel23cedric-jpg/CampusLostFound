import { Types } from "mongoose";

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { MEMBER_REPORT_STATUSES } from "@/lib/reports/browse-validation";
import { ItemReportModel } from "@/models/item-report";
import { ReportFlagModel } from "@/models/report-flag";

import { requireModerationMember } from "./access";
import {
  toReportFlagReceipt,
  type ReportFlagReceipt,
  type ReportFlagRecord,
} from "./contracts";
import {
  ModerationError,
  isPendingReportFlagDuplicate,
} from "./errors";
import type { SubmitReportFlagInput } from "./validation";

export async function submitReportFlag(
  member: PublicUser,
  reportId: string,
  input: SubmitReportFlagInput,
): Promise<ReportFlagReceipt> {
  requireModerationMember(member);

  try {
    await connectToDatabase();
    const report = await ItemReportModel.findOne(
      {
        _id: new Types.ObjectId(reportId),
        status: { $in: [...MEMBER_REPORT_STATUSES] },
        moderationStatus: { $ne: "hidden" },
      },
      { _id: 1, reporterId: 1 },
    ).exec();
    if (!report) throw new ModerationError("REPORT_NOT_FOUND");
    if (report.reporterId.toString() === member.id) {
      throw new ModerationError("REPORT_FLAG_FORBIDDEN");
    }

    const flag = await ReportFlagModel.create({
      reportId: report._id,
      submittedByUserId: new Types.ObjectId(member.id),
      reason: input.reason,
      details: input.details,
      status: "pending",
    });
    return toReportFlagReceipt(flag as unknown as ReportFlagRecord);
  } catch (error) {
    if (error instanceof ModerationError) throw error;
    if (isPendingReportFlagDuplicate(error)) {
      throw new ModerationError("REPORT_FLAG_ALREADY_PENDING");
    }
    throw new ModerationError("REPORT_MODERATION_FAILED");
  }
}
