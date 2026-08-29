"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { isInternalReportImagePath } from "@/lib/reports/photo-reference";
import {
  StaffReportBrowserError,
  getStaffReport,
  storeStaffReport,
  verifyStaffReport,
  type StaffReportDetail,
} from "@/lib/staff-reports/browser-client";

import styles from "./staff-report-handling.module.css";

type DetailState =
  | { status: "loading" | "redirecting" | "not-found" | "forbidden" | "error" }
  | { status: "ready"; report: StaffReportDetail };
type Message = { kind: "status" | "alert"; text: string } | null;

const objectIdPattern = /^[a-f\d]{24}$/i;
const dateTimeFormatter = new Intl.DateTimeFormat("en-NZ", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Pacific/Auckland",
});
const labels = {
  status: { open: "Open", claim_pending: "Claim pending", resolved: "Resolved" },
  verification: { pending: "Pending", verified: "Verified" },
  custody: {
    not_applicable: "Not applicable",
    not_held: "Not held",
    stored: "Stored",
    released: "Released",
  },
} as const;

export function StaffReportDetailClient({ reportId }: { reportId: string }) {
  return <StaffReportDetailSurface key={reportId} reportId={reportId} />;
}

function StaffReportDetailSurface({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [state, setState] = useState<DetailState>({ status: "loading" });
  const [storageLocation, setStorageLocation] = useState("");
  const [mutating, setMutating] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const mounted = useRef(false);
  const requestId = useRef(0);
  const mutationInFlight = useRef(false);
  const conflictHeadingRef = useRef<HTMLHeadingElement>(null);

  const mapFailure = useCallback(
    (error: unknown) => {
      if (!(error instanceof StaffReportBrowserError)) return false;
      if (error.status === 401) {
        setState({ status: "redirecting" });
        router.replace("/login");
        return true;
      }
      if (error.status === 403) {
        setState({ status: "forbidden" });
        return true;
      }
      if (error.status === 404) {
        setState({ status: "not-found" });
        return true;
      }
      return false;
    },
    [router],
  );

  const loadReport = useCallback(
    async (signal?: AbortSignal) => {
      if (!objectIdPattern.test(reportId)) {
        setState({ status: "not-found" });
        return;
      }
      const currentRequest = ++requestId.current;
      setState({ status: "loading" });
      try {
        const report = await getStaffReport(reportId, signal);
        if (!mounted.current || signal?.aborted || currentRequest !== requestId.current) return;
        setState({ status: "ready", report });
        setStorageLocation(report.handling.storageLocation ?? "");
      } catch (error) {
        if (!mounted.current || signal?.aborted || currentRequest !== requestId.current) return;
        if (!mapFailure(error)) setState({ status: "error" });
      }
    },
    [mapFailure, reportId],
  );

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => void loadReport(controller.signal), 0);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
      mounted.current = false;
      requestId.current += 1;
      mutationInFlight.current = false;
    };
  }, [loadReport]);

  async function runMutation(
    operation: (report: StaffReportDetail) => Promise<StaffReportDetail>,
    successText: string,
  ) {
    if (mutationInFlight.current || state.status !== "ready") return;
    mutationInFlight.current = true;
    setMutating(true);
    setMessage(null);
    try {
      const report = await operation(state.report);
      if (!mounted.current) return;
      setState({ status: "ready", report });
      setStorageLocation(report.handling.storageLocation ?? "");
      setMessage({ kind: "status", text: successText });
    } catch (error) {
      if (!mounted.current) return;
      if (mapFailure(error)) return;
      if (error instanceof StaffReportBrowserError && error.status === 409) {
        try {
          const latest = await getStaffReport(reportId);
          if (!mounted.current) return;
          setState({ status: "ready", report: latest });
          setStorageLocation(latest.handling.storageLocation ?? "");
          setMessage({
            kind: "alert",
            text: "This report changed. The latest handling details are now shown. Review them before trying again.",
          });
          window.setTimeout(() => conflictHeadingRef.current?.focus(), 0);
        } catch (refreshError) {
          if (!mapFailure(refreshError)) {
            setMessage({ kind: "alert", text: "This report changed, but the latest details could not be loaded. Reload the report and try again." });
          }
        }
      } else {
        setMessage({ kind: "alert", text: "We could not update this report. Please try again." });
      }
    } finally {
      mutationInFlight.current = false;
      if (mounted.current) setMutating(false);
    }
  }

  if (state.status === "loading" || state.status === "redirecting") {
    return <p className={styles.inlineState} role="status">{state.status === "redirecting" ? "Taking you to sign in" : "Loading staff report"}</p>;
  }
  if (state.status === "not-found") {
    return <SafeState heading="Report not found" text="This report is unavailable or no longer exists." />;
  }
  if (state.status === "forbidden") {
    return <SafeState heading="Report handling access unavailable" text="Your account cannot handle this report." alert />;
  }
  if (state.status === "error") {
    return <section className={styles.statePanel} role="alert"><h1>We could not load this report</h1><p>Retry when the report service is available.</p><button type="button" onClick={() => void loadReport()}>Retry report</button></section>;
  }
  if (state.status !== "ready") return null;

  const report = state.report;
  const active = report.status !== "resolved" && report.handling.custodyStatus !== "released";
  const canVerify = active && report.handling.verificationStatus === "pending";
  const canStore = active && report.reportType === "found" && report.handling.verificationStatus === "verified" && (report.handling.custodyStatus === "not_held" || report.handling.custodyStatus === "stored");
  const internalImages = report.photoUrls.filter(isInternalReportImagePath);

  return (
    <div className={styles.detailPage}>
      <Link className={styles.backLink} href="/staff/reports">Back to report handling</Link>
      <article className={styles.detailPanel} aria-labelledby="staff-report-heading">
        <header className={styles.detailHeader}>
          <div><p className={styles.eyebrow}>{report.reportType === "found" ? "Found report" : "Lost report"}</p><h1 id="staff-report-heading">Staff report</h1><p className={styles.detailTitle}>{report.title}</p></div>
          <div className={styles.badges}><span>Lifecycle: {labels.status[report.status]}</span><span>Verification: {labels.verification[report.handling.verificationStatus]}</span><span>Custody: {labels.custody[report.handling.custodyStatus]}</span></div>
        </header>

        {internalImages.length ? <section className={styles.detailSection} aria-labelledby="report-photos-heading"><h2 id="report-photos-heading">Report photos</h2><div className={styles.photoGrid}>{internalImages.map((path, index) => <Image key={path} src={path} alt={`${report.title} photo ${index + 1}`} width={480} height={360} sizes="(max-width: 36rem) 100vw, 33vw" unoptimized />)}</div></section> : null}

        <section className={styles.detailSection} aria-labelledby="public-details-heading">
          <h2 id="public-details-heading">Report details</h2>
          <p className={styles.description}>{report.publicDescription}</p>
          <dl className={styles.detailFacts}>
            <Fact label="Category reference">{report.categoryId}</Fact>
            <Fact label="Campus location reference">{report.campusLocationId}</Fact>
            <Fact label="Colours">{report.colors.join(", ")}</Fact>
            <Fact label="Tags">{report.tags.length ? report.tags.join(", ") : "None"}</Fact>
            <Fact label="Event date">{formatDate(report.occurredAt)}</Fact>
            <Fact label="Submitted">{formatDate(report.createdAt)}</Fact>
            <Fact label="Last updated">{formatDate(report.updatedAt)}</Fact>
          </dl>
        </section>

        <section className={styles.detailSection} aria-labelledby="handling-details-heading">
          <h2 id="handling-details-heading">Handling details</h2>
          <dl className={styles.detailFacts}>
            <Fact label="Verification">{labels.verification[report.handling.verificationStatus]}</Fact>
            <Fact label="Custody">{labels.custody[report.handling.custodyStatus]}</Fact>
            {report.handling.verifiedAt ? <Fact label="Verified">{formatDate(report.handling.verifiedAt)}</Fact> : null}
            {report.handling.storedAt ? <Fact label="Stored">{formatDate(report.handling.storedAt)}</Fact> : null}
            {report.handling.releasedAt ? <Fact label="Released">{formatDate(report.handling.releasedAt)}</Fact> : null}
            {report.handling.storageLocation ? <Fact label="Storage location">{report.handling.storageLocation}</Fact> : null}
          </dl>
        </section>

        {(canVerify || canStore) ? <section className={styles.actionSection} aria-labelledby="handling-actions-heading">
          <h2 id="handling-actions-heading">Handling actions</h2>
          {canVerify ? <div className={styles.actionBlock}><p>Confirm that this report has been reviewed and is ready for the recovery workflow.</p><button className={styles.primaryButton} type="button" disabled={mutating} onClick={() => void runMutation((current) => verifyStaffReport(reportId, { expectedUpdatedAt: current.updatedAt }), "Report verification recorded.")}>{mutating ? "Saving" : "Verify report"}</button></div> : null}
          {canStore ? <form className={styles.actionBlock} onSubmit={(event) => { event.preventDefault(); const normalised = storageLocation.normalize("NFKC").trim().replace(/\s+/gu, " "); if (normalised.length < 2 || normalised.length > 160) return; void runMutation((current) => storeStaffReport(reportId, { expectedUpdatedAt: current.updatedAt, storageLocation: normalised }), report.handling.custodyStatus === "stored" ? "Storage location updated." : "Item storage recorded."); }}>
            <label className={styles.locationField} htmlFor="storage-location"><span>Storage location</span><input id="storage-location" name="storageLocation" value={storageLocation} minLength={2} maxLength={160} required disabled={mutating} aria-describedby="storage-location-help" onChange={(event) => setStorageLocation(event.currentTarget.value)} /></label>
            <p id="storage-location-help" className={styles.helpText}>Use a clear staff-only location, such as “Security desk locker 4”.</p>
            <button className={styles.primaryButton} type="submit" disabled={mutating}>{mutating ? "Saving" : report.handling.custodyStatus === "stored" ? "Update storage location" : "Record item storage"}</button>
          </form> : null}
        </section> : <p className={styles.readOnlyNotice}>This report is read-only because its handling workflow is complete.</p>}

        {message ? <section className={styles.actionMessage} role={message.kind} aria-live={message.kind === "status" ? "polite" : undefined}><h2 ref={message.kind === "alert" ? conflictHeadingRef : undefined} tabIndex={message.kind === "alert" ? -1 : undefined}>{message.kind === "alert" ? "Report update needs attention" : "Report updated"}</h2><p>{message.text}</p></section> : null}
      </article>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt>{label}</dt><dd>{children}</dd></div>;
}

function formatDate(value: string) {
  return dateTimeFormatter.format(new Date(value));
}

function SafeState({ heading, text, alert = false }: { heading: string; text: string; alert?: boolean }) {
  return <section className={styles.statePanel} role={alert ? "alert" : "status"}><h1>{heading}</h1><p>{text}</p><Link href="/staff/reports">Back to report handling</Link></section>;
}
