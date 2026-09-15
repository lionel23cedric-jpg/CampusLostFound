import type { Metadata } from "next";

import { AuthSessionProvider } from "@/components/auth/auth-session-provider";
import { NotificationProvider } from "@/components/notifications/notification-provider";
import { SiteHeader } from "@/components/site-header";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Campus Find",
    template: "%s | Campus Find",
  },
  description:
    "A secure campus lost and found service for reporting, matching and recovering belongings.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <AuthSessionProvider>
          <NotificationProvider>
            <a className="skip-link" href="#main-content">
              Skip to main content
            </a>
            <SiteHeader />
            {children}
          </NotificationProvider>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
