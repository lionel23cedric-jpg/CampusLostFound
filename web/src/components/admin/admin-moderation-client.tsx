"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAuthSession } from "@/components/auth/auth-session-provider";
import { ContextIllustration } from "@/components/context-illustration";
import { PageBackLink } from "@/components/page-back-link";
import {
  BrowserModerationError,
  scanBrowserDuplicateReports,
  submitBrowserReportFlag,
} from "@/lib/moderation/browser-client";
import type { BrowserDuplicatePair } from "@/lib/moderation/browser-contract";
import { AdminModerationFlagQueue } from "./admin-moderation-flag-queue";
import { AdminModerationReportList } from "./admin-moderation-report-list";
import styles from "./admin-moderation.module.css";

const dateFormatter = new Intl.DateTimeFormat("en-NZ", {
  dateStyle: "medium",
  timeZone: "Pacific/Auckland",
});

function groupDuplicatePairs(pairs: BrowserDuplicatePair[]) {
  const byTarget = new Map<string, BrowserDuplicatePair[]>();
  for (const pair of pairs) {
    const candidates = byTarget.get(pair.rightReport.id) ?? [];
    candidates.push(pair);
    byTarget.set(pair.rightReport.id, candidates);
  }
  return [...byTarget.values()]
    .map((candidates) => candidates.sort((a, b) => b.similarity - a.similarity))
    .sort((a, b) => b[0].similarity - a[0].similarity);
}

function DuplicateReportIdentity({
  report,
  label,
}: {
  report: BrowserDuplicatePair["leftReport"];
  label: string;
}) {
  const date = dateFormatter.format(new Date(report.occurredAt));
  const shortId = report.id.slice(-6);
  return (
    <div className={styles.duplicateReport}>
      <span>{label}</span>
      <Link
        href={`/reports/${encodeURIComponent(report.id)}`}
        aria-label={`${report.title}, ${date}, report ID ${shortId}`}
      >
        {report.title}
      </Link>
      <p className={styles.duplicateMeta}>
        <time dateTime={report.occurredAt}>{date}</time>
        <span>Report ID: {shortId}</span>
      </p>
    </div>
  );
}

