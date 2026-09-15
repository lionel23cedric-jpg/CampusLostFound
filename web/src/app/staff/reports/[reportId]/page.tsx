import type { Metadata } from "next";

import { StaffReportDetailClient } from "@/components/staff-reports/staff-report-detail-client";
import {
  StaffAccessBoundary,
  type StaffAccessCopy,
} from "@/components/staff/staff-access-boundary";

export const metadata: Metadata = { title: "Staff report" };

const copy: StaffAccessCopy = {
  checking: "Checking report handling access",
  confirmed: "Report handling access confirmed",
  unavailableHeading: "We could not check your account",
  forbiddenHeading: "Report handling access unavailable",
  forbiddenDescription:
    "Only active staff and administrator accounts can handle reports.",
  workspaceLabel: "Report handling workspace",
};

export default async function StaffReportDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  return (
    <main id="main-content">
      <StaffAccessBoundary copy={copy}>
        <StaffReportDetailClient reportId={reportId} />
      </StaffAccessBoundary>
    </main>
  );
}
