"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  ClaimBrowserError,
  getClaimQuestionsForReport,
  submitClaim,
  type ClaimQuestions,
} from "@/lib/claims/browser-client";

import styles from "./claim-management.module.css";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; data: ClaimQuestions }
  | { status: "not-claimable" }
  | { status: "already-claimed" }
  | { status: "forbidden" }
  | { status: "error" };

type SubmitState = "idle" | "submitting";

function answerErrors(
  questions: ClaimQuestions["questions"],
  answers: Record<number, string>,
) {
  return Object.fromEntries(
    questions.flatMap(({ questionIndex }) => {
      const answer = answers[questionIndex]?.trim() ?? "";
      return answer.length === 0
        ? [[questionIndex, "Enter an answer"]]
        : answer.length > 500
          ? [[questionIndex, "Use 500 characters or fewer"]]
          : [];
    }),
  ) as Record<number, string>;
}

export function ClaimSubmissionClient({ reportId }: { reportId: string }) {
  return <ClaimSubmissionForm key={reportId} reportId={reportId} />;
}

function ClaimSubmissionForm({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const requestId = useRef(0);
  const submissionId = useRef(0);
  const mounted = useRef(false);
  const submitting = useRef(false);

  const classifyLoadError = useCallback(
    (error: unknown) => {
      if (error instanceof ClaimBrowserError) {
        if (error.status === 401 || error.code === "AUTHENTICATION_REQUIRED") {
          router.replace("/login");
          return;
        }
        if (error.status === 403 || error.code === "CLAIM_FORBIDDEN") {
          setLoadState({ status: "forbidden" });
          return;
        }
        if (error.code === "REPORT_NOT_CLAIMABLE") {
          setLoadState({ status: "not-claimable" });
          return;
        }
        if (error.code === "CLAIM_ALREADY_EXISTS") {
          setLoadState({ status: "already-claimed" });
          return;
        }
      }
      setLoadState({ status: "error" });
    },
    [router],
  );

  const loadQuestions = useCallback(async () => {
    const currentRequest = ++requestId.current;
    submitting.current = false;
    setSubmitState("idle");
    setLoadState({ status: "loading" });
    setSubmitError(null);
    try {
      const data = await getClaimQuestionsForReport(reportId);
      if (currentRequest !== requestId.current) return;
      setAnswers(
        Object.fromEntries(
          data.questions.map(({ questionIndex }) => [questionIndex, ""]),
        ),
      );
      setErrors({});
      setLoadState({ status: "ready", data });
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      classifyLoadError(error);
    }
  }, [classifyLoadError, reportId]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestId.current += 1;
      submissionId.current += 1;
      submitting.current = false;
    };
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => void loadQuestions(), 0);
    return () => {
      window.clearTimeout(timeoutId);
      requestId.current += 1;
      submissionId.current += 1;
      submitting.current = false;
    };
  }, [loadQuestions]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loadState.status !== "ready" || submitting.current) return;

    const currentErrors = answerErrors(loadState.data.questions, answers);
    setErrors(currentErrors);
    setSubmitError(null);
    if (Object.keys(currentErrors).length > 0) {
      setSubmitError("Review every answer and try again.");
      return;
    }

    submitting.current = true;
    const currentSubmission = ++submissionId.current;
    setSubmitState("submitting");
    const responses = loadState.data.questions.map(({ questionIndex }) => ({
      questionIndex,
      answer: answers[questionIndex].trim(),
    }));

    try {
      const claim = await submitClaim(reportId, responses);
      if (!mounted.current || currentSubmission !== submissionId.current) return;
      router.replace(`/claims/${encodeURIComponent(claim.id)}`);
    } catch (error) {
      if (!mounted.current || currentSubmission !== submissionId.current) return;
      if (error instanceof ClaimBrowserError) {
        if (error.status === 401 || error.code === "AUTHENTICATION_REQUIRED") {
          router.replace("/login");
          return;
        }
        if (error.status === 403 || error.code === "CLAIM_FORBIDDEN") {
          setLoadState({ status: "forbidden" });
          return;
        }
        if (error.code === "REPORT_NOT_CLAIMABLE") {
          setLoadState({ status: "not-claimable" });
          return;
        }
        if (error.code === "CLAIM_ALREADY_EXISTS") {
          setLoadState({ status: "already-claimed" });
          return;
        }
        if (error.code === "VALIDATION_ERROR") {
          setSubmitError("Review every answer and try again.");
          return;
        }
      }
      setSubmitError("We could not submit your claim. Your answers are still here.");
    } finally {
      if (!mounted.current || currentSubmission !== submissionId.current) return;
      submitting.current = false;
      setSubmitState("idle");
    }
  }

  const reportHref = `/reports/${encodeURIComponent(reportId)}`;

  if (loadState.status === "loading") {
    return (
      <section className={styles.loading} role="status" aria-live="polite">
        Loading ownership questions
      </section>
    );
  }

  if (loadState.status === "not-claimable") {
    return (
      <SafeState heading="This report cannot be claimed" href={reportHref} linkText="Back to report" />
    );
  }

  if (loadState.status === "already-claimed") {
    return (
      <SafeState heading="You already have an active claim" href="/claims" linkText="View my claims" />
    );
  }

  if (loadState.status === "forbidden") {
    return (
      <SafeState heading="Claim access unavailable" href="/dashboard" linkText="Back to dashboard" alert />
    );
  }

  if (loadState.status === "error") {
    return (
      <section className={styles.statePanel} role="alert" aria-labelledby="claim-load-error">
        <h1 id="claim-load-error">We could not load ownership questions</h1>
        <p>Retry when the claim service is available.</p>
        <button type="button" onClick={() => void loadQuestions()}>
          Retry ownership questions
        </button>
      </section>
    );
  }

  const isSubmitting = submitState === "submitting";

  return (
    <div className={styles.submissionPage}>
      <Link
        className={styles.backLink}
        href={reportHref}
        aria-disabled={isSubmitting}
        tabIndex={isSubmitting ? -1 : undefined}
        onClick={(event) => {
          if (isSubmitting) event.preventDefault();
        }}
      >
        Back to report
      </Link>
      <section className={styles.submissionPanel} aria-labelledby="claim-heading">
        <header className={styles.submissionHeader}>
          <h1 id="claim-heading">Claim {loadState.data.report.title}</h1>
          <p>
            This found item report includes ownership questions. Answer each one with
            details that authorised staff can use to review ownership.
          </p>
        </header>

        <form className={styles.claimForm} onSubmit={handleSubmit} noValidate>
          {submitError ? (
            <div className={styles.errorSummary} role="alert">
              <h2>Check your claim</h2>
              <p>{submitError}</p>
            </div>
          ) : null}

          <fieldset disabled={isSubmitting}>
            <legend>Ownership verification</legend>
            <p className={styles.privacyNotice}>
              Your answers are sent to authorised staff for ownership review and are not
              shown on your claim pages.
            </p>
            {loadState.data.questions.map(({ questionIndex, question }) => {
              const error = errors[questionIndex];
              const errorId = `claim-answer-${questionIndex}-error`;
              return (
                <div className={styles.answerField} key={questionIndex}>
                  <label htmlFor={`claim-answer-${questionIndex}`}>{question}</label>
                  <textarea
                    id={`claim-answer-${questionIndex}`}
                    aria-label={question}
                    aria-invalid={error ? "true" : undefined}
                    aria-describedby={error ? errorId : undefined}
                    maxLength={500}
                    rows={4}
                    value={answers[questionIndex] ?? ""}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setAnswers((current) => ({ ...current, [questionIndex]: value }));
                      setErrors((current) => {
                        if (!(questionIndex in current)) return current;
                        const next = { ...current };
                        delete next[questionIndex];
                        return next;
                      });
                    }}
                  />
                  {error ? <span id={errorId}>{error}</span> : null}
                </div>
              );
            })}
          </fieldset>

          <div className={styles.formActions}>
            <button className={styles.primaryButton} type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting claim" : "Submit claim"}
            </button>
            <Link
              className={styles.secondaryLink}
              href={reportHref}
              aria-disabled={isSubmitting}
              tabIndex={isSubmitting ? -1 : undefined}
              onClick={(event) => {
                if (isSubmitting) event.preventDefault();
              }}
            >
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </div>
  );
}

function SafeState({
  heading,
  href,
  linkText,
  alert = false,
}: {
  heading: string;
  href: string;
  linkText: string;
  alert?: boolean;
}) {
  return (
    <section
      className={styles.statePanel}
      role={alert ? "alert" : "status"}
      aria-live={alert ? undefined : "polite"}
      aria-labelledby="claim-safe-state-heading"
    >
      <h1 id="claim-safe-state-heading">{heading}</h1>
      <p>This claim action is not available from this report.</p>
      <Link href={href}>{linkText}</Link>
    </section>
  );
}
