import Link from "next/link";

import type { CreatedReport } from "@/lib/reports/browser-client";

import styles from "./report-submission.module.css";

function formatStatus(status: CreatedReport["status"]) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ReportSuccess({
  report,
  onSubmitAnother,
}: {
  report: CreatedReport;
  onSubmitAnother: () => void;
}) {
  return (
    <section
      className={styles.success}
      aria-labelledby="report-success-heading"
      role="status"
      aria-live="polite"
    >
      <p className={styles.kicker}>Report received</p>
      <h1 id="report-success-heading">Report submitted</h1>
      <p>
        Your private ownership evidence was stored separately and is not shown
        here.
      </p>

      <dl className={styles.summary}>
        <div>
          <dt>Report type</dt>
          <dd>{report.reportType === "lost" ? "Lost item" : "Found item"}</dd>
        </div>
        <div>
          <dt>Title</dt>
          <dd>{report.title}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{formatStatus(report.status)}</dd>
        </div>
        <div>
          <dt>Report ID</dt>
          <dd className={styles.reportId}>{report.id}</dd>
        </div>
      </dl>

      <div className={styles.successActions}>
        <Link className={styles.primaryLink} href="/dashboard">
          Back to dashboard
        </Link>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={onSubmitAnother}
        >
          Submit another report
        </button>
      </div>
    </section>
  );
}
