import type { HydratedDocument } from "mongoose";

import type { ItemReport } from "@/models/item-report";

type ReportDocument = HydratedDocument<ItemReport> & {
  createdAt: Date;
  updatedAt: Date;
};

export function toOwnerReport(report: ReportDocument) {
  return {
    id: report._id.toString(),
    reporterId: report.reporterId.toString(),
    reportType: report.reportType,
    title: report.title,
    publicDescription: report.publicDescription,
    categoryId: report.categoryId.toString(),
    campusLocationId: report.campusLocationId.toString(),
    occurredAt: report.occurredAt.toISOString(),
    colors: [...report.colors],
    tags: [...report.tags],
    photoUrls: [...report.photoUrls],
    status: report.status,
    privacySettings: {
      showPhoto: report.privacySettings.showPhoto,
      showEventDate: report.privacySettings.showEventDate,
      showCampusLocation: report.privacySettings.showCampusLocation,
    },
    resolvedAt: report.resolvedAt?.toISOString() ?? null,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  };
}

export type OwnerReport = ReturnType<typeof toOwnerReport>;
