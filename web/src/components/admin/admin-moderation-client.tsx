"use client";

import styles from "./admin-moderation.module.css";

export function AdminModerationClient() {
  return (
    <article className={styles.workspace}>
      <header className={styles.header}>
        <p className={styles.kicker}>Administrator workspace</p>
        <h1>Report moderation</h1>
        <p>
          Review member concerns and control whether submitted reports remain
          visible without changing their recovery records.
        </p>
      </header>

      <section className={styles.section} aria-labelledby="moderation-flags">
        <h2 id="moderation-flags">Flag queue</h2>
        <p role="status">Loading flagged reports</p>
      </section>

      <section className={styles.section} aria-labelledby="moderation-reports">
        <h2 id="moderation-reports">Report visibility</h2>
        <p role="status">Loading submitted reports</p>
      </section>
    </article>
  );
}
