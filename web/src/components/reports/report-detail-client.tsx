"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuthSession } from "@/components/auth/auth-session-provider";
import {
  BrowserReportError,
  getReportById,
  getReportCampusLocations,
  getReportCategories,
  type MemberReport,
  type ReportCampusLocation,
  type ReportCategory,
} from "@/lib/reports/browser-client";

import styles from "./report-browsing.module.css";

type ReportState =
  | { status: "loading" }
  | { status: "ready"; report: MemberReport }
  | { status: "not-found" }
  | { status: "error" };

type ReferenceState =
  | { status: "loading" }
  | {
      status: "ready";
      categories: ReportCategory[];
      campusLocations: ReportCampusLocation[];
    }
  | { status: "error" };

const statusLabels: Record<MemberReport["status"], string> = {
  open: "Open",
  claim_pending: "Claim pending",
  resolved: "Resolved",
  closed: "Closed",
};

const dateTimeFormatter = new Intl.DateTimeFormat("en-NZ", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Pacific/Auckland",
});

export function ReportDetailClient({ reportId }: { reportId: string }) {
  const router = useRouter();
  const session = useAuthSession();

  useEffect(() => {
    if (session.status === "unauthenticated") router.replace("/login");
  }, [router, session.status]);

  if (session.status === "unavailable") {
    return (
      <section
        className={styles.statePanel}
        role="alert"
        aria-labelledby="detail-session-error"
      >
        <p className={styles.kicker}>Account check</p>
        <h1 id="detail-session-error">We could not check your account</h1>
        <p>Your session may still be active. Retry when the service is available.</p>
        <button
          className={styles.primaryButton}
          type="button"
          onClick={() => void session.refreshSession()}
        >
          Retry session check
        </button>
      </section>
    );
  }

  if (session.status !== "authenticated" || !session.user) {
    return (
      <section className={styles.loading} role="status" aria-live="polite">
        {session.status === "unauthenticated"
          ? "Taking you to sign in"
          : "Checking your account"}
      </section>
    );
  }

  if (session.user.status !== "active") return <PermissionUnavailable />;

  return (
    <ActiveReportDetail
      key={`${session.user.id}-${reportId}`}
      reportId={reportId}
    />
  );
}

function PermissionUnavailable() {
  return (
    <section
      className={styles.statePanel}
      role="alert"
      aria-labelledby="detail-permission-heading"
    >
      <p className={styles.kicker}>Campus reports</p>
      <h1 id="detail-permission-heading">Report details unavailable</h1>
      <p>Your account cannot view member report details at the moment.</p>
      <Link className={styles.secondaryLink} href="/reports">
        Back to reports
      </Link>
    </section>
  );
}

