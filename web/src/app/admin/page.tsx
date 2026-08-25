import type { Metadata } from "next";

import { AdminOverviewClient } from "@/components/admin/admin-overview-client";
import { AdministratorAccessBoundary } from "@/components/admin/administrator-access-boundary";

export const metadata: Metadata = { title: "Administrator overview" };

export default function AdminPage() {
  return (
    <main id="main-content">
      <AdministratorAccessBoundary>
        <AdminOverviewClient />
      </AdministratorAccessBoundary>
    </main>
  );
}
