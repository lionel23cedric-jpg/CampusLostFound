"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
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
import {
  isInternalReportImagePath,
  isLegacyHttpsPhotoUrl,
} from "@/lib/reports/photo-reference";

import styles from "./report-browsing.module.css";
import { ReportFlagPanel } from "./report-flag-panel";
import { ReportMatchesPanel } from "./report-matches-panel";

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
      canClaim={session.user.role === "student"}
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

function ActiveReportDetail({
  reportId,
  canClaim,
}: {
  reportId: string;
  canClaim: boolean;
}) {
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
      const [categories, campusLocations] = await Promise.allSettled([
        getReportCategories(),
        getReportCampusLocations(),
      ]);
      if (!mounted.current || currentRequest !== referenceRequestId.current) return;

      const failures = [categories, campusLocations].flatMap((result) =>
        result.status === "rejected" ? [result.reason as unknown] : [],
      );
      const authenticationError = failures.find(
        (error) =>
          error instanceof BrowserReportError &&
          (error.status === 401 || error.code === "AUTHENTICATION_REQUIRED"),
      );
      const permissionError = failures.find(
        (error) =>
          error instanceof BrowserReportError &&
          (error.status === 403 || error.code === "ACCOUNT_UNAVAILABLE"),
      );
      const accessError = authenticationError ?? permissionError;
      if (accessError) {
        classifyError(accessError);
        return;
      }
      if (categories.status === "rejected" || campusLocations.status === "rejected") {
        setReferenceState({ status: "error" });
        return;
      }
      setReferenceState({
        status: "ready",
        categories: categories.value,
        campusLocations: campusLocations.value,
      });
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
  const photoEntries = report.photoUrls.map((url, index) => ({ url, index }));
  const uploadedPhotos = photoEntries.filter(({ url }) =>
    isInternalReportImagePath(url),
  );
  const legacyPhotoLinks = photoEntries.filter(({ url }) =>
    isLegacyHttpsPhotoUrl(url),
  );

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

        {canClaim &&
        report.reportType === "found" &&
        report.status === "open" &&
        !report.isOwner ? (
          <Link
            className={styles.primaryButton}
            href={`/reports/${encodeURIComponent(report.id)}/claim`}
          >
            Claim this item
          </Link>
        ) : null}

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

        {uploadedPhotos.length > 0 || legacyPhotoLinks.length > 0 ? (
          <section className={styles.detailSection} aria-labelledby="photos-heading">
            <h2 id="photos-heading">Submitted photos</h2>
            {uploadedPhotos.length > 0 ? (
              <ul className={styles.photoGallery}>
                {uploadedPhotos.map(({ url, index }) => (
                  <li key={`${url}-${index}`}>
                    <Image
                      className={styles.photoImage}
                      src={url}
                      alt={`Submitted photo ${index + 1}`}
                      width={640}
                      height={480}
                      unoptimized
                    />
                  </li>
                ))}
              </ul>
            ) : null}
            {legacyPhotoLinks.length > 0 ? (
              <>
                <p>
                  External photo links open another website only when you
                  activate them.
                </p>
                <ul className={styles.photoLinks}>
                  {legacyPhotoLinks.map(({ url, index }) => (
                    <li key={`${url}-${index}`}>
                      <a href={url} target="_blank" rel="noreferrer">
                        View submitted photo {index + 1} (external)
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        ) : null}
      </article>

      {!report.isOwner ? <ReportFlagPanel reportId={report.id} /> : null}

      {report.isOwner && report.status === "open" ? (
        <ReportMatchesPanel reportId={report.id} />
      ) : null}
    </div>
  );
}
