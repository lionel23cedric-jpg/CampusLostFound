import type { Metadata } from "next";

import { AuthSessionProvider } from "@/components/auth/auth-session-provider";
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
    <html lang="en">
      <body>
        <AuthSessionProvider>
          <a className="skip-link" href="#main-content">
            Skip to main content
          </a>
          <SiteHeader />
          {children}
        </AuthSessionProvider>
      </body>
    </html>
  );
}
