"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuthSession } from "@/components/auth/auth-session-provider";
import {
  BrowserAdminOverviewError,
  getAdministratorOverview,
} from "@/lib/admin/browser-client";
import type { AdministratorOverview } from "@/lib/admin/overview-contract";

import styles from "./admin-overview.module.css";

type OverviewState =
  | { status: "loading" }
  | {
      status: "ready";
      data: AdministratorOverview;
      isRefreshing: boolean;
      refreshFailed: boolean;
    }
  | { status: "error" }
  | { status: "accessChanged" };

const reportMetrics = [
  [
    "submittedLost",
    "Lost submitted",
    "Non-draft lost reports submitted to Campus Find",
  ],
  [
    "submittedFound",
    "Found submitted",
    "Non-draft found reports submitted to Campus Find",
  ],
  ["submittedTotal", "Total submitted", "All submitted lost and found reports"],
  ["unresolved", "Unresolved", "Reports that remain open or claim pending"],
  ["recovered", "Recovered", "Reports resolved through the recovery workflow"],
  [
    "matched",
    "Matched",
    "Distinct reports with an approved or completed Claim",
  ],
] as const;

const claimMetrics = [
  ["pending", "Pending Claims", "Claims waiting for staff review"],
  ["approved", "Approved Claims", "Claims approved for handover"],
  ["rejected", "Rejected Claims", "Claims rejected after review"],
  ["withdrawn", "Withdrawn Claims", "Claims withdrawn by the claimant"],
  ["completed", "Completed Claims", "Claims with a recorded handover"],
  ["total", "Total Claims", "All Claims in the system"],
] as const;

const accountMetrics = [
  [
    "active",
    "Active accounts",
    "Accounts currently permitted to use Campus Find",
  ],
  ["suspended", "Suspended accounts", "Accounts temporarily unavailable"],
  ["deactivated", "Deactivated accounts", "Accounts no longer active"],
  ["total", "Total accounts", "All registered accounts"],
] as const;

const generatedAtFormatter = new Intl.DateTimeFormat("en-NZ", {
  dateStyle: "medium",
  timeStyle: "short",
});

type MetricEntries<T extends Record<string, number>> = ReadonlyArray<
  readonly [keyof T & string, string, string]
>;

function MetricList<T extends Record<string, number>>({
  entries,
  values,
}: {
  entries: MetricEntries<T>;
  values: T;
}) {
  return (
    <dl className={styles.metricGrid}>
      {entries.map(([key, label, description]) => (
        <div className={styles.metricCard} key={key}>
          <dt>{label}</dt>
          <dd>{values[key]}</dd>
          <p>{description}</p>
        </div>
      ))}
    </dl>
  );
}

