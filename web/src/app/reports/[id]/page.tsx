import type { Metadata } from "next";

import { ReportDetailClient } from "@/components/reports/report-detail-client";

export const metadata: Metadata = { title: "Report details" };

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main id="main-content">
      <ReportDetailClient reportId={id} />
    </main>
  );
}