export function AdminModerationClient() {
  // Scanning only proposes candidates. A separate click creates a normal pending
  // flag, while the existing queue remains responsible for any visibility change.
  const [pairs, setPairs] = useState<BrowserDuplicatePair[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [queueingId, setQueueingId] = useState<string | null>(null);
  const [queuedReportIds, setQueuedReportIds] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [flagQueueRevision, setFlagQueueRevision] = useState(0);
  const router = useRouter();
  const { refreshSession } = useAuthSession();
  const scanController = useRef<AbortController | null>(null);
  const flagController = useRef<AbortController | null>(null);

  useEffect(() => () => {
    scanController.current?.abort();
    flagController.current?.abort();
  }, []);

  async function handleAccessError(error: unknown, signal: AbortSignal) {
    if (!(error instanceof BrowserModerationError)) return false;
    if (
      error.code !== "AUTHENTICATION_REQUIRED" &&
      error.code !== "ADMINISTRATOR_REQUIRED"
    ) return false;
    setPairs(null);
    setNotice(
      error.code === "AUTHENTICATION_REQUIRED"
        ? "Your session has expired. Taking you to sign in."
        : "Administrator access changed.",
    );
    await refreshSession().catch(() => undefined);
    if (!signal.aborted && error.code === "AUTHENTICATION_REQUIRED") {
      router.replace("/login");
    }
    return true;
  }
/**
 * Requests possible duplicate reports for review.
 * Scanning does not modify report visibility.
 * Candidates must be submitted to moderation separately.
 */
  async function scan() {
    scanController.current?.abort();
    const controller = new AbortController();
    scanController.current = controller;
    setScanning(true);
    setNotice(null);
    try {
      const result = await scanBrowserDuplicateReports(controller.signal);
      if (!controller.signal.aborted) setPairs(result.pairs);
    } catch (error) {
      if (!controller.signal.aborted) {
        if (!(await handleAccessError(error, controller.signal))) {
          setNotice(
            pairs === null
              ? "Duplicate scan is temporarily unavailable. Try again."
              : "Duplicate scan is temporarily unavailable. Previous results are still shown; try again.",
          );
        }
      }
    } finally {
      if (!controller.signal.aborted) setScanning(false);
    }
  }

  async function sendToQueue(pair: BrowserDuplicatePair) {
    if (queueingId || queuedReportIds.has(pair.rightReport.id)) return;
    flagController.current?.abort();
    const controller = new AbortController();
    flagController.current = controller;
    setQueueingId(pair.rightReport.id);
    setNotice(null);
    try {
      await submitBrowserReportFlag(
        pair.rightReport.id,
        {
          reason: "duplicate_report",
          details: `${pair.method === "model_assisted" ? "AI-assisted" : "Fallback"} candidate paired with report ${pair.leftReport.id}`,
        },
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setQueuedReportIds((current) => new Set(current).add(pair.rightReport.id));
        setNotice("Candidate sent to the moderation queue.");
        setFlagQueueRevision((value) => value + 1);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        if (await handleAccessError(error, controller.signal)) return;
        if (
          error instanceof BrowserModerationError &&
          error.code === "REPORT_FLAG_ALREADY_PENDING"
        ) {
          setQueuedReportIds((current) => new Set(current).add(pair.rightReport.id));
          setNotice("A flag for this report is already pending in the moderation queue.");
          setFlagQueueRevision((value) => value + 1);
        } else {
          setNotice("We could not send this candidate to the moderation queue. Try again.");
        }
      }
    } finally {
      if (!controller.signal.aborted) setQueueingId(null);
    }
  }

  const groups = pairs ? groupDuplicatePairs(pairs) : [];

  return (
    <article className={styles.workspace}>
      <header className={styles.header}>
        <PageBackLink href="/admin">Back to administrator overview</PageBackLink>
        <p className={styles.kicker}>Administrator workspace</p>
        <h1>Report moderation</h1>
        <p>
          Review member concerns and control whether submitted reports remain
          visible without changing their recovery records.
        </p>
      </header>

      <ContextIllustration kind="adminModeration" variant="banner" priority />

      <section className={styles.section} aria-labelledby="moderation-duplicates">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="moderation-duplicates">Possible duplicates</h2>
            <p>
              Compare recent visible reports. Scanning does not change or hide any report.
            </p>
          </div>
          <button type="button" disabled={scanning} onClick={() => void scan()}>
            {scanning ? "Scanning for possible duplicates" : "Scan for possible duplicates"}
          </button>
        </div>

        {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
        {pairs !== null ? (
          pairs.length === 0 ? (
            <p className={styles.empty}>No likely duplicates were found in this scan.</p>
          ) : (
            <div className={styles.duplicateResults}>
              <h3>
                {pairs.some(({ method }) => method === "model_assisted")
                  ? "AI-assisted duplicate candidates"
                  : "Fallback duplicate candidates"}
              </h3>
              <p className={styles.duplicateCount}>
                {pairs.length} pairings across {groups.length} reports. Review each report before sending it to the queue.
              </p>
              <ul className={styles.cardList} aria-label="Duplicate target reports">
                {groups.map((candidates) => {
                  const [pair, ...alternates] = candidates;
                  const queued = queuedReportIds.has(pair.rightReport.id);
                  return (
                    <li className={styles.card} key={pair.rightReport.id}>
                      <div className={styles.duplicateTitles}>
                        <DuplicateReportIdentity report={pair.rightReport} label="Report to review" />
                        <DuplicateReportIdentity report={pair.leftReport} label="Closest matching report" />
                      </div>
                      <p className={styles.badges}>
                        <span>{pair.leftReport.reportType === "lost" ? "Lost" : "Found"}</span>
                        <span>{Math.round(pair.similarity * 100)}% similar</span>
                        <span>{pair.method === "model_assisted" ? "AI-assisted" : "Fallback"}</span>
                      </p>
                      <ul className={styles.reasons}>
                        {pair.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                      </ul>
                      {alternates.length > 0 ? (
                        <details className={styles.alternatePairs}>
                          <summary>
                            {alternates.length} other {alternates.length === 1 ? "pairing" : "pairings"}
                          </summary>
                          <ul className={styles.alternateList}>
                            {alternates.map((alternate) => (
                              <li key={alternate.leftReport.id}>
                                <DuplicateReportIdentity report={alternate.leftReport} label="Also matches" />
                                <p className={styles.badges}>
                                  <span>{Math.round(alternate.similarity * 100)}% similar</span>
                                  <span>{alternate.method === "model_assisted" ? "AI-assisted" : "Fallback"}</span>
                                </p>
                                <ul className={styles.reasons}>
                                  {alternate.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                                </ul>
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                      <div className={styles.cardActions}>
                        <button
                          type="button"
                          disabled={scanning || queueingId !== null || queued}
                          onClick={() => void sendToQueue(pair)}
                        >
                          {queued
                            ? "Already in moderation queue"
                            : queueingId === pair.rightReport.id
                            ? "Sending to moderation queue"
                            : "Send to moderation queue"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )
        ) : null}
      </section>

      <section className={styles.section} aria-labelledby="moderation-flags">
        {/* Flag queue decisions resolve member concerns and may hide a report. */}
        <h2 id="moderation-flags">Flag queue</h2>
        <AdminModerationFlagQueue key={flagQueueRevision} />
      </section>

      <section className={styles.section} aria-labelledby="moderation-reports">
        {/* Report visibility is also available directly when an administrator
            discovers a problem without waiting for a member flag. */}
        <h2 id="moderation-reports">Report visibility</h2>
        <AdminModerationReportList />
      </section>
    </article>
  );
}
