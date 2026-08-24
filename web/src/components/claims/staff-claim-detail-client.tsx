"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  ClaimBrowserError,
  type ClaimStatus,
} from "@/lib/claims/browser-client";
import {
  getStaffClaim,
  type StaffClaimDetail,
} from "@/lib/claims/staff-browser-client";

import styles from "./staff-claim-review.module.css";

type DetailState =
  | { status: "loading" }
  | { status: "redirecting" }
  | { status: "ready"; claim: StaffClaimDetail }
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

const reportStatusLabels: Record<StaffClaimDetail["report"]["status"], string> = {
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

export function StaffClaimDetailClient({ claimId }: { claimId: string }) {
  return <StaffClaimDetailSurface key={claimId} claimId={claimId} />;
}

function StaffClaimDetailSurface({ claimId }: { claimId: string }) {
  const router = useRouter();
  const [detailState, setDetailState] = useState<DetailState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<LiveMessage>(null);
  const mounted = useRef(false);
  const requestId = useRef(0);
  const refreshId = useRef(0);
  const refreshInFlight = useRef(false);

  const mapAccessFailure = useCallback(
    (error: unknown) => {
      if (!(error instanceof ClaimBrowserError)) return false;
      if (error.status === 401 || error.code === "AUTHENTICATION_REQUIRED") {
        setDetailState({ status: "redirecting" });
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
      return false;
    },
    [router],
  );

  const loadClaim = useCallback(
    async ({ preserveDetail = false }: { preserveDetail?: boolean } = {}) => {
      const currentRequest = ++requestId.current;
      if (!preserveDetail) setDetailState({ status: "loading" });

      try {
        const claim = await getStaffClaim(claimId);
        if (!mounted.current || currentRequest !== requestId.current) return;
        setDetailState({ status: "ready", claim });
        if (preserveDetail) {
          setRefreshMessage({ kind: "status", text: "Claim review refreshed." });
        }
      } catch (error) {
        if (!mounted.current || currentRequest !== requestId.current) return;
        if (mapAccessFailure(error)) return;
        if (preserveDetail) {
          setRefreshMessage({
            kind: "alert",
            text: "We could not refresh this Claim. Please try again.",
          });
          return;
        }
        setDetailState({ status: "error" });
      }
    },
    [claimId, mapAccessFailure],
  );

  useEffect(() => {
    mounted.current = true;
    const timeoutId = window.setTimeout(() => void loadClaim(), 0);

    return () => {
      window.clearTimeout(timeoutId);
      mounted.current = false;
      requestId.current += 1;
      refreshId.current += 1;
      refreshInFlight.current = false;
    };
  }, [loadClaim]);

  async function refreshClaim() {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    const currentRefresh = ++refreshId.current;
    setRefreshing(true);
    setRefreshMessage(null);

    try {
      await loadClaim({ preserveDetail: true });
    } finally {
      if (mounted.current && currentRefresh === refreshId.current) {
        refreshInFlight.current = false;
        setRefreshing(false);
      }
    }
  }

  if (detailState.status === "loading" || detailState.status === "redirecting") {
    return (
      <p className={styles.loading} role="status" aria-live="polite">
        {detailState.status === "redirecting"
          ? "Taking you to sign in"
          : "Loading Claim review"}
      </p>
    );
  }

  if (detailState.status === "not-found") {
    return (
      <SafeDetailState
        heading="Claim not found"
        message="This Claim is unavailable or no longer exists."
        href="/staff/claims"
        linkText="Back to Claim reviews"
      />
    );
  }

  if (detailState.status === "forbidden") {
    return (
      <SafeDetailState
        heading="Claim review access unavailable"
        message="Your account cannot review this ownership Claim."
        href="/dashboard"
        linkText="Back to dashboard"
        alert
      />
    );
  }

  if (detailState.status === "error") {
    return <DetailErrorState retry={() => void loadClaim()} />;
  }

  const { claim } = detailState;

  return (
    <div className={styles.detailPage}>
      <Link className={styles.backLink} href="/staff/claims">
        Back to Claim reviews
      </Link>

      <article className={styles.detailPanel} aria-labelledby="staff-claim-detail-heading">
        <header className={styles.detailHeader}>
          <div>
            <h1 id="staff-claim-detail-heading">Claim review</h1>
            <p className={styles.detailTitle}>{claim.report.title}</p>
          </div>
          <p className={styles.claimStatus}>
            Claim status: <strong>{statusLabels[claim.status]}</strong>
          </p>
        </header>

        <section
          className={styles.detailSection}
          aria-labelledby="staff-claim-status-heading"
        >
          <h2 id="staff-claim-status-heading">Claim status</h2>
          <dl className={styles.detailFacts}>
            <Fact label="Report type">
              {claim.report.reportType === "found" ? "Found report" : "Lost report"}
            </Fact>
            <Fact label="Report status">
              Report status: {reportStatusLabels[claim.report.status]}
            </Fact>
          </dl>
          <Link
            className={styles.secondaryLink}
            href={`/reports/${encodeURIComponent(claim.report.id)}`}
          >
            View report
          </Link>
        </section>

        <section
          className={styles.detailSection}
          aria-labelledby="staff-claim-contact-heading"
        >
          <h2 id="staff-claim-contact-heading">Claimant contact</h2>
          <dl className={styles.detailFacts}>
            <Fact label="Claimant">{claim.claimant.displayName}</Fact>
            <Fact label="Email address">{claim.claimant.email}</Fact>
            <Fact label="Preferred contact">
              {claim.claimant.preferredContactMethod === "email" ? "Email" : "In-app"}
            </Fact>
          </dl>
        </section>

        <section
          className={styles.detailSection}
          aria-labelledby="staff-claim-verification-heading"
        >
          <h2 id="staff-claim-verification-heading">Verification summary</h2>
          <p className={styles.verificationSummary}>
            {claim.verification.matchedCount} of {claim.verification.questionCount} answers matched
          </p>
        </section>

        <section
          className={styles.detailSection}
          aria-labelledby="staff-claim-evidence-heading"
        >
          <h2 id="staff-claim-evidence-heading">Ownership evidence</h2>
          <ol className={styles.evidenceList}>
            {claim.responses.map((response) => (
              <li key={response.questionIndex}>
                <p className={styles.evidenceQuestion}>{response.question}</p>
                <p className={styles.evidenceAnswer}>
                  <strong>Answer:</strong> {response.answer}
                </p>
                <p className={styles.matchResult}>
                  Result: {response.matched ? "Matched" : "Not matched"}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {claim.reviewNote ? (
          <section
            className={styles.detailSection}
            aria-labelledby="staff-claim-note-heading"
          >
            <h2 id="staff-claim-note-heading">Internal review note</h2>
            <p className={styles.reviewNote}>{claim.reviewNote}</p>
          </section>
        ) : null}

        <section
          className={styles.detailSection}
          aria-labelledby="staff-claim-timeline-heading"
        >
          <h2 id="staff-claim-timeline-heading">Claim timeline</h2>
          <dl className={styles.detailFacts}>
            <TimelineDate label="Created" value={claim.createdAt} />
            <TimelineDate label="Updated" value={claim.updatedAt} />
            {claim.reviewedAt ? <TimelineDate label="Reviewed" value={claim.reviewedAt} /> : null}
            {claim.withdrawnAt ? <TimelineDate label="Withdrawn" value={claim.withdrawnAt} /> : null}
            {claim.completedAt ? <TimelineDate label="Completed" value={claim.completedAt} /> : null}
          </dl>
        </section>

        <div className={styles.detailActions}>
          <button
            className={styles.secondaryButton}
            type="button"
            disabled={refreshing}
            onClick={() => void refreshClaim()}
          >
            {refreshing ? "Refreshing review" : "Refresh review"}
          </button>
          {refreshing ? (
            <p role="status" aria-live="polite">
              Refreshing Claim review
            </p>
          ) : null}
          <LiveRegion message={refreshMessage} />
        </div>
      </article>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function TimelineDate({ label, value }: { label: string; value: string }) {
  return <Fact label={label}>{dateTimeFormatter.format(new Date(value))}</Fact>;
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

function DetailErrorState({ retry }: { retry: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section
      className={styles.statePanel}
      role="alert"
      aria-labelledby="staff-claim-detail-error-heading"
    >
      <h1 ref={headingRef} id="staff-claim-detail-error-heading" tabIndex={-1}>
        We could not load this Claim
      </h1>
      <p>Retry when the Claim service is available.</p>
      <button type="button" onClick={retry}>
        Retry Claim review
      </button>
    </section>
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
      aria-labelledby="staff-claim-detail-safe-heading"
    >
      <h1 ref={headingRef} id="staff-claim-detail-safe-heading" tabIndex={-1}>
        {heading}
      </h1>
      <p>{message}</p>
      <Link href={href}>{linkText}</Link>
    </section>
  );
}
