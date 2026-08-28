import type { QueryFilter } from "mongoose";

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { ItemReportModel, type ItemReport } from "@/models/item-report";

import { requireStaffReportUser } from "./access";
import {
  type StaffReportDetail,
  type StaffReportRecord,
  type StaffReportSummary,
  toStaffReportDetail,
  toStaffReportSummary,
} from "./contracts";
import { StaffReportError } from "./errors";
import {
  STAFF_REPORT_PAGE_SIZE,
  type StaffReportListQuery,
} from "./validation";

const STAFF_REPORT_PROJECTION = {
  _id: 1,
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
  resolvedAt: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

export type StaffReportPage = {
  reports: StaffReportSummary[];
  pagination: {
    page: number;
    pageSize: typeof STAFF_REPORT_PAGE_SIZE;
    total: number;
    totalPages: number;
  };
};

function buildStaffReportFilter(
  query: StaffReportListQuery,
): QueryFilter<ItemReport> {
  const filter: QueryFilter<ItemReport> = {
    moderationStatus: { $ne: "hidden" },
    status: query.reportStatus ?? { $in: ["open", "claim_pending"] },
  };
  if (query.reportType) filter.reportType = query.reportType;

  const legacyClauses: QueryFilter<ItemReport>[] = [];
  if (query.verificationStatus === "pending") {
    legacyClauses.push({
      $or: [
        { "staffHandling.verificationStatus": "pending" },
        { staffHandling: { $exists: false } },
      ],
    });
  } else if (query.verificationStatus === "verified") {
    filter["staffHandling.verificationStatus"] = "verified";
  }

  if (
    query.custodyStatus === "stored" ||
    query.custodyStatus === "released"
  ) {
    filter["staffHandling.custodyStatus"] = query.custodyStatus;
  } else if (query.custodyStatus === "not_applicable") {
    legacyClauses.push({
      $or: [
        { "staffHandling.custodyStatus": "not_applicable" },
        { reportType: "lost", staffHandling: { $exists: false } },
      ],
    });
  } else if (query.custodyStatus === "not_held") {
    legacyClauses.push({
      $or: [
        { "staffHandling.custodyStatus": "not_held" },
        { reportType: "found", staffHandling: { $exists: false } },
      ],
    });
  }

  if (legacyClauses.length === 1) Object.assign(filter, legacyClauses[0]);
  if (legacyClauses.length > 1) filter.$and = legacyClauses;
  return filter;
}

export async function listStaffReports(
  user: PublicUser,
  query: StaffReportListQuery,
): Promise<StaffReportPage> {
  requireStaffReportUser(user);
  await connectToDatabase();
  const filter = buildStaffReportFilter(query);
  const reportsQuery = ItemReportModel.find(filter, STAFF_REPORT_PROJECTION)
    .select("+staffHandling")
    .sort({ createdAt: 1, _id: 1 })
    .skip((query.page - 1) * STAFF_REPORT_PAGE_SIZE)
    .limit(STAFF_REPORT_PAGE_SIZE)
    .lean<StaffReportRecord[]>();
  const [records, total] = await Promise.all([
    reportsQuery.exec(),
    ItemReportModel.countDocuments(filter).exec(),
  ]);

  return {
    reports: records.map(toStaffReportSummary),
    pagination: {
      page: query.page,
      pageSize: STAFF_REPORT_PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / STAFF_REPORT_PAGE_SIZE),
    },
  };
}

export async function getStaffReport(
  user: PublicUser,
  reportId: string,
): Promise<StaffReportDetail> {
  requireStaffReportUser(user);
  await connectToDatabase();
  const record = await ItemReportModel.findOne(
    {
      _id: reportId,
      moderationStatus: { $ne: "hidden" },
      status: { $in: ["open", "claim_pending", "resolved"] },
    },
    STAFF_REPORT_PROJECTION,
  )
    .select("+staffHandling")
    .lean<StaffReportRecord | null>()
    .exec();
  if (!record) throw new StaffReportError("STAFF_REPORT_NOT_FOUND");
  return toStaffReportDetail(record);
}
