"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { useAuthSession } from "@/components/auth/auth-session-provider";
import {
  BrowserModerationError,
  decideBrowserReportFlag,
  listBrowserAdminReportFlags,
} from "@/lib/moderation/browser-client";
import {
  REPORT_FLAG_REASON_VALUES,
  REPORT_FLAG_STATUS_VALUES,
  type BrowserAdminFlagQuery,
  type BrowserAdminReportFlag,
  type BrowserAdminReportFlagPage,
  type BrowserReportFlagReason,
  type BrowserReportFlagStatus,
} from "@/lib/moderation/browser-contract";

import styles from "./admin-moderation.module.css";

const reasonLabels: Record<BrowserReportFlagReason, string> = {
  inappropriate_content: "Inappropriate content",
  suspected_fraud: "Suspected fraud",
  privacy_concern: "Privacy concern",
  duplicate_report: "Duplicate report",
  other: "Other concern",
};
const statusLabels: Record<BrowserReportFlagStatus, string> = {
  pending: "Pending",
  dismissed: "Dismissed",
  actioned: "Actioned",
};
const formatter = new Intl.DateTimeFormat("en-NZ", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Pacific/Auckland",
});

type QueueState =
  | { status: "loading" }
  | { status: "ready"; data: BrowserAdminReportFlagPage }
  | { status: "error" }
  | { status: "accessChanged" };
type FlagAction =
  | { kind: "dismiss"; flag: BrowserAdminReportFlag }
  | { kind: "hide"; flag: BrowserAdminReportFlag }
  | null;

function codeOf(error: unknown) {
  return error instanceof BrowserModerationError ||
    (error instanceof Error && "code" in error && typeof error.code === "string")
    ? error.code
    : null;
}

