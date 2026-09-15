"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuthSession } from "@/components/auth/auth-session-provider";
import { ContextIllustration } from "@/components/context-illustration";

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

  const canUseStaffTools =
    user.status === "active" &&
    (user.role === "staff" || user.role === "administrator");
  const recoveryAction =
    user.status === "active" && user.role === "student"
      ? {
          title: "Manage recovery requests",
          description: "Track verification, handover arrangements and recovery progress.",
          href: "/claims",
        }
      : user.status === "active" &&
          (user.role === "staff" || user.role === "administrator")
        ? {
            title: "Review ownership claims",
            description: "Review ownership evidence and record recovery handovers.",
            href: "/staff/claims",
          }
        : {
            title: "Manage recovery requests",
            description: "Track verification, handover arrangements and recovery progress.",
          };
  const workflow = [
    recoveryWorkflow[0],
    recoveryWorkflow[1],
    ...(user.status === "active"
      ? [
          {
            title: "Review my report history",
            description: "Review every lost or found report submitted by this account.",
            href: "/reports/mine",
          },
        ]
      : []),
    ...(canUseStaffTools
      ? [
          {
            title: "Handle item reports",
            description:
              "Verify reports and record where Found items are held for recovery.",
            href: "/staff/reports",
          },
        ]
      : []),
    recoveryAction,
    ...(user.status === "active"
      ? [
          {
            title: "Manage profile settings",
            description: "Update your contact, campus and notification preferences.",
            href: "/profile",
          },
        ]
      : []),
    ...(user.status === "active" && user.role === "administrator"
      ? [
          {
            title: "Review system overview",
            description:
              "Review current report, recovery, Claim and account statistics.",
            href: "/admin",
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
