import Link from "next/link";

import type { CreatedReport } from "@/lib/reports/browser-client";

import type { PhotoUploadSummary } from "./report-submission-client";
import styles from "./report-submission.module.css";

function formatStatus(status: CreatedReport["status"]) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ReportSuccess({
  report,
  photoUploadSummary,
  onRetryImages,
  onSubmitAnother,
}: {
  report: CreatedReport;
  photoUploadSummary: PhotoUploadSummary;
  onRetryImages: () => void;
  onSubmitAnother: () => void;
}) {
  return (
    <section
      className={styles.success}
      aria-labelledby="report-success-heading"
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

      <div className={styles.uploadStatus}>
        {photoUploadSummary.total === 0 ? (
          <p>No images were selected.</p>
        ) : photoUploadSummary.status === "uploading" ? (
          <p role="status" aria-live="polite">
            Uploading image {photoUploadSummary.uploaded + 1} of{" "}
            {photoUploadSummary.total}
          </p>
        ) : photoUploadSummary.status === "complete" ? (
          <p>
            {photoUploadSummary.uploaded} of {photoUploadSummary.total} images
            uploaded.
          </p>
        ) : (
          <div role="alert">
            <p>
              {photoUploadSummary.uploaded} of {photoUploadSummary.total} images
              uploaded.
            </p>
            <p>
              Your report is saved, but some images could not be uploaded. Try
              the remaining images again.
            </p>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={onRetryImages}
            >
              Retry remaining images
            </button>
          </div>
        )}
      </div>

      <div className={styles.successActions}>
        <Link
          className={styles.primaryLink}
          href={`/reports/${encodeURIComponent(report.id)}`}
        >
          View submitted report
        </Link>
        <Link className={styles.secondaryLink} href="/dashboard">
          Back to dashboard
        </Link>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={onSubmitAnother}
          disabled={photoUploadSummary.status === "uploading"}
        >
          Submit another report
        </button>
      </div>
    </section>
  );
}
