import type { Metadata } from "next";

import { ProfileSettingsClient } from "@/components/profile/profile-settings-client";

export const metadata: Metadata = {
  title: "Profile settings",
};

export default function ProfilePage() {
  return (
    <main id="main-content">
      <ProfileSettingsClient />
    </main>
  );
}
