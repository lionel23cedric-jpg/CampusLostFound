import type { Metadata } from "next";
import { Suspense } from "react";

import { ClaimListClient } from "@/components/claims/claim-list-client";
import { ClaimantAccessBoundary } from "@/components/claims/claimant-access-boundary";

export const metadata: Metadata = { title: "My claims" };

export default function ClaimsPage() {
  return (
    <main id="main-content">
      <Suspense fallback={<p role="status">Loading claim history</p>}>
        <ClaimantAccessBoundary>
          <ClaimListClient />
        </ClaimantAccessBoundary>
      </Suspense>
    </main>
  );
}
