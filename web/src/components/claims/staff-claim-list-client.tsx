"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CLAIM_STATUSES,
  ClaimBrowserError,
  type ClaimStatus,
} from "@/lib/claims/browser-client";
import { ContextIllustration } from "@/components/context-illustration";
import { PageBackLink } from "@/components/page-back-link";
import {
  getStaffClaims,
  type StaffClaimPage,
} from "@/lib/claims/staff-browser-client";
import {
  parseStaffClaimListSearchParams,
  staffClaimListHref,
} from "@/lib/claims/staff-list-search";

import styles from "./staff-claim-review.module.css";

type ListState =
  | { status: "loading"; queryKey: string }
  | { status: "ready"; queryKey: string; page: StaffClaimPage }
  | { status: "forbidden"; queryKey: string }
  | { status: "error"; queryKey: string };

const statusLabels: Record<ClaimStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  completed: "Completed",
};

const dateTimeFormatter = new Intl.DateTimeFormat("en-NZ", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Pacific/Auckland",
});

export function StaffClaimListClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();
  const parsed = useMemo(
    () => parseStaffClaimListSearchParams(new URLSearchParams(queryKey)),
    [queryKey],
  );
  const selectedStatus = parsed.values.status;
  const requestedPage = parsed.values.page;
  const requestId = useRef(0);
  const [listState, setListState] = useState<ListState>({
    status: "loading",
    queryKey,
  });

  const loadClaims = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setListState({ status: "loading", queryKey });

    const canonicalHref = staffClaimListHref(parsed.values);
    const canonicalQuery = canonicalHref.split("?", 2)[1] ?? "";
    if (queryKey !== canonicalQuery) router.replace(canonicalHref);

    try {
      const page = await getStaffClaims(parsed.request);
      if (currentRequest !== requestId.current) return;

      if (
        requestedPage !== 1 &&
        requestedPage > page.pagination.totalPages
      ) {
        router.replace(
          staffClaimListHref({
            status: selectedStatus,
            page: Math.max(page.pagination.totalPages, 1),
          }),
        );
        return;
      }

      setListState({ status: "ready", queryKey, page });
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      if (error instanceof ClaimBrowserError) {
        if (error.status === 401 || error.code === "AUTHENTICATION_REQUIRED") {
          router.replace("/login");
          return;
        }
        if (error.status === 403 || error.code === "CLAIM_FORBIDDEN") {
          setListState({ status: "forbidden", queryKey });
          return;
        }
      }
      setListState({ status: "error", queryKey });
    }
  }, [parsed, queryKey, requestedPage, router, selectedStatus]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadClaims(), 0);
    return () => {
      window.clearTimeout(timeoutId);
      requestId.current += 1;
    };
  }, [loadClaims]);

  const visibleState: ListState =
    listState.queryKey === queryKey
      ? listState
      : { status: "loading", queryKey };

  if (visibleState.status === "forbidden") {
    return (
      <section
        className={styles.statePanel}
        role="alert"
        aria-labelledby="staff-claim-list-forbidden-heading"
      >
        <PageBackLink href="/dashboard">Back to dashboard</PageBackLink>
        <h1 id="staff-claim-list-forbidden-heading">
          Claim review access unavailable
        </h1>
        <p>Your account cannot review ownership Claims.</p>
      </section>
    );
  }

  return (
    <div className={styles.listPage}>
      <PageBackLink href="/dashboard">Back to dashboard</PageBackLink>
      <header className={styles.listHeader}>
        <h1>Claim reviews</h1>
        <p>
          Review ownership requests. Claim evidence is restricted to authorised
          staff and administrators.
        </p>
      </header>

      <ContextIllustration kind="claims" variant="banner" priority />

      {parsed.ignoredInvalidValues ? (
        <p className={styles.queryNotice} role="status">
          Some invalid Claim filters were ignored.
        </p>
      ) : null}

      <section
        className={styles.filterPanel}
        aria-labelledby="staff-claim-filter-heading"
      >
        <h2 id="staff-claim-filter-heading">Filter review queue</h2>
        <label className={styles.statusControl}>
          Claim status
          <select
            value={selectedStatus}
            onChange={(event) =>
              router.push(
                staffClaimListHref({
                  status: event.currentTarget.value as ClaimStatus,
                  page: 1,
                }),
              )
            }
          >
            {CLAIM_STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className={styles.results} aria-labelledby="staff-claim-results-heading">
        <div className={styles.resultsHeader}>
          <h2 id="staff-claim-results-heading">Review queue</h2>
          {visibleState.status === "ready" ? (
            <p aria-live="polite">
              {visibleState.page.pagination.total}{" "}
              {visibleState.page.pagination.total === 1 ? "Claim" : "Claims"} ·
              Page {visibleState.page.pagination.page}
              {visibleState.page.pagination.totalPages > 0
                ? ` of ${visibleState.page.pagination.totalPages}`
                : ""}
            </p>
          ) : null}
        </div>
        <StaffClaimResults
          state={visibleState}
          selectedStatus={selectedStatus}
          retry={loadClaims}
        />
      </section>
    </div>
  );
}

