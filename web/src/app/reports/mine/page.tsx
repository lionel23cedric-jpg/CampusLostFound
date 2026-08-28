import { Suspense } from "react";
import type { Metadata } from "next";

import { OwnerReportHistory } from "@/components/reports/owner-report-history";

export const metadata: Metadata = { title: "My reports" };

export default function OwnReportsPage() {
  return (
    <main id="main-content">
      <Suspense fallback={<p role="status">Loading your report history</p>}>
        <OwnerReportHistory />
      </Suspense>
    </main>
  );
}
