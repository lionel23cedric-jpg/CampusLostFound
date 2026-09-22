"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  BrowserReportError,
  getReportMatches,
  type MemberReport,
  type ReportMatches,
} from "@/lib/reports/browser-client";

import styles from "./report-matches.module.css";

type MatchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: ReportMatches }
  | { status: "unavailable" }
  | { status: "error" };

const reportStatusLabels: Record<MemberReport["status"], string> = {
  open: "Open",
  claim_pending: "Claim pending",
  resolved: "Resolved",
  closed: "Closed",
};

export function ReportMatchesPanel({ reportId }: { reportId: string }) {
  return <ActiveReportMatchesPanel key={reportId} reportId={reportId} />;
}

function ActiveReportMatchesPanel({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [state, setState] = useState<MatchState>({ status: "idle" });
  const mounted = useRef(false);
  const requestId = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestId.current += 1;
    };
  }, []);

  const loadMatches = useCallback(async () => {
    if (!mounted.current || state.status === "loading") return;
    const currentRequest = ++requestId.current;
    setState({ status: "loading" });

    try {
      const data = await getReportMatches(reportId);
      if (!mounted.current || requestId.current !== currentRequest) return;
      setState({ status: "ready", data });
    } catch (error) {
      if (!mounted.current || requestId.current !== currentRequest) return;
      if (error instanceof BrowserReportError) {
        if (error.status === 401 || error.code === "AUTHENTICATION_REQUIRED") {
          router.replace("/login");
          return;
        }
        if (
          error.status === 404 ||
          error.status === 409 ||
          error.code === "REPORT_NOT_FOUND" ||
          error.code === "REPORT_NOT_MATCHABLE"
        ) {
          setState({ status: "unavailable" });
          return;
        }
      }
      setState({ status: "error" });
    }
  }, [reportId, router, state.status]);

  const matches = state.status === "ready" ? state.data.matches : null;

  return (
    <section className={styles.panel} aria-labelledby="possible-matches-heading">
      <div className={styles.header}>
        <div>
          <h2 id="possible-matches-heading">Possible matches</h2>
          <p>
            Compare this report with open reports of the opposite type. Scores
            explain shared public details and do not prove ownership.
          </p>
        </div>

        {state.status === "idle" ? (
          <MatchButton onClick={loadMatches}>Find possible matches</MatchButton>
        ) : null}
        {state.status === "loading" ? (
          <MatchButton disabled onClick={loadMatches}>
            Finding possible matches
          </MatchButton>
        ) : null}
        {state.status === "ready" && matches && matches.length > 0 ? (
          <MatchButton onClick={loadMatches}>Refresh possible matches</MatchButton>
        ) : null}
      </div>

      {state.status === "loading" ? (
        <p className={styles.inlineState} role="status" aria-live="polite">
          Comparing this report with current open reports.
        </p>
      ) : null}

      {state.status === "ready" && matches?.length === 0 ? (
        <div className={styles.inlineState} role="status" aria-live="polite">
          <h3>No strong matches yet</h3>
          <p>
            No open report meets the current score threshold. New reports may
            produce a stronger match later.
          </p>
          <MatchButton onClick={loadMatches}>Check for matches again</MatchButton>
        </div>
      ) : null}

      {state.status === "unavailable" ? (
        <div className={styles.inlineState} role="status" aria-live="polite">
          <h3>Matching is unavailable</h3>
          <p>Only the owner of an open report can request possible matches.</p>
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className={styles.errorState} role="alert">
          <h3>We could not find matches</h3>
          <p>The matching service is temporarily unavailable. Try again.</p>
          <MatchButton onClick={loadMatches}>Retry possible matches</MatchButton>
        </div>
      ) : null}

      {state.status === "ready" && matches && matches.length > 0 ? (
        <div className={styles.results}>
          <p className={styles.resultSummary} role="status" aria-live="polite">
            {matches.length} possible {matches.length === 1 ? "match" : "matches"} found.
          </p>
          <p className={styles.resultSummary}>
            {state.data.matchingMethod === "model_assisted"
              ? "AI-assisted text comparison with category, location, date and other public details."
              : "Rule-based comparison (local AI model unavailable)."}
          </p>
          <ol className={styles.matchList}>
            {matches.map((match) => (
              <li key={match.report.id} className={styles.matchItem}>
                <article>
                  <div className={styles.matchHeading}>
                    <div>
                      <p className={styles.reportMeta}>
                        {match.report.reportType === "lost" ? "Lost" : "Found"}
                        {" · "}
                        {reportStatusLabels[match.report.status]}
                      </p>
                      <h3>{match.report.title}</h3>
                    </div>
                    <strong
                      className={styles.score}
                      aria-label={`Match score: ${match.score} out of 100`}
                    >
                      {match.score} / 100
                    </strong>
                  </div>

                  <p className={styles.description}>
                    {match.report.publicDescription}
                  </p>

                  <section
                    className={styles.explanations}
                    aria-labelledby={`match-reasons-${match.report.id}`}
                  >
                    <h4 id={`match-reasons-${match.report.id}`}>
                      Why this matched
                    </h4>
                    <ul>
                      {match.factors.map((factor) => (
                        <li key={factor.key}>
                          <span>{factor.explanation}</span>
                          <strong aria-label={`${factor.points} of ${factor.maximum} points`}>
                            +{factor.points} / {factor.maximum}
                          </strong>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <Link
                    className={styles.detailLink}
                    href={`/reports/${encodeURIComponent(match.report.id)}`}
                  >
                    Review {match.report.title}
                  </Link>
                </article>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

function MatchButton({
  children,
  disabled = false,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={styles.actionButton}
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