function StaffClaimResults({
  state,
  selectedStatus,
  retry,
}: {
  state: ListState;
  selectedStatus: ClaimStatus;
  retry: () => Promise<void>;
}) {
  if (state.status === "loading") {
    return (
      <p className={styles.inlineState} role="status" aria-live="polite">
        Loading Claim reviews
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <div className={styles.inlineState} role="alert">
        <p>We could not load Claim reviews</p>
        <button type="button" onClick={() => void retry()}>
          Retry Claim reviews
        </button>
      </div>
    );
  }

  if (state.status !== "ready") return null;
  const { claims, pagination } = state.page;

  if (claims.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>
          {selectedStatus === "pending"
            ? "No Claims are waiting for review"
            : "No Claims match this status"}
        </p>
        <p>
          {selectedStatus === "pending"
            ? "New ownership requests will appear here."
            : "Choose another status to review Claim history."}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className={styles.claimGrid}>
        {claims.map((claim) => (
          <article
            className={styles.claimCard}
            aria-label={claim.report.title}
            key={claim.id}
          >
            <div className={styles.claimCardHeader}>
              <div>
                <h3>{claim.report.title}</h3>
                <p className={styles.reportType}>
                  {claim.report.reportType === "found" ? "Found" : "Lost"} report
                </p>
              </div>
              <p className={styles.claimStatus}>
                Claim status: <strong>{statusLabels[claim.status]}</strong>
              </p>
            </div>
            <dl className={styles.claimFacts}>
              <div>
                <dt>Claimant</dt>
                <dd>{claim.claimant.displayName}</dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>{dateTimeFormatter.format(new Date(claim.createdAt))}</dd>
              </div>
              <div>
                <dt>Verification</dt>
                <dd>
                  {claim.verification.matchedCount} of{" "}
                  {claim.verification.questionCount} answers matched
                </dd>
              </div>
            </dl>
            <Link
              className={styles.detailLink}
              href={`/staff/claims/${encodeURIComponent(claim.id)}`}
              aria-label={`Review claim for ${claim.report.title}`}
            >
              Review claim
            </Link>
          </article>
        ))}
      </div>
      <StaffClaimPagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        status={selectedStatus}
      />
    </>
  );
}

function StaffClaimPagination({
  page,
  totalPages,
  status,
}: {
  page: number;
  totalPages: number;
  status: ClaimStatus;
}) {
  if (totalPages < 1) return null;
  const previousHref =
    page > 1 ? staffClaimListHref({ status, page: page - 1 }) : undefined;
  const nextHref =
    page < totalPages ? staffClaimListHref({ status, page: page + 1 }) : undefined;

  return (
    <nav className={styles.pagination} aria-label="Claim review pages">
      {previousHref ? (
        <Link href={previousHref} aria-label="Previous page">
          Previous
        </Link>
      ) : (
        <span aria-label="Previous page" aria-disabled="true">
          Previous
        </span>
      )}
      <span aria-live="polite">
        Page {page} of {totalPages}
      </span>
      {nextHref ? (
        <Link href={nextHref} aria-label="Next page">
          Next
        </Link>
      ) : (
        <span aria-label="Next page" aria-disabled="true">
          Next
        </span>
      )}
    </nav>
  );
}