function ActiveReportDetail({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [reportState, setReportState] = useState<ReportState>({
    status: "loading",
  });
  const [referenceState, setReferenceState] = useState<ReferenceState>({
    status: "loading",
  });
  const [permissionUnavailable, setPermissionUnavailable] = useState(false);
  const mounted = useRef(false);
  const reportRequestId = useRef(0);
  const referenceRequestId = useRef(0);

  const classifyError = useCallback(
    (error: unknown) => {
      if (!(error instanceof BrowserReportError)) return false;
      if (error.status === 401 || error.code === "AUTHENTICATION_REQUIRED") {
        router.replace("/login");
        return true;
      }
      if (error.status === 403 || error.code === "ACCOUNT_UNAVAILABLE") {
        setPermissionUnavailable(true);
        return true;
      }
      return false;
    },
    [router],
  );

  const loadReport = useCallback(async () => {
    if (!mounted.current) return;
    const currentRequest = ++reportRequestId.current;
    setReportState({ status: "loading" });

    try {
      const report = await getReportById(reportId);
      if (!mounted.current || currentRequest !== reportRequestId.current) return;
      setReportState({ status: "ready", report });
    } catch (error) {
      if (!mounted.current || currentRequest !== reportRequestId.current) return;
      if (error instanceof BrowserReportError) {
        if (error.status === 404 || error.code === "REPORT_NOT_FOUND") {
          setReportState({ status: "not-found" });
          return;
        }
      }
      if (!classifyError(error)) setReportState({ status: "error" });
    }
  }, [classifyError, reportId]);

  const loadReferences = useCallback(async () => {
    if (!mounted.current) return;
    const currentRequest = ++referenceRequestId.current;
    setReferenceState({ status: "loading" });

    try {
      const [categories, campusLocations] = await Promise.all([
        getReportCategories(),
        getReportCampusLocations(),
      ]);
      if (!mounted.current || currentRequest !== referenceRequestId.current) return;
      setReferenceState({ status: "ready", categories, campusLocations });
    } catch (error) {
      if (!mounted.current || currentRequest !== referenceRequestId.current) return;
      if (!classifyError(error)) setReferenceState({ status: "error" });
    }
  }, [classifyError]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      reportRequestId.current += 1;
      referenceRequestId.current += 1;
    };
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadReport();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadReport]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadReferences();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadReferences]);

  if (permissionUnavailable) return <PermissionUnavailable />;

  if (reportState.status === "loading") {
    return (
      <section className={styles.loading} role="status" aria-live="polite">
        Loading report details
      </section>
    );
  }

  if (reportState.status === "not-found") {
    return (
      <section className={styles.statePanel} aria-labelledby="not-found-heading">
        <p className={styles.kicker}>Campus reports</p>
        <h1 id="not-found-heading">Report not found</h1>
        <p>This report is unavailable or no longer visible to members.</p>
        <Link className={styles.secondaryLink} href="/reports">
          Back to reports
        </Link>
      </section>
    );
  }

  if (reportState.status === "error") {
    return (
      <section
        className={styles.statePanel}
        role="alert"
        aria-labelledby="detail-error-heading"
      >
        <p className={styles.kicker}>Campus reports</p>
        <h1 id="detail-error-heading">We could not load this report</h1>
        <p>Retry when the report service is available.</p>
        <button
          className={styles.primaryButton}
          type="button"
          onClick={() => void loadReport()}
        >
          Retry report details
        </button>
      </section>
    );
  }

  const { report } = reportState;
  const categoryName =
    referenceState.status === "loading"
      ? "Category details loading"
      : referenceState.status === "ready"
        ? referenceState.categories.find(
            (category) => category.id === report.categoryId,
          )?.name ?? "Category unavailable"
        : "Category unavailable";
  const campusLocationName = !report.campusLocationId
    ? "Location hidden"
    : referenceState.status === "loading"
      ? "Campus location details loading"
      : referenceState.status === "ready"
        ? (() => {
            const location = referenceState.campusLocations.find(
              (candidate) => candidate.id === report.campusLocationId,
            );
            return location
              ? `${location.campusName} · ${location.locationName}`
              : "Campus location unavailable";
          })()
        : "Campus location unavailable";
  const typeLabel = report.reportType === "lost" ? "Lost" : "Found";

  return (
    <div className={styles.detailPage}>
      <Link className={styles.backLink} href="/reports">
        Back to reports
      </Link>

      {referenceState.status === "error" ? (
        <div className={styles.inlineState} role="alert">
          <p>Report labels are temporarily unavailable.</p>
          <button type="button" onClick={() => void loadReferences()}>
            Retry report labels
          </button>
        </div>
      ) : null}

      <article className={styles.detailArticle}>
        <header className={styles.detailHeader}>
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
          <h1>{report.title}</h1>
          <p>{report.publicDescription}</p>
        </header>

        <dl className={styles.detailFacts}>
          <div>
            <dt>Category</dt>
            <dd>{categoryName}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{campusLocationName}</dd>
          </div>
          <div>
            <dt>Event date</dt>
            <dd>
              {report.occurredAt
                ? dateTimeFormatter.format(new Date(report.occurredAt))
                : "Date hidden"}
            </dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{dateTimeFormatter.format(new Date(report.createdAt))}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{dateTimeFormatter.format(new Date(report.updatedAt))}</dd>
          </div>
          {report.resolvedAt ? (
            <div>
              <dt>Resolved</dt>
              <dd>{dateTimeFormatter.format(new Date(report.resolvedAt))}</dd>
            </div>
          ) : null}
        </dl>

        {report.colors.length > 0 ? (
          <section className={styles.detailSection} aria-labelledby="colours-heading">
            <h2 id="colours-heading">Colours</h2>
            <ul className={styles.tokenList}>
              {report.colors.map((color, index) => (
                <li key={`${color}-${index}`}>{color}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {report.tags.length > 0 ? (
          <section className={styles.detailSection} aria-labelledby="tags-heading">
            <h2 id="tags-heading">Tags</h2>
            <ul className={styles.tagList}>
              {report.tags.map((tag, index) => (
                <li key={`${tag}-${index}`}>{tag}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {report.photoUrls.length > 0 ? (
          <section className={styles.detailSection} aria-labelledby="photos-heading">
            <h2 id="photos-heading">Submitted photos</h2>
            <p>Photo links open an external website only when you activate them.</p>
            <ul className={styles.photoLinks}>
              {report.photoUrls.map((photoUrl, index) => (
                <li key={`${photoUrl}-${index}`}>
                  <a href={photoUrl} target="_blank" rel="noreferrer">
                    View submitted photo {index + 1} (external)
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </div>
  );
}
