"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ClaimBrowserError,
  getMyClaim,
  withdrawMyClaim,
  type ClaimantClaim,
  type ClaimStatus,
} from "@/lib/claims/browser-client";
import { PageBackLink } from "@/components/page-back-link";

import styles from "./claim-management.module.css";

type DetailState =
  | { status: "loading" }
  | { status: "ready"; claim: ClaimantClaim }
  | { status: "not-found" }
  | { status: "forbidden" }
  | { status: "error" };

type LiveMessage = { kind: "alert" | "status"; text: string } | null;

const statusLabels: Record<ClaimStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  completed: "Completed",
};

const statusCopy: Record<ClaimStatus, string> = {
  pending: "Awaiting staff review.",
  approved: "Ownership review approved; follow campus handover instructions.",
  rejected: "The ownership claim was not approved.",
  withdrawn: "The student withdrew the claim.",
  completed: "Recovery was recorded as completed.",
};

const reportStatusLabels: Record<ClaimantClaim["report"]["status"], string> = {
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

export function ClaimDetailClient({
  claimId,
  fromNotifications = false,
}: {
  claimId: string;
  fromNotifications?: boolean;
}) {
  return (
    <ClaimDetailSurface
      key={claimId}
      claimId={claimId}
      fromNotifications={fromNotifications}
    />
  );
}

function ClaimDetailSurface({
  claimId,
  fromNotifications,
}: {
  claimId: string;
  fromNotifications: boolean;
}) {
  const router = useRouter();
  const [detailState, setDetailState] = useState<DetailState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [confirmingWithdrawal, setConfirmingWithdrawal] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<LiveMessage>(null);
  const [mutationMessage, setMutationMessage] = useState<LiveMessage>(null);
  const requestId = useRef(0);
  const refreshId = useRef(0);
  const mutationId = useRef(0);
  const mounted = useRef(false);
  const refreshInFlight = useRef(false);
  const withdrawalInFlight = useRef(false);
  const refreshButtonRef = useRef<HTMLButtonElement>(null);
  const withdrawTriggerRef = useRef<HTMLButtonElement>(null);
  const focusRefreshAfterWithdrawal = useRef(false);

  useEffect(() => {
    if (!withdrawing && focusRefreshAfterWithdrawal.current) {
      focusRefreshAfterWithdrawal.current = false;
      refreshButtonRef.current?.focus();
    }
  }, [detailState, mutationMessage, withdrawing]);

  const setSafeFailureState = useCallback(
    (error: unknown) => {
      if (error instanceof ClaimBrowserError) {
        if (error.status === 401 || error.code === "AUTHENTICATION_REQUIRED") {
          router.replace("/login");
          return true;
        }
        if (error.status === 403 || error.code === "CLAIM_FORBIDDEN") {
          setDetailState({ status: "forbidden" });
          return true;
        }
        if (error.status === 404 || error.code === "CLAIM_NOT_FOUND") {
          setDetailState({ status: "not-found" });
          return true;
        }
      }
      return false;
    },
    [router],
  );

  const loadClaim = useCallback(
    async ({ preserveReadyClaim = false }: { preserveReadyClaim?: boolean } = {}) => {
      const currentRequest = ++requestId.current;
      if (!preserveReadyClaim) {
        setDetailState({ status: "loading" });
      }

      try {
        const claim = await getMyClaim(claimId);
        if (!mounted.current || currentRequest !== requestId.current) return;
        setDetailState({ status: "ready", claim });
        setConfirmingWithdrawal(false);
        if (preserveReadyClaim) {
          setRefreshMessage({ kind: "status", text: "Claim status refreshed." });
        }
      } catch (error) {
        if (!mounted.current || currentRequest !== requestId.current) return;
        if (setSafeFailureState(error)) return;
        if (preserveReadyClaim) {
          setRefreshMessage({
            kind: "alert",
            text: "We could not refresh this claim. Please try again.",
          });
          return;
        }
        setDetailState({ status: "error" });
      }
    },
    [claimId, setSafeFailureState],
  );

  useEffect(() => {
    mounted.current = true;
    const timeoutId = window.setTimeout(() => void loadClaim(), 0);

    return () => {
      window.clearTimeout(timeoutId);
      mounted.current = false;
      requestId.current += 1;
      refreshId.current += 1;
      mutationId.current += 1;
      refreshInFlight.current = false;
      withdrawalInFlight.current = false;
    };
  }, [loadClaim]);

  async function refreshClaim() {
    if (refreshInFlight.current || withdrawalInFlight.current) return;
    refreshInFlight.current = true;
    const currentRefresh = ++refreshId.current;
    setRefreshing(true);
    setRefreshMessage(null);
    setMutationMessage(null);

    try {
      await loadClaim({ preserveReadyClaim: true });
    } finally {
      if (mounted.current && currentRefresh === refreshId.current) {
        refreshInFlight.current = false;
        setRefreshing(false);
      }
    }
  }

  async function confirmWithdrawal() {
    if (withdrawalInFlight.current) return;
    withdrawalInFlight.current = true;
    const currentMutation = ++mutationId.current;
    requestId.current += 1;
    refreshId.current += 1;
    refreshInFlight.current = false;
    setRefreshing(false);
    setRefreshMessage(null);
    setMutationMessage(null);
    setWithdrawing(true);

    try {
      const claim = await withdrawMyClaim(claimId);
      if (!mounted.current || currentMutation !== mutationId.current) return;
      requestId.current += 1;
      refreshId.current += 1;
      refreshInFlight.current = false;
      setRefreshing(false);
      setDetailState({ status: "ready", claim });
      setConfirmingWithdrawal(false);
      setMutationMessage({ kind: "status", text: "Claim withdrawn." });
      focusRefreshAfterWithdrawal.current = true;
    } catch (error) {
      if (!mounted.current || currentMutation !== mutationId.current) return;
      if (setSafeFailureState(error)) return;
      if (error instanceof ClaimBrowserError && error.code === "CLAIM_STATE_CONFLICT") {
        setConfirmingWithdrawal(false);
        setMutationMessage({
          kind: "alert",
          text: "This claim changed. Refresh its status before trying again.",
        });
        focusRefreshAfterWithdrawal.current = true;
      } else {
        setMutationMessage({
          kind: "alert",
          text: "We could not withdraw this claim. Please try again.",
        });
      }
    } finally {
      if (mounted.current && currentMutation === mutationId.current) {
        withdrawalInFlight.current = false;
        setWithdrawing(false);
      }
    }
  }

  if (detailState.status === "loading") {
    return (
      <p className={styles.loading} role="status" aria-live="polite">
        Loading claim details
      </p>
    );
  }

  if (detailState.status === "not-found") {
    return (
      <SafeDetailState
        heading="Claim not found"
        message="This claim is unavailable or does not belong to your account."
        href="/claims"
        linkText="Back to My claims"
      />
    );
  }

  if (detailState.status === "forbidden") {
    return (
      <SafeDetailState
        heading="Claim access unavailable"
        message="Your account cannot view this student claim."
        href="/dashboard"
        linkText="Back to dashboard"
        alert
      />
    );
  }

  if (detailState.status === "error") {
    return (
      <section
        className={styles.statePanel}
        role="alert"
        aria-labelledby="claim-detail-error-heading"
      >
        <h1 id="claim-detail-error-heading">We could not load this claim</h1>
        <p>Retry when the claim service is available.</p>
        <button type="button" onClick={() => void loadClaim()}>
          Retry claim details
        </button>
      </section>
    );
  }

  const { claim } = detailState;
  const canWithdraw = claim.status === "pending" || claim.status === "approved";
  const reportHref = `/reports/${encodeURIComponent(claim.report.id)}`;
  const backHref = fromNotifications ? "/notifications" : "/claims";
  const backLabel = fromNotifications
    ? "Back to notifications"
    : "Back to My claims";

  return (
    <div className={styles.detailPage}>
      <PageBackLink href={backHref}>
        {backLabel}
      </PageBackLink>

      <article className={styles.detailPanel} aria-labelledby="claim-detail-heading">
        <header className={styles.detailHeader}>
          <div>
            <h1 id="claim-detail-heading">Claim details</h1>
            <p className={styles.detailTitle}>{claim.report.title}</p>
          </div>
          <p className={styles.claimStatus}>
            Claim status: <strong>{statusLabels[claim.status]}</strong>
          </p>
        </header>

        <div className={styles.statusSummary} role="status" aria-live="polite">
          <p>{statusCopy[claim.status]}</p>
        </div>

        <dl className={styles.factGrid}>
          <div>
            <dt>Report type</dt>
            <dd>{claim.report.reportType === "found" ? "Found report" : "Lost report"}</dd>
          </div>
          <div>
            <dt>Report status</dt>
            <dd>Report status: {reportStatusLabels[claim.report.status]}</dd>
          </div>
        </dl>

        <Link className={styles.secondaryLink} href={reportHref}>
          View report
        </Link>

        <section
          className={styles.timeline}
          aria-labelledby="claim-timeline-heading"
        >
          <h2 id="claim-timeline-heading">Claim timeline</h2>
          <dl className={styles.claimDates}>
            <TimelineDate label="Created" value={claim.createdAt} />
            <TimelineDate label="Updated" value={claim.updatedAt} />
            {claim.reviewedAt ? <TimelineDate label="Reviewed" value={claim.reviewedAt} /> : null}
            {claim.withdrawnAt ? <TimelineDate label="Withdrawn" value={claim.withdrawnAt} /> : null}
            {claim.completedAt ? <TimelineDate label="Completed" value={claim.completedAt} /> : null}
          </dl>
        </section>

        <div className={styles.detailActions}>
          <button
            ref={refreshButtonRef}
            className={styles.secondaryButton}
            type="button"
            disabled={refreshing || withdrawing}
            onClick={() => void refreshClaim()}
          >
            {refreshing ? "Refreshing status" : "Refresh status"}
          </button>
          {refreshing ? (
            <p role="status" aria-live="polite">
              Refreshing claim status
            </p>
          ) : null}
          <LiveRegion message={refreshMessage} />
          <LiveRegion message={mutationMessage} />

          {canWithdraw ? (
            <div className={styles.withdrawalArea}>
              <button
                ref={withdrawTriggerRef}
                className={styles.dangerButton}
                type="button"
                disabled={withdrawing}
                aria-expanded={confirmingWithdrawal}
                onClick={() => setConfirmingWithdrawal(true)}
              >
                Withdraw claim
              </button>
              {confirmingWithdrawal ? (
                <section
                  className={styles.confirmation}
                  role="region"
                  aria-labelledby="withdraw-heading"
                >
                  <h2 id="withdraw-heading">Withdraw this claim?</h2>
                  <p>Withdrawal cannot be undone.</p>
                  <div className={styles.confirmationActions}>
                    <button
                      className={styles.dangerButton}
                      type="button"
                      disabled={withdrawing}
                      onClick={() => void confirmWithdrawal()}
                    >
                      {withdrawing ? "Withdrawing claim" : "Confirm withdrawal"}
                    </button>
                    <button
                      className={styles.secondaryButton}
                      type="button"
                      disabled={withdrawing}
                      onClick={() => {
                        setConfirmingWithdrawal(false);
                        withdrawTriggerRef.current?.focus();
                      }}
                    >
                      Keep claim
                    </button>
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </article>
    </div>
  );
}

function TimelineDate({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{dateTimeFormatter.format(new Date(value))}</dd>
    </div>
  );
}

function LiveRegion({ message }: { message: LiveMessage }) {
  if (!message) return null;
  return (
    <p
      className={styles.inlineMessage}
      role={message.kind}
      aria-live={message.kind === "status" ? "polite" : undefined}
    >
      {message.text}
    </p>
  );
}

function SafeDetailState({
  heading,
  message,
  href,
  linkText,
  alert = false,
}: {
  heading: string;
  message: string;
  href: string;
  linkText: string;
  alert?: boolean;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section
      className={styles.statePanel}
      role={alert ? "alert" : "status"}
      aria-live={alert ? undefined : "polite"}
      aria-labelledby="claim-detail-safe-heading"
    >
      <PageBackLink href={href}>{linkText}</PageBackLink>
      <h1 ref={headingRef} id="claim-detail-safe-heading" tabIndex={-1}>
        {heading}
      </h1>
      <p>{message}</p>
    </section>
  );
}
