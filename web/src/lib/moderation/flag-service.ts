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
    // Members use Claims for their own listings; the flag tool is for reporting
    // another member's content to administrators.
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
    // Creating a flag only enters the review queue. It does not hide the report.
    return toReportFlagReceipt(flag as unknown as ReportFlagRecord);
  } catch (error) {
    if (error instanceof ModerationError) throw error;
    if (isPendingReportFlagDuplicate(error)) {
      // A partial unique index permits only one pending flag per member/report pair.
      throw new ModerationError("REPORT_FLAG_ALREADY_PENDING");
    }
    throw new ModerationError("REPORT_MODERATION_FAILED");
  }
}
