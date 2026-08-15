"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAuthSession } from "@/components/auth/auth-session-provider";

import styles from "./dashboard.module.css";

const upcomingWork = [
  {
    title: "Report an item",
    description: "Submit lost or found item details with private ownership evidence.",
  },
  {
    title: "Search possible matches",
    description: "Review suitable campus matches once report browsing is available.",
  },
  {
    title: "Manage recovery requests",
    description: "Track verification, handover arrangements and recovery progress.",
  },
];

const dateFormatter = new Intl.DateTimeFormat("en-NZ", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function DashboardClient() {
  const router = useRouter();
  const { status, user, refreshSession } = useAuthSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [router, status]);

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

  return (
    <div className={styles.dashboard}>
      <section className={styles.introduction}>
        <p className={styles.kicker}>Your campus account</p>
        <h1>Welcome, {user.profile.displayName}</h1>
        <p>Review your account status and see what is coming next in Campus Find.</p>
      </section>

      <section className={styles.account} aria-labelledby="account-heading">
        <h2 id="account-heading">Account summary</h2>
        <dl className={styles.facts}>
          <div>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd className={styles.badge}>{formatLabel(user.role)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd className={styles.badge}>{formatLabel(user.status)}</dd>
          </div>
          <div>
            <dt>Email verification</dt>
            <dd>{user.emailVerifiedAt ? "Verified" : "Not verified"}</dd>
          </div>
          <div>
            <dt>Last sign-in</dt>
            <dd>{user.lastLoginAt ? dateFormatter.format(new Date(user.lastLoginAt)) : "First sign-in"}</dd>
          </div>
        </dl>
      </section>

      <section className={styles.upcoming} aria-labelledby="upcoming-heading">
        <div className={styles.upcomingHeading}>
          <h2 id="upcoming-heading">Recovery workflow</h2>
          <p>These actions arrive in later project features.</p>
        </div>
        <div className={styles.upcomingGrid}>
          {upcomingWork.map((item) => (
            <article key={item.title}>
              <p className={styles.upcomingLabel}>Upcoming</p>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
