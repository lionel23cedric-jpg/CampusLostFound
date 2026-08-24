"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

import {
  ClaimBrowserError,
  type ClaimStatus,
} from "@/lib/claims/browser-client";
import {
  completeStaffClaim,
  decideStaffClaim,
  getStaffClaim,
  type StaffClaimDecision,
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

type Confirmation =
  | { kind: "approve"; trigger: HTMLButtonElement }
  | { kind: "reject"; trigger: HTMLButtonElement }
  | { kind: "complete"; trigger: HTMLButtonElement }
  | null;

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
  const [reviewNote, setReviewNote] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [mutating, setMutating] = useState(false);
  const [actionMessage, setActionMessage] = useState<LiveMessage>(null);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const mounted = useRef(false);
  const requestId = useRef(0);
  const refreshId = useRef(0);
  const refreshInFlight = useRef(false);
  const mutationId = useRef(0);
  const mutationInFlight = useRef(false);
  const restoreFocusAfterMutation = useRef<HTMLButtonElement>(null);
  const confirmationHeadingRef = useRef<HTMLHeadingElement>(null);
  const statusHeadingRef = useRef<HTMLHeadingElement>(null);
  const refreshButtonRef = useRef<HTMLButtonElement>(null);

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
        setReviewNote(claim.reviewNote ?? "");
        setRefreshRequired(false);
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
      mutationId.current += 1;
      mutationInFlight.current = false;
    };
  }, [loadClaim]);

  useEffect(() => {
    if (confirmation) confirmationHeadingRef.current?.focus();
  }, [confirmation]);

  useEffect(() => {
    if (!mutating && restoreFocusAfterMutation.current) {
      restoreFocusAfterMutation.current.focus();
      restoreFocusAfterMutation.current = null;
    }
  }, [mutating]);

  async function refreshClaim() {
    if (
      refreshInFlight.current ||
      mutationInFlight.current ||
      confirmation !== null
    ) {
      return;
    }
    refreshInFlight.current = true;
    const currentRefresh = ++refreshId.current;
    setRefreshing(true);
    setRefreshMessage(null);
    setActionMessage(null);

    try {
      await loadClaim({ preserveDetail: true });
    } finally {
      if (mounted.current && currentRefresh === refreshId.current) {
        refreshInFlight.current = false;
        setRefreshing(false);
      }
    }
  }

  function openConfirmation(
    kind: Exclude<Confirmation, null>["kind"],
    trigger: HTMLButtonElement,
  ) {
    if (
      refreshInFlight.current ||
      mutationInFlight.current ||
      refreshRequired
    ) {
      return;
    }
    setActionMessage(null);
    setConfirmation({ kind, trigger });
  }

  function closeConfirmation(restoreFocus = true) {
    const trigger = confirmation?.trigger;
    setConfirmation(null);
    if (restoreFocus) trigger?.focus();
  }

  async function submitConfirmation() {
    if (
      !confirmation ||
      refreshInFlight.current ||
      mutationInFlight.current ||
      refreshRequired ||
      detailState.status !== "ready"
    ) {
      return;
    }

    const activeConfirmation = confirmation;
    if (
      activeConfirmation.kind !== "complete" &&
      reviewNote.length > 1000
    ) {
      setActionMessage({
        kind: "alert",
        text: "Review notes must be 1000 characters or fewer.",
      });
      closeConfirmation();
      return;
    }
    if (
      activeConfirmation.kind === "complete" &&
      detailState.claim.status !== "approved"
    ) {
      return;
    }

    mutationInFlight.current = true;
    const currentMutation = ++mutationId.current;
    setMutating(true);
    setActionMessage(null);

    try {
      let claim: StaffClaimDetail;
      if (activeConfirmation.kind === "complete") {
        claim = await completeStaffClaim(claimId);
      } else {
        const input: StaffClaimDecision = {
          decision: activeConfirmation.kind,
          reviewNote: reviewNote.trim() || null,
        };
        claim = await decideStaffClaim(claimId, input);
      }

      if (!mounted.current || currentMutation !== mutationId.current) return;
      setDetailState({ status: "ready", claim });
      setReviewNote(claim.reviewNote ?? "");
      setConfirmation(null);
      setActionMessage({
        kind: "status",
        text:
          activeConfirmation.kind === "complete"
            ? "Handover recorded as completed."
            : "Claim decision recorded.",
      });
      window.setTimeout(() => statusHeadingRef.current?.focus(), 0);
    } catch (error) {
      if (!mounted.current || currentMutation !== mutationId.current) return;
      setConfirmation(null);
      if (mapAccessFailure(error)) return;

      const isConflict =
        error instanceof ClaimBrowserError &&
        error.code === "CLAIM_STATE_CONFLICT";
      const isValidation =
        error instanceof ClaimBrowserError && error.code === "VALIDATION_ERROR";
      if (isConflict) setRefreshRequired(true);
      setActionMessage({
        kind: "alert",
        text: isConflict
          ? activeConfirmation.kind === "complete"
            ? "This Claim changed. Refresh it before recording the handover."
            : "This Claim changed. Refresh it before making another decision."
          : isValidation && activeConfirmation.kind !== "complete"
            ? "Review the decision and internal note, then try again."
            : activeConfirmation.kind === "complete"
              ? "We could not complete this handover. Please try again."
              : "We could not update this Claim. Please try again.",
      });
      restoreFocusAfterMutation.current = isConflict
        ? (refreshButtonRef.current ?? activeConfirmation.trigger)
        : activeConfirmation.trigger;
    } finally {
      if (mounted.current && currentMutation === mutationId.current) {
        mutationInFlight.current = false;
        setMutating(false);
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
          <h2
            ref={statusHeadingRef}
            className={styles.claimStatus}
            tabIndex={-1}
          >
            Claim status: <strong>{statusLabels[claim.status]}</strong>
          </h2>
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

        {claim.status === "pending" ? (
          <section
            className={styles.actionSection}
            aria-labelledby="staff-claim-decision-heading"
          >
            <h2 id="staff-claim-decision-heading">Review decision</h2>
            <label className={styles.noteField}>
              <span>Internal review note</span>
              <textarea
                value={reviewNote}
                maxLength={1000}
                disabled={refreshing || mutating || refreshRequired}
                aria-describedby="staff-claim-note-help staff-claim-note-count"
                aria-invalid={reviewNote.length > 1000}
                onChange={(event) => setReviewNote(event.currentTarget.value)}
              />
            </label>
            <div className={styles.noteMeta}>
              <p id="staff-claim-note-help">
                Optional. Keep this note factual and relevant to the review.
              </p>
              <p id="staff-claim-note-count">
                {reviewNote.length} of 1000 characters
              </p>
            </div>
            <div className={styles.decisionButtons}>
              <button
                className={styles.primaryButton}
                type="button"
                disabled={refreshing || mutating || refreshRequired}
                onClick={(event) =>
                  openConfirmation("approve", event.currentTarget)
                }
              >
                Approve Claim
              </button>
              <button
                className={styles.dangerButton}
                type="button"
                disabled={refreshing || mutating || refreshRequired}
                onClick={(event) =>
                  openConfirmation("reject", event.currentTarget)
                }
              >
                Reject Claim
              </button>
            </div>
            {confirmation?.kind === "approve" ||
            confirmation?.kind === "reject" ? (
              <ConfirmationPanel
                kind={confirmation.kind}
                headingRef={confirmationHeadingRef}
                mutating={mutating}
                confirm={() => void submitConfirmation()}
                cancel={() => closeConfirmation()}
              />
            ) : null}
          </section>
        ) : null}

        {claim.status === "approved" ? (
          <section
            className={styles.actionSection}
            aria-labelledby="staff-claim-completion-heading"
          >
            <h2 id="staff-claim-completion-heading">Handover</h2>
            <p>Record completion after the item has been returned.</p>
            <button
              className={styles.secondaryButton}
              type="button"
              disabled={refreshing || mutating || refreshRequired}
              onClick={(event) =>
                openConfirmation("complete", event.currentTarget)
              }
            >
              Mark handover complete
            </button>
            {confirmation?.kind === "complete" ? (
              <ConfirmationPanel
                kind="complete"
                headingRef={confirmationHeadingRef}
                mutating={mutating}
                confirm={() => void submitConfirmation()}
                cancel={() => closeConfirmation()}
              />
            ) : null}
          </section>
        ) : null}

        {refreshRequired ? (
          <p className={styles.workflowLock} role="status">
            Refresh this Claim before making another review action.
          </p>
        ) : null}

        <LiveRegion message={actionMessage} />

        <div className={styles.detailActions}>
          <button
            ref={refreshButtonRef}
            className={styles.secondaryButton}
            type="button"
            disabled={refreshing || mutating || confirmation !== null}
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

function ConfirmationPanel({
  kind,
  headingRef,
  mutating,
  confirm,
  cancel,
}: {
  kind: Exclude<Confirmation, null>["kind"];
  headingRef: RefObject<HTMLHeadingElement | null>;
  mutating: boolean;
  confirm: () => void;
  cancel: () => void;
}) {
  const heading =
    kind === "approve"
      ? "Approve this Claim?"
      : kind === "reject"
        ? "Reject this Claim?"
        : "Record this handover as complete?";
  const message =
    kind === "approve"
      ? "All other pending Claims for this report will be rejected automatically."
      : kind === "reject"
        ? "The current Claim will become rejected."
        : "This records the item as recovered and cannot be undone here.";
  const confirmLabel =
    kind === "approve"
      ? "Confirm approval"
      : kind === "reject"
        ? "Confirm rejection"
        : "Confirm handover completion";

  return (
    <div
      className={styles.confirmationPanel}
      role="region"
      aria-labelledby="staff-claim-confirmation-heading"
    >
      <h3
        ref={headingRef}
        id="staff-claim-confirmation-heading"
        tabIndex={-1}
      >
        {heading}
      </h3>
      <p>{message}</p>
      <div className={styles.confirmationButtons}>
        <button
          className={
            kind === "reject" ? styles.dangerButton : styles.primaryButton
          }
          type="button"
          disabled={mutating}
          onClick={confirm}
        >
          {mutating ? "Saving review" : confirmLabel}
        </button>
        <button
          className={styles.secondaryButton}
          type="button"
          disabled={mutating}
          onClick={cancel}
        >
          Cancel
        </button>
      </div>
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
