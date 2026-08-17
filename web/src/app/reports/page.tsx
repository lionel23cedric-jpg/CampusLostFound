import { Suspense } from "react";
import type { Metadata } from "next";

import { ReportBrowser } from "@/components/reports/report-browser";

export const metadata: Metadata = { title: "Browse reports" };

export default function ReportsPage() {
  return (
    <main id="main-content">
      <Suspense fallback={<p role="status">Loading report search</p>}>
        <ReportBrowser />
      </Suspense>
    </main>
  );
}
