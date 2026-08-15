import type { Metadata } from "next";

import { DashboardClient } from "@/components/dashboard/dashboard-client";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <main id="main-content">
      <DashboardClient />
    </main>
  );
}
