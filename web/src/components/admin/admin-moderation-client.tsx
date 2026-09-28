"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ContextIllustration } from "@/components/context-illustration";
import { PageBackLink } from "@/components/page-back-link";
import {
  scanBrowserDuplicateReports,
  submitBrowserReportFlag,
} from "@/lib/moderation/browser-client";
import type { BrowserDuplicatePair } from "@/lib/moderation/browser-contract";
import { AdminModerationFlagQueue } from "./admin-moderation-flag-queue";
import { AdminModerationReportList } from "./admin-moderation-report-list";
import styles from "./admin-moderation.module.css";

export function AdminModerationClient() {
  // Scanning only proposes candidates. A separate click creates a normal pending
  // flag, while the existing queue remains responsible for any visibility change.
  const [pairs, setPairs] = useState<BrowserDuplicatePair[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [queueingId, setQueueingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [flagQueueRevision, setFlagQueueRevision] = useState(0);
  const scanController = useRef<AbortController | null>(null);
  const flagController = useRef<AbortController | null>(null);

  useEffect(() => () => {
    scanController.current?.abort();
    flagController.current?.abort();
  }, []);

  async function scan() {
    scanController.current?.abort();
    const controller = new AbortController();
    scanController.current = controller;
    setScanning(true);
    setNotice(null);
    try {
      const result = await scanBrowserDuplicateReports(controller.signal);
      if (!controller.signal.aborted) setPairs(result.pairs);
    } catch {
      if (!controller.signal.aborted) {
        setNotice("Duplicate scan is temporarily unavailable. Try again.");
      }
    } finally {
      if (!controller.signal.aborted) setScanning(false);
    }
  }

  async function sendToQueue(pair: BrowserDuplicatePair) {
    if (queueingId) return;
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
        setNotice("Candidate sent to the moderation queue.");
        setFlagQueueRevision((value) => value + 1);
      }
    } catch {
      if (!controller.signal.aborted) {
        setNotice("We could not send this candidate to the moderation queue. Try again.");
      }
    } finally {
      if (!controller.signal.aborted) setQueueingId(null);
    }
  }

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
              <ul className={styles.cardList}>
                {pairs.map((pair) => {
                  const pairKey = `${pair.leftReport.id}:${pair.rightReport.id}`;
                  return (
                    <li className={styles.card} key={pairKey}>
                      <div className={styles.duplicateTitles}>
                        <div>
                          <span>Report A</span>
                          <Link href={`/reports/${encodeURIComponent(pair.leftReport.id)}`}>
                            {pair.leftReport.title}
                          </Link>
                          <time dateTime={pair.leftReport.occurredAt}>
                            {new Date(pair.leftReport.occurredAt).toLocaleDateString("en-NZ")}
                          </time>
                        </div>
                        <div>
                          <span>Report B</span>
                          <Link href={`/reports/${encodeURIComponent(pair.rightReport.id)}`}>
                            {pair.rightReport.title}
                          </Link>
                          <time dateTime={pair.rightReport.occurredAt}>
                            {new Date(pair.rightReport.occurredAt).toLocaleDateString("en-NZ")}
                          </time>
                        </div>
                      </div>
                      <p className={styles.badges}>
                        <span>{pair.leftReport.reportType === "lost" ? "Lost" : "Found"}</span>
                        <span>{Math.round(pair.similarity * 100)}% similar</span>
                        <span>{pair.method === "model_assisted" ? "AI-assisted" : "Fallback"}</span>
                      </p>
                      <ul className={styles.reasons}>
                        {pair.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                      </ul>
                      <div className={styles.cardActions}>
                        <button
                          type="button"
                          disabled={scanning || queueingId !== null}
                          onClick={() => void sendToQueue(pair)}
                        >
                          {queueingId === pair.rightReport.id
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
