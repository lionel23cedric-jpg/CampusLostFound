import Link from "next/link";

import { ContextIllustration } from "@/components/context-illustration";
import type { PublicUser } from "@/lib/auth/public-user";

import styles from "./dashboard.module.css";

const staffActions = [
  {
    title: "Report handling",
    label: "Open report handling",
    href: "/staff/reports",
    description: "Verify reports and record secure storage details.",
  },
  {
    title: "Claim reviews",
    label: "Open Claim reviews",
    href: "/staff/claims",
    description: "Review ownership evidence and coordinate handovers.",
  },
  {
    title: "Recovery notifications",
    label: "Open notifications",
    href: "/notifications",
    description: "Follow status changes that need operational attention.",
  },
] as const;

const dateFormatter = new Intl.DateTimeFormat("en-NZ", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function StaffDashboard({ user }: { user: PublicUser }) {
  return (
    <div className={`${styles.dashboard} ${styles.staffDashboard}`}>
      <section className={styles.staffIntroduction}>
        <div>
          <h1>Recovery Operations Desk</h1>
          <p>
            Verify reports, review Claims and keep campus handovers moving safely.
          </p>
        </div>
        <dl className={styles.staffFacts} aria-label="Staff account summary">
          <div>
            <dt>Role</dt>
            <dd>Staff</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>Active</dd>
          </div>
          <div>
            <dt>Last sign-in</dt>
            <dd>
              {user.lastLoginAt
                ? dateFormatter.format(new Date(user.lastLoginAt))
                : "First sign-in"}
            </dd>
          </div>
        </dl>
      </section>

      <ContextIllustration kind="claims" variant="banner" priority />

      <section className={styles.staffActions} aria-labelledby="staff-actions-heading">
        <div className={styles.upcomingHeading}>
          <h2 id="staff-actions-heading">Operational priorities</h2>
          <p>Choose the queue that needs your attention.</p>
        </div>
        <div className={styles.staffActionGrid}>
          {staffActions.map((action) => (
            <article key={action.href}>
              <p className={styles.availableLabel}>Available now</p>
              <h3>{action.title}</h3>
              <p>{action.description}</p>
              <Link className={styles.staffActionLink} href={action.href}>
                {action.label}
              </Link>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
