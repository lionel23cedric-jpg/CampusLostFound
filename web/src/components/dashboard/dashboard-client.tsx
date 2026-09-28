"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuthSession } from "@/components/auth/auth-session-provider";

import styles from "./dashboard.module.css";
import { StaffDashboard } from "./staff-dashboard";
import { StudentDashboard } from "./student-dashboard";

export function DashboardClient() {
  const router = useRouter();
  const { status, user, refreshSession } = useAuthSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    } else if (
      status === "authenticated" &&
      user?.status === "active" &&
      user.role === "administrator"
    ) {
      router.replace("/admin");
    }
  }, [router, status, user]);

  if (status === "unavailable") {
    return (
      <section className={styles.statePanel} aria-labelledby="dashboard-unavailable">
        <h1 id="dashboard-unavailable">We could not check your account</h1>
        <p>Your session may still be active. Retry when the service is available.</p>
        <button className={styles.retry} type="button" onClick={() => void refreshSession()}>
          Retry session check
        </button>
      </section>
    );
  }

  if (status === "loading" || (status === "authenticated" && !user)) {
    return (
      <section className={styles.loading} role="status" aria-live="polite">
        <span>Loading your dashboard</span>
        <span className={styles.skeleton} aria-hidden="true" />
        <span className={styles.skeletonShort} aria-hidden="true" />
      </section>
    );
  }

  if (status === "unauthenticated") {
    return (
      <section className={styles.loading} role="status" aria-live="polite">
        Taking you to sign in
      </section>
    );
  }

  if (!user) return null;

  if (user.status === "active" && user.role === "administrator") {
    return (
      <section className={styles.loading} role="status" aria-live="polite">
        Taking you to Campus Find Operations
      </section>
    );
  }

  if (user.status === "active" && user.role === "staff") {
    return <StaffDashboard user={user} />;
  }

  return <StudentDashboard user={user} />;
}
