"use client";

import { PageBackLink } from "@/components/page-back-link";
import { AdminModerationFlagQueue } from "./admin-moderation-flag-queue";
import { AdminModerationReportList } from "./admin-moderation-report-list";
import styles from "./admin-moderation.module.css";

export function AdminModerationClient() {
  // Moderation has two deliberate entry points: resolve a member-submitted flag,
  // or directly manage report visibility when an administrator spots a problem.
  return (
    <article className={styles.workspace}>
      <header className={styles.header}>
        <PageBackLink href="/admin">Back to administrator overview</PageBackLink>
        <p className={styles.kicker}>Administrator workspace</p>
        <h1>Report moderation</h1>
        <p>
          Review member concerns and control whether submitted reports remain
          visible without changing their recovery records.
        </p>
      </header>

      <section className={styles.section} aria-labelledby="moderation-flags">
        <h2 id="moderation-flags">Flag queue</h2>
        <AdminModerationFlagQueue />
      </section>

      <section className={styles.section} aria-labelledby="moderation-reports">
        <h2 id="moderation-reports">Report visibility</h2>
        <AdminModerationReportList />
      </section>
    </article>
  );
}
