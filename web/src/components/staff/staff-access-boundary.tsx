"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useAuthSession } from "@/components/auth/auth-session-provider";
import { PageBackLink } from "@/components/page-back-link";

import styles from "../claims/staff-claim-review.module.css";

export type StaffAccessCopy = {
  checking: string;
  confirmed: string;
  unavailableHeading: string;
  forbiddenHeading: string;
  forbiddenDescription: string;
  workspaceLabel: string;
};

export function StaffAccessBoundary({
  children,
  copy,
}: {
  children: ReactNode;
  copy: StaffAccessCopy;
}) {
  const router = useRouter();
  const session = useAuthSession();
  const [retryPhase, setRetryPhase] = useState<
    "idle" | "checking" | "settled"
  >("idle");
  const [retryOutcome, setRetryOutcome] = useState<{
    stateKey: string;
    message: string;
  } | null>(null);
  const retryInFlight = useRef(false);
  const retryButtonRef = useRef<HTMLButtonElement>(null);
  const liveRegionRef = useRef<HTMLParagraphElement>(null);
  const forbiddenHeadingRef = useRef<HTMLHeadingElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const previousAccountId = useRef<string | null>(null);
  const hasAuthenticatedUser =
    session.status === "authenticated" && session.user !== null;
  const hasStaffAccess =
    session.status === "authenticated" &&
    session.user !== null &&
    session.user.status === "active" &&
    (session.user.role === "staff" || session.user.role === "administrator");
  const accountId = hasStaffAccess ? session.user?.id ?? null : null;
  const accessStateKey = accountId
    ? `authorised:${accountId}`
    : session.status === "authenticated" && session.user
      ? `forbidden:${session.user.id}`
      : session.status;
  const retryResult = hasStaffAccess
    ? copy.confirmed
    : session.status === "unavailable"
      ? "Session check is still unavailable. Try again."
      : session.status === "unauthenticated"
        ? "Taking you to sign in"
        : hasAuthenticatedUser
          ? copy.forbiddenHeading
          : copy.checking;
  const defaultAnnouncement =
    session.status === "unavailable"
      ? copy.unavailableHeading
      : session.status === "unauthenticated"
        ? "Taking you to sign in"
        : session.status === "loading" || !session.user
          ? copy.checking
          : hasStaffAccess
            ? ""
            : copy.forbiddenHeading;
  const announcement =
    retryPhase === "checking"
      ? copy.checking
      : retryPhase === "settled"
        ? retryResult
        : retryOutcome?.stateKey === accessStateKey
          ? retryOutcome.message
          : defaultAnnouncement;
  const showTransition =
    retryPhase === "checking" ||
    session.status === "loading" ||
    session.status === "unauthenticated" ||
    (session.status === "authenticated" && !session.user);

  useEffect(() => {
    if (session.status === "unauthenticated") router.replace("/login");
  }, [router, session.status]);

  useEffect(() => {
    if (retryPhase === "checking") {
      liveRegionRef.current?.focus();
      return;
    }
    if (retryPhase !== "settled") return;

    if (hasStaffAccess) workspaceRef.current?.focus();
    else if (session.status === "unavailable") retryButtonRef.current?.focus();
    else if (hasAuthenticatedUser) forbiddenHeadingRef.current?.focus();
    else liveRegionRef.current?.focus();

    const timeoutId = window.setTimeout(() => {
      setRetryOutcome({ stateKey: accessStateKey, message: retryResult });
      setRetryPhase("idle");
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [
    accessStateKey,
    hasAuthenticatedUser,
    hasStaffAccess,
    retryPhase,
    retryResult,
    session.status,
  ]);

  useEffect(() => {
    const previous = previousAccountId.current;
    previousAccountId.current = accountId;
    if (previous && previous !== accountId) {
      if (accountId) workspaceRef.current?.focus();
      const timeoutId = window.setTimeout(() => setRetryOutcome(null), 0);
      return () => window.clearTimeout(timeoutId);
    }
  }, [accountId]);

  async function handleRetry() {
    if (retryInFlight.current) return;
    retryInFlight.current = true;
    setRetryOutcome(null);
    setRetryPhase("checking");
    try {
      await session.refreshSession();
    } catch {
      // The boundary reports only the safe session outcome.
    } finally {
      retryInFlight.current = false;
      setRetryPhase("settled");
    }
  }

  let content: ReactNode = null;
  if (!showTransition && session.status === "unavailable") {
    content = (
      <section
        className={styles.statePanel}
        aria-labelledby="staff-session-error"
      >
        <h1 id="staff-session-error">{copy.unavailableHeading}</h1>
        <p>Your session may still be active. Retry when the service is available.</p>
        <button
          ref={retryButtonRef}
          type="button"
          onClick={() => void handleRetry()}
        >
          Retry session check
        </button>
      </section>
    );
  } else if (!showTransition && hasAuthenticatedUser && !hasStaffAccess) {
    content = (
      <section className={styles.statePanel} aria-labelledby="staff-permission">
        <PageBackLink href="/dashboard">Back to dashboard</PageBackLink>
        <h1
          ref={forbiddenHeadingRef}
          id="staff-permission"
          tabIndex={retryPhase === "settled" ? -1 : undefined}
        >
          {copy.forbiddenHeading}
        </h1>
        <p>{copy.forbiddenDescription}</p>
      </section>
    );
  } else if (!showTransition && hasStaffAccess && session.user) {
    content = (
      <Fragment key={session.user.id}>
        <div
          ref={workspaceRef}
          className={styles.authorizedContent}
          role="region"
          aria-label={copy.workspaceLabel}
          tabIndex={-1}
        >
          {children}
        </div>
      </Fragment>
    );
  }

  return (
    <>
      <p
        ref={liveRegionRef}
        className={showTransition ? styles.loading : styles.visuallyHidden}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        tabIndex={showTransition ? -1 : undefined}
      >
        {announcement}
      </p>
      {content}
    </>
  );
}
