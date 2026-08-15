import type { Metadata } from "next";

import { ReportSubmissionClient } from "@/components/reports/report-submission-client";

export const metadata: Metadata = {
  title: "Report an item",
};

export default function NewReportPage() {
  return (
    <main id="main-content">
      <ReportSubmissionClient />
    </main>
  );
}
