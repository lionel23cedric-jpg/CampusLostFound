import {
  REPORT_STATUSES,
  REPORT_TYPES,
  normalizeReportModerationStatus,
  normalizeStaffReportHandling,
  type ReportModerationStatus,
} from "@/models/item-report";

type Identifier = { toString(): string };

export type StaffReportRecord = {
  _id: Identifier;
  reportType: (typeof REPORT_TYPES)[number];
  title: string;
  publicDescription: string;
  categoryId: Identifier;
  campusLocationId: Identifier;
  occurredAt: Date;
  colors: string[];
  tags: string[];
  photoUrls: string[];
  status: (typeof REPORT_STATUSES)[number];
  moderationStatus?: ReportModerationStatus;
  resolvedAt: Date | null;
  staffHandling?: unknown;
  createdAt: Date;
  updatedAt: Date;
};

function summaryHandling(report: StaffReportRecord) {
  const handling = normalizeStaffReportHandling(
    report.reportType,
    report.staffHandling,
  );
  return {
    verificationStatus: handling.verificationStatus,
    custodyStatus: handling.custodyStatus,
    verifiedAt: handling.verifiedAt?.toISOString() ?? null,
    storedAt: handling.storedAt?.toISOString() ?? null,
    releasedAt: handling.releasedAt?.toISOString() ?? null,
  };
}

export function toStaffReportSummary(report: StaffReportRecord) {
  return {
    id: report._id.toString(),
    reportType: report.reportType,
    title: report.title,
    photoUrls: [...report.photoUrls],
    status: report.status,
    moderationStatus: normalizeReportModerationStatus(report.moderationStatus),
    occurredAt: report.occurredAt.toISOString(),
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
    handling: summaryHandling(report),
  };
}

export type StaffReportSummary = ReturnType<typeof toStaffReportSummary>;

export function toStaffReportDetail(report: StaffReportRecord) {
  const handling = normalizeStaffReportHandling(
    report.reportType,
    report.staffHandling,
  );
  return {
    ...toStaffReportSummary(report),
    publicDescription: report.publicDescription,
    categoryId: report.categoryId.toString(),
    campusLocationId: report.campusLocationId.toString(),
    colors: [...report.colors],
    tags: [...report.tags],
    resolvedAt: report.resolvedAt?.toISOString() ?? null,
    handling: {
      ...summaryHandling(report),
      verifiedBy: handling.verifiedBy?.toString() ?? null,
      storageLocation: handling.storageLocation,
      updatedBy: handling.updatedBy?.toString() ?? null,
    },
  };
}

export type StaffReportDetail = ReturnType<typeof toStaffReportDetail>;
