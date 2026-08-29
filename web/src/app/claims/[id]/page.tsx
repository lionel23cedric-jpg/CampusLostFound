import type { Metadata } from "next";

import { ClaimDetailClient } from "@/components/claims/claim-detail-client";
import { ClaimantAccessBoundary } from "@/components/claims/claimant-access-boundary";

export const metadata: Metadata = { title: "Claim details" };

export default async function ClaimDetailPage({
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
      <ClaimantAccessBoundary>
        <ClaimDetailClient
          claimId={id}
          fromNotifications={returnTo === "/notifications"}
        />
      </ClaimantAccessBoundary>
    </main>
  );
}
