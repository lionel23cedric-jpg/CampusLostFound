import type { Metadata } from "next";

import { ClaimDetailClient } from "@/components/claims/claim-detail-client";
import { ClaimantAccessBoundary } from "@/components/claims/claimant-access-boundary";

export const metadata: Metadata = { title: "Claim details" };

export default async function ClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main id="main-content">
      <ClaimantAccessBoundary>
        <ClaimDetailClient claimId={id} />
      </ClaimantAccessBoundary>
    </main>
  );
}
