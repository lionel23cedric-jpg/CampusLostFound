import type { Metadata } from "next";

import { ClaimSubmissionClient } from "@/components/claims/claim-submission-client";
import { ClaimantAccessBoundary } from "@/components/claims/claimant-access-boundary";

export const metadata: Metadata = { title: "Claim an item" };

export default async function ClaimReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main id="main-content">
      <ClaimantAccessBoundary>
        <ClaimSubmissionClient reportId={id} />
      </ClaimantAccessBoundary>
    </main>
  );
}
