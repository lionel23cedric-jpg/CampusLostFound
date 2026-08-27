import type { Metadata } from "next";

import { AdminAccountManagementClient } from "@/components/admin/admin-account-management-client";
import { AdministratorAccessBoundary } from "@/components/admin/administrator-access-boundary";

export const metadata: Metadata = { title: "Manage accounts" };

export default function AdminAccountsPage() {
  return (
    <main id="main-content">
      <AdministratorAccessBoundary
        workspaceLabel="Administrator account management workspace"
        forbiddenDescription="Only active administrators can manage student and staff accounts."
      >
        <AdminAccountManagementClient />
      </AdministratorAccessBoundary>
    </main>
  );
}
