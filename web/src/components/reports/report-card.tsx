import Link from "next/link";

import type { MemberReport } from "@/lib/reports/browser-client";

import styles from "./report-browsing.module.css";

const statusLabels: Record<MemberReport["status"], string> = {
  open: "Open",
  claim_pending: "Claim pending",
  resolved: "Resolved",
  closed: "Closed",
};

const dateFormatter = new Intl.DateTimeFormat("en-NZ", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export type ReportCardProps = {
  report: MemberReport;
  categoryName: string;
  campusLocationName: string;
};

export function ReportCard({
  report,
  categoryName,
  campusLocationName,
}: ReportCardProps) {
  const typeLabel = report.reportType === "lost" ? "Lost" : "Found";
  const locationName = report.campusLocationId
    ? campusLocationName
    : "Location hidden";

  return (
    <article className={styles.card}>
      <Link className={styles.cardLink} href={`/reports/${report.id}`}>
        <div className={styles.cardContent}>
          <div className={styles.cardHeading}>
            <p
              className={`${styles.typeStatus} ${
                report.reportType === "lost" ? styles.lost : styles.found
              }`}
            >
              {typeLabel} · {statusLabels[report.status]}
            </p>
            {report.isOwner ? (
              <span className={styles.ownerLabel}>Your report</span>
            ) : null}
          </div>

          <h2 className={styles.cardTitle}>{report.title}</h2>
          <p className={styles.cardDescription}>{report.publicDescription}</p>

          <dl className={styles.cardFacts}>
            <div>
              <dt>Category</dt>
              <dd>{categoryName}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{locationName}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>
                {report.occurredAt
                  ? dateFormatter.format(new Date(report.occurredAt))
                  : "Date hidden"}
              </dd>
            </div>
          </dl>

          <div className={styles.cardTokens}>
            {report.colors.length > 0 ? (
              <ul aria-label="Colours" className={styles.tokenList}>
                {report.colors.map((color, index) => (
                  <li key={`${color}-${index}`}>{color}</li>
                ))}
              </ul>
            ) : null}
            {report.tags.length > 0 ? (
              <ul aria-label="Tags" className={styles.tagList}>
                {report.tags.map((tag, index) => (
                  <li key={`${tag}-${index}`}>{tag}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        {report.photoUrls[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={styles.cardPhoto}
            src={report.photoUrls[0]}
            alt={`Submitted photo for ${report.title}`}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        ) : null}
      </Link>
    </article>
  );
}
