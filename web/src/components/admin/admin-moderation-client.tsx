"use client";

import Link from "next/link";

import { AdminModerationFlagQueue } from "./admin-moderation-flag-queue";
import { AdminModerationReportList } from "./admin-moderation-report-list";
import styles from "./admin-moderation.module.css";

export function AdminModerationClient() {
  return (
    <article className={styles.workspace}>
      <header className={styles.header}>
        <Link className={styles.backLink} href="/admin">
          Back to administrator overview
        </Link>
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
