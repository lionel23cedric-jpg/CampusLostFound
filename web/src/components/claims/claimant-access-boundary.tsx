"use client";

import { Fragment, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuthSession } from "@/components/auth/auth-session-provider";

import styles from "./claim-management.module.css";

export function ClaimantAccessBoundary({ children }: { children: ReactNode }) {
  const router = useRouter();
  const session = useAuthSession();

  useEffect(() => {
    if (session.status === "unauthenticated") {
      router.replace("/login");
    }
  }, [router, session.status]);

  if (session.status === "unavailable") {
    return (
      <section
        className={styles.statePanel}
        role="alert"
        aria-labelledby="claim-session-error"
      >
        <h1 id="claim-session-error">We could not check your account</h1>
        <p>Your session may still be active. Retry when the service is available.</p>
        <button type="button" onClick={() => void session.refreshSession()}>
          Retry session check
        </button>
      </section>
    );
  }

  if (session.status !== "authenticated" || !session.user) {
    return (
      <section className={styles.loading} role="status" aria-live="polite">
        {session.status === "unauthenticated"
          ? "Taking you to sign in"
          : "Checking your account"}
      </section>
    );
  }

  if (session.user.role !== "student" || session.user.status !== "active") {
    return (
      <section className={styles.statePanel} role="alert" aria-labelledby="claim-permission">
        <h1 id="claim-permission">Claim access unavailable</h1>
        <p>Your account cannot use the student claim workspace.</p>
        <Link href="/dashboard">Back to dashboard</Link>
      </section>
    );
  }

  return <Fragment key={session.user.id}>{children}</Fragment>;
}
