import type { Metadata } from "next";

import { ReportDetailClient } from "@/components/reports/report-detail-client";

export const metadata: Metadata = { title: "Report details" };

export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ returnTo?: string | string[] }>;
}) {
  const { id } = await params;
  const returnTo = (await searchParams)?.returnTo;
  return (
    <main id="main-content">
      <ReportDetailClient
        reportId={id}
        fromNotifications={returnTo === "/notifications"}
      />
    </main>
  );
}
