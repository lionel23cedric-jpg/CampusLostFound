"use client";

import { Fragment, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useAuthSession } from "@/components/auth/auth-session-provider";
import { PageBackLink } from "@/components/page-back-link";

import styles from "./notification-centre.module.css";
import { useNotifications } from "./notification-provider";

export function NotificationAccessBoundary({ children }: { children: ReactNode }) {
  const router = useRouter();
  const session = useAuthSession();
  const notifications = useNotifications();

  useEffect(() => {
    if (
      session.status === "unauthenticated" ||
      (session.status === "authenticated" && notifications.authenticationExpired)
    ) {
      router.replace("/login");
    }
  }, [notifications.authenticationExpired, router, session.status]);

  if (session.status === "unavailable") {
    return (
      <section
        className={styles.statePanel}
        role="alert"
        aria-labelledby="notification-session-error"
      >
        <h1 id="notification-session-error">We could not check your account</h1>
        <p>Your session may still be active. Retry when the service is available.</p>
        <button type="button" onClick={() => void session.refreshSession()}>
          Retry session check
        </button>
      </section>
    );
  }

  if (
    session.status !== "authenticated" ||
    !session.user ||
    notifications.authenticationExpired
  ) {
    return (
      <p className={styles.loading} role="status" aria-live="polite">
        {session.status === "unauthenticated" ||
        notifications.authenticationExpired
          ? "Taking you to sign in"
          : "Checking your account"}
      </p>
    );
  }

  if (session.user.status !== "active" || notifications.status === "forbidden") {
    return (
      <section
        className={styles.statePanel}
        role="alert"
        aria-labelledby="notification-permission"
      >
        <PageBackLink href="/dashboard">Back to dashboard</PageBackLink>
        <h1 id="notification-permission">Notifications unavailable</h1>
        <p>Your account cannot use the notification centre.</p>
      </section>
    );
  }

  return <Fragment key={session.user.id}>{children}</Fragment>;
}
