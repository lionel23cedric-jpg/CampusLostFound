import type { Metadata } from "next";
import { Suspense } from "react";

import { StaffReportListClient } from "@/components/staff-reports/staff-report-list-client";
import {
  StaffAccessBoundary,
  type StaffAccessCopy,
} from "@/components/staff/staff-access-boundary";

export const metadata: Metadata = { title: "Report handling" };

const copy: StaffAccessCopy = {
  checking: "Checking report handling access",
  confirmed: "Report handling access confirmed",
  unavailableHeading: "We could not check your account",
  forbiddenHeading: "Report handling access unavailable",
  forbiddenDescription:
    "Only active staff and administrator accounts can handle reports.",
  workspaceLabel: "Report handling workspace",
};

export default function StaffReportsPage() {
  return (
    <main id="main-content">
      <StaffAccessBoundary copy={copy}>
        <Suspense fallback={<p role="status">Loading report handling</p>}>
          <StaffReportListClient />
        </Suspense>
      </StaffAccessBoundary>
    </main>
  );
}
