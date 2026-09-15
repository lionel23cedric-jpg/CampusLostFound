import type { PipelineStage } from "mongoose";

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { ClaimModel } from "@/models/claim";
import { ItemReportModel } from "@/models/item-report";
import { UserModel } from "@/models/user";

import { AdminOverviewError } from "./errors";
import {
  buildAdministratorOverview,
  parseAccountAggregate,
  parseClaimAggregate,
  parseReportAggregate,
  type AdministratorOverview,
} from "./overview-contract";

const submittedStatuses = ["open", "claim_pending", "resolved", "closed"];

// One report aggregation defines submitted volume and recovery outcomes.
// Draft records are deliberately excluded from administrator statistics.
const reportPipeline: PipelineStage[] = [
  {
    $group: {
      _id: null,
      submittedLost: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: ["$reportType", "lost"] },
                { $in: ["$status", submittedStatuses] },
              ],
            },
            1,
            0,
          ],
        },
      },
      submittedFound: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: ["$reportType", "found"] },
                { $in: ["$status", submittedStatuses] },
              ],
            },
            1,
            0,
          ],
        },
      },
      unresolved: {
        $sum: {
          $cond: [{ $in: ["$status", ["open", "claim_pending"]] }, 1, 0],
        },
      },
      recovered: {
        $sum: {
          $cond: [{ $eq: ["$status", "resolved"] }, 1, 0],
        },
      },
    },
  },
];

// A report is counted as matched once staff have approved or completed at
// least one Claim. $addToSet prevents duplicate Claims inflating the metric.
const claimPipeline: PipelineStage[] = [
  {
    $group: {
      _id: null,
      pending: {
        $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
      },
      approved: {
        $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] },
      },
      rejected: {
        $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] },
      },
      withdrawn: {
        $sum: { $cond: [{ $eq: ["$status", "withdrawn"] }, 1, 0] },
      },
      completed: {
        $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
      },
      matchedReportIds: {
        $addToSet: {
          $cond: [
            { $in: ["$status", ["approved", "completed"]] },
            "$reportId",
            null,
          ],
        },
      },
    },
  },
  {
    $project: {
      _id: 1,
      pending: 1,
      approved: 1,
      rejected: 1,
      withdrawn: 1,
      completed: 1,
      matched: {
        $size: { $setDifference: ["$matchedReportIds", [null]] },
      },
    },
  },
];

// Account totals describe current access states, not user activity or roles.
const accountPipeline: PipelineStage[] = [
  {
    $group: {
      _id: null,
      active: {
        $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
      },
      suspended: {
        $sum: { $cond: [{ $eq: ["$status", "suspended"] }, 1, 0] },
      },
      deactivated: {
        $sum: { $cond: [{ $eq: ["$status", "deactivated"] }, 1, 0] },
      },
    },
  },
];

export function requireAdministrator(user: PublicUser) {
  if (user.status !== "active" || user.role !== "administrator") {
    throw new AdminOverviewError("ADMINISTRATOR_REQUIRED");
  }
}

export async function getAdministratorOverview(
  user: PublicUser,
): Promise<AdministratorOverview> {
  requireAdministrator(user);
  await connectToDatabase();

  // These aggregates are independent, so running them together reduces
  // dashboard latency without weakening any count definition.
  const [reportRows, claimRows, accountRows] = await Promise.all([
    ItemReportModel.aggregate(reportPipeline).exec(),
    ClaimModel.aggregate(claimPipeline).exec(),
    UserModel.aggregate(accountPipeline).exec(),
  ]);

  return buildAdministratorOverview(
    new Date().toISOString(),
    parseReportAggregate(reportRows),
    parseClaimAggregate(claimRows),
    parseAccountAggregate(accountRows),
  );
}
