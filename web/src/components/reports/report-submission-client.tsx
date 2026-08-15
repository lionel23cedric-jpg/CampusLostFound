"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuthSession } from "@/components/auth/auth-session-provider";
import {
  BrowserReportError,
  getReportCampusLocations,
  getReportCategories,
  type CreatedReport,
  type ReportCampusLocation,
  type ReportCategory,
} from "@/lib/reports/browser-client";

import { ReportForm } from "./report-form";
import { ReportSuccess } from "./report-success";
import styles from "./report-submission.module.css";

type ReferenceState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "ready";
      categories: ReportCategory[];
      campusLocations: ReportCampusLocation[];
    }
  | { status: "error" };

export function ReportSubmissionClient() {
  const router = useRouter();
  const { status, user, refreshSession } = useAuthSession();
  const [permissionLostFor, setPermissionLostFor] = useState<string>();

  const handleAuthenticationRequired = useCallback(() => {
    router.replace("/login");
  }, [router]);
  const handlePermissionLost = useCallback((accountId: string) => {
    setPermissionLostFor(accountId);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [router, status]);

  if (status === "unavailable") {
    return (
      <section
        className={styles.statePanel}
        aria-labelledby="report-session-error"
        role="alert"
      >
        <p className={styles.kicker}>Account check</p>
        <h1 id="report-session-error">We could not check your account</h1>
        <p>Your session may still be active. Retry when the service is available.</p>
        <button
          className={styles.primaryButton}
          type="button"
          onClick={() => void refreshSession()}
        >
          Retry session check
        </button>
      </section>
    );
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

  const accountId =
    user?.role === "student" && user.status === "active" ? user.id : undefined;

  if (!accountId || permissionLostFor === accountId) {
    return (
      <section
        className={styles.statePanel}
        aria-labelledby="report-permission-heading"
        role="alert"
      >
        <p className={styles.kicker}>Student reports</p>
        <h1 id="report-permission-heading">Report submission unavailable</h1>
        <p>Only active student accounts can submit lost and found reports.</p>
        <Link className={styles.secondaryLink} href="/dashboard">
          Back to dashboard
        </Link>
      </section>
    );
  }

  return (
    <ActiveReportSubmission
      key={accountId}
      accountId={accountId}
      onAuthenticationRequired={handleAuthenticationRequired}
      onPermissionLost={handlePermissionLost}
    />
  );
}

function ActiveReportSubmission({
  accountId,
  onAuthenticationRequired,
  onPermissionLost,
}: {
  accountId: string;
  onAuthenticationRequired: () => void;
  onPermissionLost: (accountId: string) => void;
}) {
  const [referenceState, setReferenceState] = useState<ReferenceState>({
    status: "idle",
  });
  const [createdReport, setCreatedReport] = useState<CreatedReport>();
  const [formKey, setFormKey] = useState(0);
  const requestId = useRef(0);
  const isMounted = useRef(false);

  const loadReferences = useCallback(async (blocking = true) => {
    if (!isMounted.current) return;

    const currentRequest = ++requestId.current;
    if (blocking) setReferenceState({ status: "loading" });

    try {
      const [categories, campusLocations] = await Promise.all([
        getReportCategories(),
        getReportCampusLocations(),
      ]);
      if (!isMounted.current || currentRequest !== requestId.current) return;

      if (categories.length > 0 && campusLocations.length > 0) {
        setReferenceState({ status: "ready", categories, campusLocations });
      } else {
        setReferenceState({ status: "error" });
      }
    } catch (error) {
      if (!isMounted.current || currentRequest !== requestId.current) return;

      if (error instanceof BrowserReportError) {
        if (error.status === 401 || error.code === "AUTHENTICATION_REQUIRED") {
          onAuthenticationRequired();
          return;
        }

        if (
          error.status === 403 ||
          error.code === "ACCOUNT_UNAVAILABLE" ||
          error.code === "REPORT_CREATION_FORBIDDEN"
        ) {
          onPermissionLost(accountId);
          return;
        }
      }

      if (blocking) setReferenceState({ status: "error" });
    }
  }, [accountId, onAuthenticationRequired, onPermissionLost]);

  useEffect(() => {
    isMounted.current = true;
    const timeoutId = window.setTimeout(() => {
      void loadReferences();
    }, 0);

    return () => {
      isMounted.current = false;
      window.clearTimeout(timeoutId);
      requestId.current += 1;
    };
  }, [loadReferences]);

  if (createdReport) {
    return (
      <ReportSuccess
        report={createdReport}
        onSubmitAnother={() => {
          setCreatedReport(undefined);
          setFormKey((current) => current + 1);
        }}
      />
    );
  }

  if (referenceState.status === "idle" || referenceState.status === "loading") {
    return (
      <section className={styles.loading} role="status" aria-live="polite">
        <span>Loading report options</span>
        <span className={styles.skeleton} aria-hidden="true" />
        <span className={styles.skeletonShort} aria-hidden="true" />
      </section>
    );
  }

  if (referenceState.status === "error") {
    return (
      <section
        className={styles.statePanel}
        aria-labelledby="report-options-error"
        role="alert"
      >
        <p className={styles.kicker}>Report setup</p>
        <h1 id="report-options-error">Report options unavailable</h1>
        <p>
          We could not load the current categories and campus locations. Please
          try again.
        </p>
        <button
          className={styles.primaryButton}
          type="button"
          onClick={() => void loadReferences()}
        >
          Retry report options
        </button>
      </section>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.introduction}>
        <p className={styles.kicker}>Campus noticeboard</p>
        <h1>Report an item</h1>
        <p>
          Share the public details that may help find a match, then add private
          evidence that authorised staff can use to confirm ownership.
        </p>
      </header>
      <ReportForm
        key={`${accountId}-${formKey}`}
        categories={referenceState.categories}
        campusLocations={referenceState.campusLocations}
        onSuccess={(report) => {
          if (isMounted.current && report.reporterId === accountId) {
            setCreatedReport(report);
          }
        }}
        onAuthenticationRequired={() => {
          if (isMounted.current) onAuthenticationRequired();
        }}
        onPermissionLost={() => {
          if (isMounted.current) onPermissionLost(accountId);
        }}
        onReferenceUnavailable={() => loadReferences(false)}
      />
    </div>
  );
}
