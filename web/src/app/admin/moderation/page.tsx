import type { Metadata } from "next";

import { AdminModerationClient } from "@/components/admin/admin-moderation-client";
import { AdministratorAccessBoundary } from "@/components/admin/administrator-access-boundary";

export const metadata: Metadata = { title: "Report moderation" };

export default function AdminModerationPage() {
  return (
    <main id="main-content">
      <AdministratorAccessBoundary
        workspaceLabel="Administrator report moderation workspace"
        forbiddenDescription="Only active administrators can review flagged reports and report visibility."
      >
        <AdminModerationClient />
      </AdministratorAccessBoundary>
    </main>
  );
}
