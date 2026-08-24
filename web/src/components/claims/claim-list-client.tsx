"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  CLAIM_STATUSES,
  ClaimBrowserError,
  getMyClaims,
  type ClaimPage,
  type ClaimStatus,
} from "@/lib/claims/browser-client";
import {
  claimListHref,
  parseClaimListSearchParams,
} from "@/lib/claims/list-search";

import styles from "./claim-management.module.css";

type ListState =
  | { status: "loading"; queryKey: string }
  | { status: "ready"; queryKey: string; page: ClaimPage }
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

export function ClaimListClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();
  const parsed = useMemo(
    () => parseClaimListSearchParams(new URLSearchParams(queryKey)),
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

    try {
      const page = await getMyClaims({
        ...(selectedStatus ? { status: selectedStatus } : {}),
        ...(requestedPage !== 1 ? { page: requestedPage } : {}),
      });
      if (currentRequest !== requestId.current) return;

      let replacement: string | undefined;
      if (
        page.pagination.total > 0 &&
        page.pagination.totalPages >= 1 &&
        requestedPage > page.pagination.totalPages
      ) {
        replacement = claimListHref({
          status: selectedStatus,
          page: page.pagination.totalPages,
        });
      } else if (page.pagination.total === 0 && requestedPage !== 1) {
        replacement = claimListHref({ status: selectedStatus, page: 1 });
      }

      if (replacement) {
        router.replace(replacement);
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
  }, [queryKey, requestedPage, router, selectedStatus]);

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
        aria-labelledby="claim-list-forbidden-heading"
      >
        <h1 id="claim-list-forbidden-heading">Claim access unavailable</h1>
        <p>Your account cannot view student claim history.</p>
        <Link href="/dashboard">Back to dashboard</Link>
      </section>
    );
  }

  return (
    <div className={styles.listPage}>
      <header className={styles.listHeader}>
        <h1>My claims</h1>
        <p>Track the ownership claims you have submitted for found items.</p>
      </header>

      {parsed.ignoredInvalidValues ? (
        <p className={styles.queryNotice} role="status">
          Some invalid claim filters were ignored.
        </p>
      ) : null}

      <section className={styles.filterPanel} aria-labelledby="claim-filter-heading">
        <h2 id="claim-filter-heading">Filter claim history</h2>
        <label className={styles.statusControl}>
          Claim status
          <select
            value={selectedStatus}
            onChange={(event) =>
              router.push(
                claimListHref({
                  status: event.currentTarget.value as "" | ClaimStatus,
                  page: 1,
                }),
              )
            }
          >
            <option value="">All statuses</option>
            {CLAIM_STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className={styles.results} aria-labelledby="claim-history-heading">
        <h2 id="claim-history-heading">Claim history</h2>
        <ClaimResults
          state={visibleState}
          selectedStatus={selectedStatus}
          retry={loadClaims}
        />
      </section>
    </div>
  );
}

function ClaimResults({
  state,
  selectedStatus,
  retry,
}: {
  state: ListState;
  selectedStatus: "" | ClaimStatus;
  retry: () => Promise<void>;
}) {
  if (state.status === "loading") {
    return (
      <p className={styles.inlineState} role="status" aria-live="polite">
        Loading your claims
      </p>
    );
  }

  if (state.status === "error") {
    return (
      <div className={styles.inlineState} role="alert">
        <p>We could not load your claims.</p>
        <button type="button" onClick={() => void retry()}>
          Retry claim history
        </button>
      </div>
    );
  }

  if (state.status !== "ready") return null;
  const { claims, pagination } = state.page;

  if (claims.length === 0) {
    return selectedStatus ? (
      <div className={styles.emptyState}>
        <p>No claims match this status</p>
        <p>Choose another status to review the rest of your claim history.</p>
      </div>
    ) : (
      <div className={styles.emptyState}>
        <p>You have not submitted a claim yet</p>
        <Link href="/reports">Browse reports</Link>
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
            <dl className={styles.claimDates}>
              <div>
                <dt>Created</dt>
                <dd>{dateTimeFormatter.format(new Date(claim.createdAt))}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{dateTimeFormatter.format(new Date(claim.updatedAt))}</dd>
              </div>
            </dl>
            <Link
              className={styles.detailLink}
              href={`/claims/${encodeURIComponent(claim.id)}`}
              aria-label={`View claim for ${claim.report.title}`}
            >
              View claim
            </Link>
          </article>
        ))}
      </div>
      <ClaimPagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        status={selectedStatus}
      />
    </>
  );
}

function ClaimPagination({
  page,
  totalPages,
  status,
}: {
  page: number;
  totalPages: number;
  status: "" | ClaimStatus;
}) {
  if (totalPages < 1) return null;
  const previousHref =
    page > 1 ? claimListHref({ status, page: page - 1 }) : undefined;
  const nextHref =
    page < totalPages ? claimListHref({ status, page: page + 1 }) : undefined;

  return (
    <nav className={styles.pagination} aria-label="Claim history pages">
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