export function AdminModerationFlagQueue() {
  const router = useRouter();
  const { refreshSession } = useAuthSession();
  const [query, setQuery] = useState<BrowserAdminFlagQuery>({
    status: "pending",
    page: 1,
  });
  const [state, setState] = useState<QueueState>({ status: "loading" });
  const [action, setAction] = useState<FlagAction>(null);
  const [note, setNote] = useState("");
  const [mutating, setMutating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(false);
  const requestId = useRef(0);
  const listController = useRef<AbortController | null>(null);
  const mutationController = useRef<AbortController | null>(null);
  const actionHeading = useRef<HTMLHeadingElement>(null);

  const load = useCallback(
    async (target: BrowserAdminFlagQuery) => {
      const current = ++requestId.current;
      listController.current?.abort();
      const controller = new AbortController();
      listController.current = controller;
      setState({ status: "loading" });
      try {
        const data = await listBrowserAdminReportFlags(target, controller.signal);
        if (!mounted.current || current !== requestId.current) return;
        if (data.flags.length === 0 && target.page > 1) {
          setQuery((value) => ({ ...value, page: value.page - 1 }));
          return;
        }
        setState({ status: "ready", data });
      } catch (error) {
        if (!mounted.current || current !== requestId.current || controller.signal.aborted) return;
        const code = codeOf(error);
        if (code === "AUTHENTICATION_REQUIRED") {
          setState({ status: "accessChanged" });
          await refreshSession().catch(() => undefined);
          if (mounted.current) router.replace("/login");
          return;
        }
        if (code === "ADMINISTRATOR_REQUIRED") {
          setState({ status: "accessChanged" });
          await refreshSession().catch(() => undefined);
          return;
        }
        setState({ status: "error" });
      }
    },
    [refreshSession, router],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestId.current += 1;
      listController.current?.abort();
      mutationController.current?.abort();
    };
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void load(query), 0);
    return () => window.clearTimeout(id);
  }, [load, query]);

  useEffect(() => {
    if (action) actionHeading.current?.focus();
  }, [action]);

  function updateQuery(next: Partial<BrowserAdminFlagQuery>) {
    setNotice(null);
    setAction(null);
    setQuery((value) => ({ ...value, ...next, page: next.page ?? 1 }));
  }

  async function confirmAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || mutating) return;
    mutationController.current?.abort();
    const controller = new AbortController();
    mutationController.current = controller;
    const normalizedNote = note.normalize("NFKC").trim().replace(/\s+/gu, " ") || null;
    setMutating(true);
    setNotice(null);
    try {
      await decideBrowserReportFlag(
        action.flag.id,
        action.kind === "dismiss"
          ? {
              decision: "dismiss",
              expectedFlagUpdatedAt: action.flag.updatedAt,
              note: normalizedNote,
            }
          : {
              decision: "hide_report",
              expectedFlagUpdatedAt: action.flag.updatedAt,
              expectedReportUpdatedAt: action.flag.report.updatedAt,
              note: normalizedNote,
            },
        controller.signal,
      );
      if (!mounted.current || controller.signal.aborted) return;
      setAction(null);
      setNote("");
      setNotice(action.kind === "dismiss" ? "Concern dismissed" : "Report hidden");
      await load(query);
    } catch (error) {
      if (!mounted.current || controller.signal.aborted) return;
      const code = codeOf(error);
      setAction(null);
      if (code === "AUTHENTICATION_REQUIRED") {
        await refreshSession().catch(() => undefined);
        if (mounted.current) router.replace("/login");
      } else if (code === "ADMINISTRATOR_REQUIRED") {
        await refreshSession().catch(() => undefined);
        setNotice("Administrator access changed.");
      } else if (
        code === "REPORT_FLAG_STATE_CONFLICT" ||
        code === "REPORT_MODERATION_CONFLICT" ||
        code === "REPORT_FLAG_NOT_FOUND" ||
        code === "REPORT_NOT_FOUND"
      ) {
        setNotice("Moderation data changed. Reload before making another decision.");
      } else {
        setNotice("We could not complete that moderation decision. Try again.");
      }
    } finally {
      if (mounted.current) setMutating(false);
    }
  }

  return (
    <div className={styles.panelBody}>
      <div className={styles.filters}>
        <label>
          Flag status
          <select
            value={query.status ?? ""}
            onChange={(event) =>
              updateQuery({
                status: (event.target.value || undefined) as BrowserReportFlagStatus | undefined,
              })
            }
          >
            <option value="">All statuses</option>
            {REPORT_FLAG_STATUS_VALUES.map((value) => (
              <option key={value} value={value}>{statusLabels[value]}</option>
            ))}
          </select>
        </label>
        <label>
          Flag reason
          <select
            value={query.reason ?? ""}
            onChange={(event) =>
              updateQuery({
                reason: (event.target.value || undefined) as BrowserReportFlagReason | undefined,
              })
            }
          >
            <option value="">All reasons</option>
            {REPORT_FLAG_REASON_VALUES.map((value) => (
              <option key={value} value={value}>{reasonLabels[value]}</option>
            ))}
          </select>
        </label>
      </div>

      {notice ? (
        <div className={styles.notice} role="alert">
          <p>{notice}</p>
          {/changed|Reload/.test(notice) ? (
            <button type="button" onClick={() => void load(query)}>Reload moderation data</button>
          ) : null}
        </div>
      ) : null}

      {state.status === "loading" ? <p role="status">Loading flagged reports</p> : null}
      {state.status === "error" ? (
        <div className={styles.statePanel} role="alert">
          <p>Flag queue is temporarily unavailable.</p>
          <button type="button" onClick={() => void load(query)}>Retry flag queue</button>
        </div>
      ) : null}
      {state.status === "accessChanged" ? <p role="status">Administrator access changed</p> : null}
      {state.status === "ready" && state.data.flags.length === 0 ? (
        <p className={styles.empty}>No flags match these filters.</p>
      ) : null}
      {state.status === "ready" && state.data.flags.length > 0 ? (
        <ul className={styles.cardList}>
          {state.data.flags.map((item) => (
            <li className={styles.card} key={item.id}>
              <div className={styles.cardHeader}>
                <div>
                  <p className={styles.badges}>
                    <span>{statusLabels[item.status]}</span>
                    <span>{reasonLabels[item.reason]}</span>
                  </p>
                  <h3>{item.report.title}</h3>
                </div>
                <time dateTime={item.createdAt}>{formatter.format(new Date(item.createdAt))}</time>
              </div>
              {item.details ? <p>{item.details}</p> : null}
              <dl className={styles.facts}>
                <div><dt>Report type</dt><dd>{item.report.reportType === "lost" ? "Lost" : "Found"}</dd></div>
                <div><dt>Recovery</dt><dd>{item.report.status.replace("_", " ")}</dd></div>
                <div><dt>Visibility</dt><dd>{item.report.moderationStatus}</dd></div>
              </dl>
              <div className={styles.cardActions}>
                {item.report.moderationStatus === "visible" ? (
                  <Link href={`/reports/${encodeURIComponent(item.report.id)}`}>View safe report</Link>
                ) : null}
                {item.status === "pending" ? (
                  <>
                    <button type="button" onClick={() => { setNote(""); setAction({ kind: "dismiss", flag: item }); }}>Dismiss concern</button>
                    <button type="button" onClick={() => { setNote(""); setAction({ kind: "hide", flag: item }); }}>Hide report</button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {state.status === "ready" && state.data.pagination.totalPages > 1 ? (
        <nav className={styles.pagination} aria-label="Flag queue pages">
          <button type="button" disabled={query.page <= 1} onClick={() => updateQuery({ page: query.page - 1 })}>Previous</button>
          <span role="status">Page {query.page} of {state.data.pagination.totalPages}</span>
          <button type="button" disabled={query.page >= state.data.pagination.totalPages} onClick={() => updateQuery({ page: query.page + 1 })}>Next</button>
        </nav>
      ) : null}

      {action ? (
        <form className={styles.confirmation} onSubmit={(event) => void confirmAction(event)}>
          <h3 ref={actionHeading} tabIndex={-1}>
            {action.kind === "dismiss" ? "Dismiss this concern?" : "Hide this report?"}
          </h3>
          <p>
            {action.kind === "dismiss"
              ? "The report will remain visible and this concern cannot be reopened."
              : "The report will leave member discovery without deleting its recovery record."}
          </p>
          <label htmlFor="flag-decision-note">Internal note (optional)</label>
          <textarea id="flag-decision-note" value={note} maxLength={500} rows={4} disabled={mutating} onChange={(event) => setNote(event.target.value)} />
          <div className={styles.cardActions}>
            <button type="submit" disabled={mutating}>
              {mutating
                ? "Saving decision"
                : action.kind === "dismiss"
                  ? "Confirm dismissal"
                  : "Confirm hiding"}
            </button>
            <button type="button" disabled={mutating} onClick={() => { setAction(null); setNote(""); }}>Cancel</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
