import type { Metadata } from "next";

import { AdminReferenceDataClient } from "@/components/admin/admin-reference-data-client";
import { AdministratorAccessBoundary } from "@/components/admin/administrator-access-boundary";

export const metadata: Metadata = { title: "Manage reference data" };

export default function AdminReferenceDataPage() {
  return (
    <main id="main-content">
      <AdministratorAccessBoundary
        workspaceLabel="Administrator reference data management workspace"
        forbiddenDescription="Only active administrators can manage report categories and campus locations."
      >
        <AdminReferenceDataClient />
      </AdministratorAccessBoundary>
    </main>
  );
}
