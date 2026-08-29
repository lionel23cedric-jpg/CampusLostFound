import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { deliverNotifications } from "@/lib/notifications/delivery";
import { CampusLocationModel } from "@/models/campus-location";
import { CategoryModel } from "@/models/category";
import {
  ItemReportModel,
  defaultStaffReportHandling,
} from "@/models/item-report";
import { PrivateVerificationDetailsModel } from "@/models/private-verification-details";

import { ReportError } from "./errors";
import { planPossibleMatchNotifications } from "./match-notifications";
import { type OwnerReport, toOwnerReport } from "./public-report";
import type { CreateReportInput } from "./validation";

export async function createReport(
  user: PublicUser,
  input: CreateReportInput,
): Promise<OwnerReport> {
  if (user.status !== "active" || user.role !== "student") {
    throw new ReportError("REPORT_CREATION_FORBIDDEN");
  }

  const database = await connectToDatabase();
  const transaction = await database.startSession();
  let result: OwnerReport | undefined;

  try {
    await transaction.withTransaction(async () => {
      const category = await CategoryModel.findOne(
        { _id: input.categoryId, isActive: true },
        { _id: 1 },
        { session: transaction },
      );
      if (!category) {
        throw new ReportError("CATEGORY_UNAVAILABLE");
      }

      const campusLocation = await CampusLocationModel.findOne(
        { _id: input.campusLocationId, isActive: true },
        { _id: 1 },
        { session: transaction },
      );
      if (!campusLocation) {
        throw new ReportError("CAMPUS_LOCATION_UNAVAILABLE");
      }

      const [report] = await ItemReportModel.create(
        [
          {
            reporterId: user.id,
            reportType: input.reportType,
            title: input.title,
            publicDescription: input.publicDescription,
            categoryId: input.categoryId,
            campusLocationId: input.campusLocationId,
            occurredAt: input.occurredAt,
            colors: input.colors,
            tags: input.tags,
            photoUrls: input.photoUrls,
            privacySettings: input.privacySettings,
            status: "open",
            resolvedAt: null,
            staffHandling: defaultStaffReportHandling(input.reportType),
          },
        ],
        { session: transaction },
      );

      await PrivateVerificationDetailsModel.create(
        [
          {
            reportId: report._id,
            ...input.privateVerification,
          },
        ],
        { session: transaction },
      );

      const notificationPlans = await planPossibleMatchNotifications(
        report,
        transaction,
      );
      await deliverNotifications(notificationPlans, transaction);

      result = toOwnerReport(report);
    });
  } finally {
    await transaction.endSession();
  }

  if (!result) {
    throw new Error("Report transaction did not produce a result");
  }

  return result;
}
