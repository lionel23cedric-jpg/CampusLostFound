import type { Metadata } from "next";
import { Suspense } from "react";

import { StaffClaimAccessBoundary } from "@/components/claims/staff-claim-access-boundary";
import { StaffClaimListClient } from "@/components/claims/staff-claim-list-client";

export const metadata: Metadata = { title: "Claim reviews" };

export default function StaffClaimsPage() {
  return (
    <main id="main-content">
      <StaffClaimAccessBoundary>
        <Suspense fallback={<p role="status">Loading Claim reviews</p>}>
          <StaffClaimListClient />
        </Suspense>
      </StaffClaimAccessBoundary>
    </main>
  );
}
