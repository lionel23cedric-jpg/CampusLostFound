import { Types, type QueryFilter } from "mongoose";

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import {
  ItemReportModel,
  normalizeStaffReportHandling,
  type ItemReport,
} from "@/models/item-report";

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
  type StoreReportInput,
  type StaffReportListQuery,
  type VerifyReportInput,
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

async function findVisibleStaffReport(reportId: string) {
  return ItemReportModel.findOne(
    { _id: reportId, moderationStatus: { $ne: "hidden" } },
    STAFF_REPORT_PROJECTION,
  )
    .select("+staffHandling")
    .lean<StaffReportRecord | null>()
    .exec();
}

function requireMutableReport(
  record: StaffReportRecord,
  expectedUpdatedAt: string,
) {
  if (
    (record.status !== "open" && record.status !== "claim_pending") ||
    record.updatedAt.getTime() !== new Date(expectedUpdatedAt).getTime()
  ) {
    throw new StaffReportError("STAFF_REPORT_STATE_CONFLICT");
  }
}

function getHandling(record: StaffReportRecord) {
  try {
    return normalizeStaffReportHandling(record.reportType, record.staffHandling);
  } catch {
    throw new StaffReportError("STAFF_REPORT_STATE_CONFLICT");
  }
}

async function updatedStaffReport(
  filter: QueryFilter<ItemReport>,
  staffHandling: ReturnType<typeof normalizeStaffReportHandling>,
) {
  return ItemReportModel.findOneAndUpdate(
    filter,
    { $set: { staffHandling } },
    { new: true, runValidators: true, projection: STAFF_REPORT_PROJECTION },
  )
    .select("+staffHandling")
    .lean<StaffReportRecord | null>()
    .exec();
}

export async function verifyStaffReport(
  user: PublicUser,
  reportId: string,
  input: VerifyReportInput,
): Promise<StaffReportDetail> {
  requireStaffReportUser(user);
  await connectToDatabase();
  const current = await findVisibleStaffReport(reportId);
  if (!current) throw new StaffReportError("STAFF_REPORT_NOT_FOUND");
  requireMutableReport(current, input.expectedUpdatedAt);
  const handling = getHandling(current);
  if (handling.verificationStatus !== "pending") {
    throw new StaffReportError("STAFF_REPORT_STATE_CONFLICT");
  }

  const actorId = new Types.ObjectId(user.id);
  const verifiedAt = new Date();
  const updated = await updatedStaffReport(
    {
      _id: reportId,
      updatedAt: new Date(input.expectedUpdatedAt),
      reportType: current.reportType,
      moderationStatus: { $ne: "hidden" },
      status: { $in: ["open", "claim_pending"] },
      $or: [
        { "staffHandling.verificationStatus": "pending" },
        { staffHandling: { $exists: false } },
      ],
    },
    {
      verificationStatus: "verified",
      verifiedBy: actorId,
      verifiedAt,
      custodyStatus:
        current.reportType === "found" ? "not_held" : "not_applicable",
      storageLocation: null,
      storedAt: null,
      releasedAt: null,
      updatedBy: actorId,
    },
  );
  if (updated) return toStaffReportDetail(updated);

  const stillVisible = await ItemReportModel.findOne(
    { _id: reportId, moderationStatus: { $ne: "hidden" } },
    { _id: 1 },
  )
    .lean<{ _id: unknown } | null>()
    .exec();
  throw new StaffReportError(
    stillVisible ? "STAFF_REPORT_STATE_CONFLICT" : "STAFF_REPORT_NOT_FOUND",
  );
}

export async function storeStaffReport(
  user: PublicUser,
  reportId: string,
  input: StoreReportInput,
): Promise<StaffReportDetail> {
  requireStaffReportUser(user);
  await connectToDatabase();
  const current = await findVisibleStaffReport(reportId);
  if (!current) throw new StaffReportError("STAFF_REPORT_NOT_FOUND");
  requireMutableReport(current, input.expectedUpdatedAt);
  const handling = getHandling(current);
  if (
    current.reportType !== "found" ||
    handling.verificationStatus !== "verified" ||
    (handling.custodyStatus !== "not_held" &&
      handling.custodyStatus !== "stored")
  ) {
    throw new StaffReportError("STAFF_REPORT_STATE_CONFLICT");
  }

  const updated = await updatedStaffReport(
    {
      _id: reportId,
      updatedAt: new Date(input.expectedUpdatedAt),
      reportType: "found",
      moderationStatus: { $ne: "hidden" },
      status: { $in: ["open", "claim_pending"] },
      "staffHandling.verificationStatus": "verified",
      "staffHandling.custodyStatus": handling.custodyStatus,
    },
    {
      ...handling,
      custodyStatus: "stored",
      storageLocation: input.storageLocation,
      storedAt: handling.storedAt ?? new Date(),
      releasedAt: null,
      updatedBy: new Types.ObjectId(user.id),
    },
  );
  if (!updated) throw new StaffReportError("STAFF_REPORT_STATE_CONFLICT");
  return toStaffReportDetail(updated);
}
