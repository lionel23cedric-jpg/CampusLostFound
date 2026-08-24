import type { Metadata } from "next";

import { StaffClaimAccessBoundary } from "@/components/claims/staff-claim-access-boundary";
import { StaffClaimDetailClient } from "@/components/claims/staff-claim-detail-client";

export const metadata: Metadata = { title: "Claim review" };

export default async function StaffClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <main id="main-content">
      <StaffClaimAccessBoundary>
        <StaffClaimDetailClient claimId={id} />
      </StaffClaimAccessBoundary>
    </main>
  );
}
