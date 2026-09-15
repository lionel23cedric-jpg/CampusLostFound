"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuthSession } from "@/components/auth/auth-session-provider";
import { ContextIllustration } from "@/components/context-illustration";
import type { PublicUser } from "@/lib/auth/public-user";
import {
  BrowserReportError,
  getOwnReports,
  type OwnerReport,
  type OwnerReportHistoryPage,
  type OwnerReportHistoryRequest,
} from "@/lib/reports/browser-client";
import {
  ownerReportHistoryHref,
  parseOwnerReportHistorySearchParams,
} from "@/lib/reports/owner-history-search";
import { isInternalReportImagePath } from "@/lib/reports/photo-reference";

import styles from "./owner-report-history.module.css";

const statusLabels: Record<OwnerReport["status"], string> = {
  draft: "Draft",
  open: "Open",
  claim_pending: "Claim pending",
  resolved: "Resolved",
  closed: "Closed",
};

const dateFormatter = new Intl.DateTimeFormat("en-NZ", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Pacific/Auckland",
});

type HistoryState =
  | { status: "loading"; queryKey: string }
  | { status: "ready"; queryKey: string; page: OwnerReportHistoryPage }
  | { status: "error"; queryKey: string };

function SessionUnavailable({ retry }: { retry: () => Promise<void> }) {
  return (
    <section className={styles.statePanel} role="alert">
      <p className={styles.kicker}>Account check</p>
      <h1>We could not check your account</h1>
      <p>Your session may still be active. Retry when the service is available.</p>
      <button className={styles.primaryButton} type="button" onClick={() => void retry()}>
        Retry session check
      </button>
    </section>
  );
}

function ReportHistoryUnavailable() {
  return (
    <section className={styles.statePanel}>
      <p className={styles.kicker}>Account access</p>
      <h1>Report history unavailable</h1>
      <p>This account cannot access report history while it is inactive.</p>
    </section>
  );
}

export function OwnerReportHistory() {
  const router = useRouter();
  const { status, user, refreshSession } = useAuthSession();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [router, status]);

  if (status === "unavailable") {
    return <SessionUnavailable retry={refreshSession} />;
  }

  if (
    status === "loading" ||
    status === "unauthenticated" ||
    (status === "authenticated" && !user)
  ) {
    return (
      <section className={styles.loading} role="status" aria-live="polite">
        {status === "unauthenticated"
          ? "Taking you to sign in"
          : "Checking your account"}
      </section>
    );
  }

  if (!user || user.status !== "active") return <ReportHistoryUnavailable />;

  return <ActiveOwnerReportHistory key={user.id} role={user.role} />;
}

