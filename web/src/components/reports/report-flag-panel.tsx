"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { useAuthSession } from "@/components/auth/auth-session-provider";
import {
  BrowserModerationError,
  submitBrowserReportFlag,
} from "@/lib/moderation/browser-client";
import {
  REPORT_FLAG_REASON_VALUES,
  type BrowserReportFlagReason,
} from "@/lib/moderation/browser-contract";

import styles from "./report-flagging.module.css";

const reasonLabels: Record<BrowserReportFlagReason, string> = {
  inappropriate_content: "Inappropriate content",
  suspected_fraud: "Suspected fraud",
  privacy_concern: "Privacy concern",
  duplicate_report: "Duplicate report",
  other: "Other concern",
};

export function ReportFlagPanel({ reportId }: { reportId: string }) {
  const router = useRouter();
  const { refreshSession } = useAuthSession();
  const [phase, setPhase] = useState<
    "closed" | "editing" | "submitting" | "submitted"
  >("closed");
  const [reason, setReason] = useState<BrowserReportFlagReason | "">("");
  const [details, setDetails] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<"reason" | "details" | null>(null);
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const alertHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (message) alertHeading.current?.focus();
  }, [message]);

  function openForm() {
    setReason("");
    setDetails("");
    setMessage(null);
    setErrorField(null);
    setPhase("editing");
  }

  function closeForm() {
    setReason("");
    setDetails("");
    setMessage(null);
    setErrorField(null);
    setPhase("closed");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedDetails = details.normalize("NFKC").trim().replace(/\s+/gu, " ");
    if (!reason) {
      setMessage("Choose a reason before submitting your concern.");
      setErrorField("reason");
      return;
    }
    if (reason === "other" && !normalizedDetails) {
      setMessage("Add details for another concern.");
      setErrorField("details");
      return;
    }

    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    setMessage(null);
    setErrorField(null);
    setPhase("submitting");

    try {
      await submitBrowserReportFlag(
        reportId,
        { reason, details: normalizedDetails || null },
        nextController.signal,
      );
      if (mounted.current && !nextController.signal.aborted) {
        setPhase("submitted");
      }
    } catch (error) {
      if (!mounted.current || nextController.signal.aborted) return;
      setPhase("editing");
      const code =
        error instanceof BrowserModerationError ||
        (error instanceof Error &&
          "code" in error &&
          typeof error.code === "string")
          ? error.code
          : null;
      if (code) {
        if (code === "AUTHENTICATION_REQUIRED") {
          await refreshSession().catch(() => undefined);
          if (mounted.current) router.replace("/login");
          return;
        }
        if (code === "ACTIVE_ACCOUNT_REQUIRED") {
          await refreshSession().catch(() => undefined);
          if (mounted.current) {
            setMessage("Your account can no longer report this listing.");
          }
          return;
        }
        if (code === "REPORT_FLAG_ALREADY_PENDING") {
          setMessage("A concern for this report is already awaiting administrator review.");
          return;
        }
        if (code === "REPORT_FLAG_FORBIDDEN") {
          setMessage("This listing cannot be reported from your account.");
          return;
        }
        if (code === "REPORT_NOT_FOUND") {
          setMessage("This report is no longer available.");
          return;
        }
      }
      setMessage("We could not send your concern. Check your connection and try again.");
    }
  }

  if (phase === "submitted") {
    return (
      <section className={styles.success} aria-labelledby="report-flag-sent">
        <h2 id="report-flag-sent">Concern submitted</h2>
        <p role="status" aria-live="polite">
          Your concern has been sent for administrator review.
        </p>
      </section>
    );
  }

  if (phase === "closed") {
    return (
      <section className={styles.panel} aria-label="Report a listing concern">
        <button className={styles.secondaryButton} type="button" onClick={openForm}>
          Report this listing
        </button>
      </section>
    );
  }

  const submitting = phase === "submitting";
  return (
    <section className={styles.panel} aria-labelledby="report-flag-heading">
      <h2 id="report-flag-heading">Report this listing</h2>
      <p>
        Use this form for safety, privacy, suspected fraud, or duplicate content.
        To recover an item, use the ownership Claim action instead.
      </p>

      {message ? (
        <div id="report-flag-error" className={styles.alert} role="alert">
          <h3 ref={alertHeading} tabIndex={-1}>Concern needs attention</h3>
          <p>{message}</p>
        </div>
      ) : null}

      <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
        <label htmlFor="report-flag-reason">Reason</label>
        <select
          id="report-flag-reason"
          value={reason}
          disabled={submitting}
          aria-invalid={errorField === "reason" || undefined}
          aria-describedby={errorField === "reason" ? "report-flag-error" : undefined}
          onChange={(event) => {
            setReason(event.target.value as BrowserReportFlagReason | "");
            setMessage(null);
            setErrorField(null);
          }}
        >
          <option value="">Choose a reason</option>
          {REPORT_FLAG_REASON_VALUES.map((value) => (
            <option key={value} value={value}>{reasonLabels[value]}</option>
          ))}
        </select>

        <div className={styles.labelRow}>
          <label htmlFor="report-flag-details">Additional details (optional)</label>
          <span>{details.length} / 500</span>
        </div>
        <textarea
          id="report-flag-details"
          value={details}
          maxLength={500}
          rows={5}
          disabled={submitting}
          aria-invalid={errorField === "details" || undefined}
          aria-describedby={
            errorField === "details"
              ? "report-flag-details-help report-flag-error"
              : "report-flag-details-help"
          }
          onChange={(event) => {
            setDetails(event.target.value);
            setMessage(null);
            setErrorField(null);
          }}
        />
        <p id="report-flag-details-help" className={styles.help}>
          Details are required when you choose Other concern.
        </p>

        <div className={styles.actions}>
          <button className={styles.primaryButton} type="submit" disabled={submitting}>
            {submitting ? "Submitting report" : "Submit report"}
          </button>
          <button type="button" disabled={submitting} onClick={closeForm}>Cancel</button>
        </div>
      </form>
    </section>
  );
}
