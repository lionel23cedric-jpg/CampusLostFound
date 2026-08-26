import type { Metadata } from "next";

import { NotificationAccessBoundary } from "@/components/notifications/notification-access-boundary";
import { NotificationCentre } from "@/components/notifications/notification-centre";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return (
    <main id="main-content">
      <NotificationAccessBoundary>
        <NotificationCentre />
      </NotificationAccessBoundary>
    </main>
  );
}
