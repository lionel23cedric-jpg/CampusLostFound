import Link from "next/link";

import { ContextIllustration } from "@/components/context-illustration";
import type { PublicUser } from "@/lib/auth/public-user";

import styles from "./dashboard.module.css";

const recoveryWorkflow = [
  {
    title: "Report an item",
    description: "Submit lost or found item details with private ownership evidence.",
    href: "/reports/new",
  },
  {
    title: "Search possible matches",
    description: "Search privacy-safe lost and found reports across campus.",
    href: "/reports",
  },
] as const;

const dateFormatter = new Intl.DateTimeFormat("en-NZ", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

type WorkflowItem = {
  title: string;
  description: string;
  href?: string;
};

function formatLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function AccountFacts({ user }: { user: PublicUser }) {
  return (
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
        <dd>
          {user.lastLoginAt
            ? dateFormatter.format(new Date(user.lastLoginAt))
            : "First sign-in"}
        </dd>
      </div>
    </dl>
  );
}

export function StudentDashboard({ user }: { user: PublicUser }) {
  const isActive = user.status === "active";
  const workflow: WorkflowItem[] = [
    ...recoveryWorkflow,
    ...(isActive
      ? [
          {
            title: "Review my report history",
            description: "Review every lost or found report submitted by this account.",
            href: "/reports/mine",
          },
        ]
      : []),
    isActive
      ? {
          title: "Manage recovery requests",
          description: "Track verification, handover arrangements and recovery progress.",
          href: "/claims",
        }
      : {
          title: "Manage recovery requests",
          description: "Track verification, handover arrangements and recovery progress.",
        },
    ...(isActive
      ? [
          {
            title: "Manage profile settings",
            description: "Update your contact, campus and notification preferences.",
            href: "/profile",
          },
        ]
      : []),
  ];

  return (
    <div className={styles.dashboard}>
      <section className={styles.introduction}>
        <p className={styles.kicker}>Your campus account</p>
        <h1>Welcome, {user.profile.displayName}</h1>
        <p>Review your account status and see what is coming next in Campus Find.</p>
      </section>

      <ContextIllustration kind="notifications" variant="banner" priority />

      <section className={styles.account} aria-labelledby="account-heading">
        <h2 id="account-heading">Account summary</h2>
        <AccountFacts user={user} />
      </section>

      <section className={styles.upcoming} aria-labelledby="upcoming-heading">
        <div className={styles.upcomingHeading}>
          <h2 id="upcoming-heading">Recovery workflow</h2>
          <p>Choose the next useful action for your campus recovery work.</p>
        </div>
        <div className={styles.upcomingGrid}>
          {workflow.map((item) => (
            <article key={item.title}>
              <p className={item.href ? styles.availableLabel : styles.upcomingLabel}>
                {item.href ? "Available now" : "Upcoming"}
              </p>
              <h3>
                {item.href ? (
                  <Link className={styles.workflowLink} href={item.href}>
                    {item.title}
                  </Link>
                ) : (
                  item.title
                )}
              </h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
