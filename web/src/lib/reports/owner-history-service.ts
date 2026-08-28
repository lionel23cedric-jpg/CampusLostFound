import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { ItemReportModel } from "@/models/item-report";

import {
  OWNER_REPORT_HISTORY_PAGE_SIZE,
  type OwnerReportHistoryQuery,
} from "./owner-history-validation";
import { type OwnerReport, toOwnerReport } from "./public-report";

const OWNER_REPORT_PROJECTION = {
  _id: 1,
  reporterId: 1,
  reportType: 1,
  title: 1,
  publicDescription: 1,
  categoryId: 1,
  campusLocationId: 1,
  occurredAt: 1,
  colors: 1,
  tags: 1,
  photoUrls: 1,
  status: 1,
  moderationStatus: 1,
  privacySettings: 1,
  resolvedAt: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

export type OwnerReportHistoryPage = {
  reports: OwnerReport[];
  pagination: {
    page: number;
    pageSize: typeof OWNER_REPORT_HISTORY_PAGE_SIZE;
    total: number;
    totalPages: number;
  };
};

export async function listOwnReports(
  user: PublicUser,
  query: OwnerReportHistoryQuery,
): Promise<OwnerReportHistoryPage> {
  await connectToDatabase();
  const filter = {
    reporterId: user.id,
    ...(query.reportType ? { reportType: query.reportType } : {}),
    ...(query.status ? { status: query.status } : {}),
  };
  const reportsQuery = ItemReportModel.find(filter, OWNER_REPORT_PROJECTION)
    .sort({ createdAt: -1, _id: -1 })
    .skip((query.page - 1) * OWNER_REPORT_HISTORY_PAGE_SIZE)
    .limit(OWNER_REPORT_HISTORY_PAGE_SIZE);
  const [documents, total] = await Promise.all([
    reportsQuery.exec(),
    ItemReportModel.countDocuments(filter).exec(),
  ]);

  return {
    reports: documents.map((report) => toOwnerReport(report)),
    pagination: {
      page: query.page,
      pageSize: OWNER_REPORT_HISTORY_PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / OWNER_REPORT_HISTORY_PAGE_SIZE),
    },
  };
}
