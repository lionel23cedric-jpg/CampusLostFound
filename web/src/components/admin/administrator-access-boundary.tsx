"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuthSession } from "@/components/auth/auth-session-provider";

import styles from "./admin-overview.module.css";

export function AdministratorAccessBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const session = useAuthSession();
  const [retryPhase, setRetryPhase] = useState<"idle" | "checking" | "settled">(
    "idle",
  );
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
  const hasAdministratorAccess =
    session.status === "authenticated" &&
    session.user !== null &&
    session.user.status === "active" &&
    session.user.role === "administrator";
  const accountId = hasAdministratorAccess ? session.user?.id ?? null : null;
  const accessStateKey = accountId
    ? `authorised:${accountId}`
    : session.status === "authenticated" && session.user
      ? `forbidden:${session.user.id}`
      : session.status;
  const retryResult = hasAdministratorAccess
    ? "Administrator access confirmed"
    : session.status === "unavailable"
      ? "Session check is still unavailable. Try again."
      : session.status === "unauthenticated"
        ? "Taking you to sign in"
        : hasAuthenticatedUser
          ? "Administrator access unavailable"
          : "Checking administrator access";
  const defaultAnnouncement =
    session.status === "unavailable"
      ? "We could not check your account"
      : session.status === "unauthenticated"
        ? "Taking you to sign in"
        : session.status === "loading" || !session.user
          ? "Checking administrator access"
          : hasAdministratorAccess
            ? ""
            : "Administrator access unavailable";
  const announcement =
    retryPhase === "checking"
      ? "Checking administrator access"
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
    if (session.status === "unauthenticated") {
      router.replace("/login");
    }
  }, [router, session.status]);

  useEffect(() => {
    if (retryPhase === "checking") {
      liveRegionRef.current?.focus();
      return;
    }

    if (retryPhase !== "settled") return;

    if (hasAdministratorAccess) {
      workspaceRef.current?.focus();
    } else if (session.status === "unavailable") {
      retryButtonRef.current?.focus();
    } else if (hasAuthenticatedUser) {
      forbiddenHeadingRef.current?.focus();
    } else {
      liveRegionRef.current?.focus();
    }

    const timeoutId = window.setTimeout(() => {
      setRetryOutcome({ stateKey: accessStateKey, message: retryResult });
      setRetryPhase("idle");
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [
    accessStateKey,
    hasAdministratorAccess,
    hasAuthenticatedUser,
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
      // The boundary exposes only its approved, privacy-safe retry result.
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
        aria-labelledby="administrator-session-error"
      >
        <h1 id="administrator-session-error">We could not check your account</h1>
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
  } else if (
    !showTransition &&
    hasAuthenticatedUser &&
    !hasAdministratorAccess
  ) {
    content = (
      <section
        className={styles.statePanel}
        aria-labelledby="administrator-permission"
      >
        <h1
          ref={forbiddenHeadingRef}
          id="administrator-permission"
          tabIndex={retryPhase === "settled" ? -1 : undefined}
        >
          Administrator access unavailable
        </h1>
        <p>Only active administrator accounts can view system statistics.</p>
        <Link href="/dashboard">Back to dashboard</Link>
      </section>
    );
  } else if (!showTransition && hasAdministratorAccess && session.user) {
    content = (
      <Fragment key={session.user.id}>
        <div
          ref={workspaceRef}
          className={styles.authorizedContent}
          role="region"
          aria-label="Administrator overview workspace"
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