function ActiveOwnerReportHistory({ role }: { role: PublicUser["role"] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();
  const parsed = useMemo(
    () => parseOwnerReportHistorySearchParams(new URLSearchParams(queryKey)),
    [queryKey],
  );
  const [retryVersion, setRetryVersion] = useState(0);
  const [historyState, setHistoryState] = useState<HistoryState>({
    status: "loading",
    queryKey,
  });

  useEffect(() => {
    const controller = new AbortController();
    let current = true;

    void getOwnReports(parsed.request, controller.signal)
      .then((page) => {
        if (current) setHistoryState({ status: "ready", queryKey, page });
      })
      .catch((error: unknown) => {
        if (!current || controller.signal.aborted) return;
        if (
          error instanceof BrowserReportError &&
          (error.status === 401 || error.code === "AUTHENTICATION_REQUIRED")
        ) {
          router.replace("/login");
          return;
        }
        setHistoryState({ status: "error", queryKey });
      });

    return () => {
      current = false;
      controller.abort();
    };
  }, [parsed.request, queryKey, retryVersion, router]);

  const visibleState: HistoryState =
    historyState.queryKey === queryKey
      ? historyState
      : { status: "loading", queryKey };
  const hasFilters = Boolean(parsed.request.reportType || parsed.request.status);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const request: OwnerReportHistoryRequest = {};
    const reportType = String(data.get("reportType") ?? "");
    const reportStatus = String(data.get("status") ?? "");

    if (reportType === "lost" || reportType === "found") {
      request.reportType = reportType;
    }
    if (
      reportStatus === "draft" ||
      reportStatus === "open" ||
      reportStatus === "claim_pending" ||
      reportStatus === "resolved" ||
      reportStatus === "closed"
    ) {
      request.status = reportStatus;
    }
    router.push(ownerReportHistoryHref(request));
  }

  let content;
  if (visibleState.status === "loading") {
    content = <p role="status">Loading your reports</p>;
  } else if (visibleState.status === "error") {
    content = (
      <div className={styles.inlineState} role="alert">
        <p>We could not load your report history.</p>
        <button
          className={styles.primaryButton}
          type="button"
          onClick={() => {
            setHistoryState({ status: "loading", queryKey });
            setRetryVersion((version) => version + 1);
          }}
        >
          Retry history
        </button>
      </div>
    );
  } else if (visibleState.page.reports.length === 0) {
    content = hasFilters ? (
      <div className={styles.emptyState}>
        <p>No reports match these filters.</p>
        <Link className={styles.textLink} href="/reports/mine">
          Clear filters
        </Link>
      </div>
    ) : (
      <div className={styles.emptyState}>
        <p>You have not submitted any reports yet.</p>
        {role === "student" ? (
          <Link className={styles.textLink} href="/reports/new">
            Report an item
          </Link>
        ) : null}
      </div>
    );
  } else {
    content = (
      <ul className={styles.historyList}>
        {visibleState.page.reports.map((report) => (
          <OwnerReportCard key={report.id} report={report} />
        ))}
      </ul>
    );
  }

  const pagination =
    visibleState.status === "ready" && visibleState.page.pagination.totalPages > 0
      ? (() => {
          const { page, totalPages } = visibleState.page.pagination;
          const previous =
            page > 1
              ? ownerReportHistoryHref({ ...parsed.request, page: page - 1 })
              : undefined;
          const next =
            page < totalPages
              ? ownerReportHistoryHref({ ...parsed.request, page: page + 1 })
              : undefined;

          return (
            <nav className={styles.pagination} aria-label="Owner report pages">
              {previous ? (
                <Link aria-label="Previous page" href={previous}>
                  Previous
                </Link>
              ) : (
                <span aria-disabled="true">Previous</span>
              )}
              <span>Page {page} of {totalPages}</span>
              {next ? (
                <Link aria-label="Next page" href={next}>
                  Next
                </Link>
              ) : (
                <span aria-disabled="true">Next</span>
              )}
            </nav>
          );
        })()
      : null;

  const totalLabel =
    visibleState.status === "ready"
      ? `${visibleState.page.pagination.total} ${
          visibleState.page.pagination.total === 1 ? "report" : "reports"
        }`
      : "Your reports";

  return (
    <div className={styles.page}>
      <header className={styles.introduction}>
        <p className={styles.kicker}>Your submissions</p>
        <h1>Your report history</h1>
        <p>Review every lost or found item report submitted by this account.</p>
      </header>

      <ContextIllustration kind="reports" variant="banner" priority />

      {parsed.ignoredInvalidValues ? (
        <div className={styles.queryNotice} role="alert">
          <span>Some invalid report-history filters were ignored.</span>{" "}
          <Link href={ownerReportHistoryHref(parsed.request)}>Use valid filters</Link>
        </div>
      ) : null}

      <form
        key={queryKey}
        className={styles.filters}
        role="search"
        aria-labelledby="history-filter-heading"
        onSubmit={handleSubmit}
      >
        <h2 id="history-filter-heading">Filter your reports</h2>
        <label>
          Report type
          <select name="reportType" defaultValue={parsed.values.reportType}>
            <option value="">Any type</option>
            <option value="lost">Lost</option>
            <option value="found">Found</option>
          </select>
        </label>
        <label>
          Status
          <select name="status" defaultValue={parsed.values.status}>
            <option value="">Any status</option>
            <option value="draft">Draft</option>
            <option value="open">Open</option>
            <option value="claim_pending">Claim pending</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <button className={styles.primaryButton} type="submit">
          Apply filters
        </button>
      </form>

      <section className={styles.results} aria-labelledby="history-results-heading">
        <h2 id="history-results-heading" aria-live="polite">{totalLabel}</h2>
        {content}
        {pagination}
      </section>
    </div>
  );
}

function OwnerReportCard({ report }: { report: OwnerReport }) {
  const imagePath = report.photoUrls.find(isInternalReportImagePath);
  const reportHref = `/reports/${encodeURIComponent(report.id)}`;
  const typeLabel = report.reportType === "lost" ? "Lost" : "Found";
  const photoLabel = `${report.photoUrls.length} ${
    report.photoUrls.length === 1 ? "photo" : "photos"
  }`;

  return (
    <li className={styles.historyItem}>
      <article>
        <div className={styles.thumbnailFrame}>
          {imagePath ? (
            <Image
              className={styles.thumbnail}
              src={imagePath}
              alt={`Submitted item photo for ${report.title}`}
              width={160}
              height={120}
              unoptimized
            />
          ) : (
            <span className={styles.noPreview}>No preview</span>
          )}
        </div>
        <div className={styles.itemBody}>
          <div className={styles.labels}>
            <span>{typeLabel}</span>
            <span>{statusLabels[report.status]}</span>
            {report.moderationStatus === "hidden" ? (
              <span className={styles.moderation}>Hidden by moderation</span>
            ) : null}
          </div>
          <h3>
            <Link href={reportHref}>{report.title}</Link>
          </h3>
          <p>{report.publicDescription}</p>
          <dl className={styles.meta}>
            <div>
              <dt>Occurred</dt>
              <dd>{dateFormatter.format(new Date(report.occurredAt))}</dd>
            </div>
            <div>
              <dt>Submitted</dt>
              <dd>{dateFormatter.format(new Date(report.createdAt))}</dd>
            </div>
            <div>
              <dt>Photos</dt>
              <dd>{photoLabel}</dd>
            </div>
          </dl>
          {report.status !== "draft" ? (
            <Link className={styles.cardAction} href={reportHref}>
              {report.status === "open"
                ? "View report and find matches"
                : "View report details"}
            </Link>
          ) : null}
        </div>
      </article>
    </li>
  );
}