export function AdminOverviewClient() {
  const router = useRouter();
  const { refreshSession } = useAuthSession();
  const [state, setState] = useState<OverviewState>({ status: "loading" });
  const mounted = useRef(false);
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const loadOverview = useCallback(
    async (mode: "initial" | "refresh") => {
      const currentRequest = ++requestId.current;
      controller.current?.abort();
      const nextController = new AbortController();
      controller.current = nextController;

      setState((current) =>
        mode === "refresh" && current.status === "ready"
          ? { ...current, isRefreshing: true, refreshFailed: false }
          : { status: "loading" },
      );

      try {
        const data = await getAdministratorOverview(nextController.signal);
        if (!mounted.current || requestId.current !== currentRequest) return;
        setState({
          status: "ready",
          data,
          isRefreshing: false,
          refreshFailed: false,
        });
      } catch (error) {
        if (
          !mounted.current ||
          requestId.current !== currentRequest ||
          nextController.signal.aborted
        ) {
          return;
        }

        if (error instanceof BrowserAdminOverviewError) {
          if (error.code === "AUTHENTICATION_REQUIRED") {
            setState({ status: "accessChanged" });
            await refreshSession().catch(() => undefined);
            if (mounted.current && requestId.current === currentRequest) {
              router.replace("/login");
            }
            return;
          }

          if (error.code === "ADMINISTRATOR_REQUIRED") {
            setState({ status: "accessChanged" });
            await refreshSession().catch(() => undefined);
            return;
          }
        }

        setState((current) =>
          mode === "refresh" && current.status === "ready"
            ? { ...current, isRefreshing: false, refreshFailed: true }
            : { status: "error" },
        );
      }
    },
    [refreshSession, router],
  );

  useEffect(() => {
    mounted.current = true;
    const timeoutId = window.setTimeout(() => {
      void loadOverview("initial");
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      mounted.current = false;
      requestId.current += 1;
      controller.current?.abort();
    };
  }, [loadOverview]);

  if (state.status === "loading") {
    return (
      <section className={styles.overview} aria-label="Administrator overview">
        <p className={styles.loadingOverview} role="status" aria-live="polite">
          Loading administrator overview
        </p>
        <div className={styles.skeletonGroup} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className={styles.statePanel} aria-labelledby="overview-error">
        <h1 id="overview-error">Administrator overview unavailable</h1>
        <p>We could not load the current system totals. Try again.</p>
        <button type="button" onClick={() => void loadOverview("initial")}>
          Retry overview
        </button>
      </section>
    );
  }

  if (state.status === "accessChanged") {
    return (
      <section className={styles.statePanel} aria-labelledby="overview-access-changed">
        <h1 id="overview-access-changed">Administrator access changed</h1>
        <p>Your account no longer has access to this overview.</p>
        <Link href="/dashboard">Back to dashboard</Link>
      </section>
    );
  }

  const { data } = state;
  const hasNoActivity =
    data.reports.submittedTotal === 0 &&
    data.claims.total === 0 &&
    data.accounts.total === 0;

  return (
    <article className={styles.overview}>
      <header className={styles.overviewHeader}>
        <div className={styles.headingCopy}>
          <Link className={styles.backLink} href="/dashboard">
            Back to dashboard
          </Link>
          <h1>Administrator overview</h1>
          <p>
            Monitor report recovery, ownership Claims and account availability
            from one privacy-safe snapshot.
          </p>
        </div>
        <div className={styles.overviewActions}>
          <p>
            Updated <time dateTime={data.generatedAt}>{generatedAtFormatter.format(new Date(data.generatedAt))}</time>
          </p>
          <button
            type="button"
            disabled={state.isRefreshing}
            aria-label={state.isRefreshing ? "Refreshing overview" : "Refresh overview"}
            onClick={() => void loadOverview("refresh")}
          >
            {state.isRefreshing ? "Refreshing" : "Refresh overview"}
          </button>
        </div>
      </header>

      {state.refreshFailed ? (
        <p className={styles.refreshAlert} role="alert">
          We could not refresh the overview. The last valid snapshot remains
          visible.
        </p>
      ) : null}

      {hasNoActivity ? (
        <p className={styles.zeroNotice}>No activity recorded yet</p>
      ) : null}

      <section className={`${styles.metricSection} ${styles.reportSection}`} aria-labelledby="report-overview">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="report-overview">Reports</h2>
            <p>Submitted reports and recovery outcomes.</p>
          </div>
          <div className={styles.sectionLinks}>
            <Link href="/admin/moderation">Review flagged reports</Link>
            <Link href="/admin/reference-data">Manage reference data</Link>
          </div>
        </div>
        <MetricList entries={reportMetrics} values={data.reports} />
      </section>

      <section className={styles.metricSection} aria-labelledby="claim-overview">
        <div className={styles.sectionHeading}>
          <h2 id="claim-overview">Ownership Claims</h2>
          <Link href="/staff/claims">Review ownership Claims</Link>
        </div>
        <MetricList entries={claimMetrics} values={data.claims} />
      </section>

      <section className={styles.metricSection} aria-labelledby="account-overview">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="account-overview">Accounts</h2>
            <p>Current access states across all registered accounts.</p>
          </div>
          <Link href="/admin/accounts">Manage accounts</Link>
        </div>
        <MetricList entries={accountMetrics} values={data.accounts} />
      </section>
    </article>
  );
}
