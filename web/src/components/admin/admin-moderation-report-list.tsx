"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { useAuthSession } from "@/components/auth/auth-session-provider";
import {
  BrowserModerationError,
  listBrowserAdminReports,
  moderateBrowserReport,
} from "@/lib/moderation/browser-client";
import {
  DIRECT_HIDE_REASON_VALUES,
  type BrowserAdminReport,
  type BrowserAdminReportPage,
  type BrowserAdminReportQuery,
  type BrowserDirectHideReason,
} from "@/lib/moderation/browser-contract";

import styles from "./admin-moderation.module.css";

const hideReasonLabels: Record<BrowserDirectHideReason, string> = {
  inappropriate_content: "Inappropriate content",
  suspected_fraud: "Suspected fraud",
  privacy_concern: "Privacy concern",
  duplicate_report: "Duplicate report",
  administrative_review: "Administrative review",
};
const formatter = new Intl.DateTimeFormat("en-NZ", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Pacific/Auckland",
});
type ReportState =
  | { status: "loading" }
  | { status: "ready"; data: BrowserAdminReportPage }
  | { status: "error" }
  | { status: "accessChanged" };
type ReportAction =
  | { kind: "hide"; report: BrowserAdminReport }
  | { kind: "restore"; report: BrowserAdminReport }
  | null;

function codeOf(error: unknown) {
  return error instanceof BrowserModerationError ||
    (error instanceof Error && "code" in error && typeof error.code === "string")
    ? error.code
    : null;
}

export function AdminModerationReportList() {
  const router = useRouter();
  const { refreshSession } = useAuthSession();
  const [query, setQuery] = useState<BrowserAdminReportQuery>({ page: 1 });
  const [draftSearch, setDraftSearch] = useState("");
  const [state, setState] = useState<ReportState>({ status: "loading" });
  const [action, setAction] = useState<ReportAction>(null);
  const [hideReason, setHideReason] = useState<BrowserDirectHideReason | "">("");
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);
  const mounted = useRef(false);
  const requestId = useRef(0);
  const listController = useRef<AbortController | null>(null);
  const mutationController = useRef<AbortController | null>(null);
  const actionHeading = useRef<HTMLHeadingElement>(null);

  const load = useCallback(
    async (target: BrowserAdminReportQuery) => {
      const current = ++requestId.current;
      listController.current?.abort();
      const controller = new AbortController();
      listController.current = controller;
      setState({ status: "loading" });
      try {
        const data = await listBrowserAdminReports(target, controller.signal);
        if (!mounted.current || current !== requestId.current) return;
        if (data.reports.length === 0 && target.page > 1) {
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
        } else if (code === "ADMINISTRATOR_REQUIRED") {
          setState({ status: "accessChanged" });
          await refreshSession().catch(() => undefined);
        } else {
          setState({ status: "error" });
        }
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

  function updateQuery(next: Partial<BrowserAdminReportQuery>) {
    setNotice(null);
    setAction(null);
    setQuery((value) => ({ ...value, ...next, page: next.page ?? 1 }));
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = draftSearch.normalize("NFKC").trim().replace(/\s+/gu, " ");
    updateQuery({ q: q || undefined });
  }

  function clearFilters() {
    setDraftSearch("");
    setQuery({ page: 1 });
    setAction(null);
    setNotice(null);
  }

  function openAction(next: ReportAction) {
    setAction(next);
    setHideReason("");
    setNote("");
    setActionError(null);
  }

  async function confirmAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || mutating) return;
    if (action.kind === "hide" && !hideReason) {
      setActionError("Choose a reason before hiding this report.");
      return;
    }
    mutationController.current?.abort();
    const controller = new AbortController();
    mutationController.current = controller;
    const normalizedNote = note.normalize("NFKC").trim().replace(/\s+/gu, " ") || null;
    setMutating(true);
    setActionError(null);
    setNotice(null);
    try {
      await moderateBrowserReport(
        action.report.id,
        action.kind === "hide"
          ? {
              moderationStatus: "hidden",
              reason: hideReason as BrowserDirectHideReason,
              expectedUpdatedAt: action.report.updatedAt,
              note: normalizedNote,
            }
          : {
              moderationStatus: "visible",
              expectedUpdatedAt: action.report.updatedAt,
              note: normalizedNote,
            },
        controller.signal,
      );
      if (!mounted.current || controller.signal.aborted) return;
      setAction(null);
      setNotice(action.kind === "hide" ? "Report hidden" : "Report restored");
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
        code === "REPORT_MODERATION_CONFLICT" ||
        code === "REPORT_NOT_FOUND"
      ) {
        setNotice("Moderation data changed. Reload before making another decision.");
      } else {
        setNotice("We could not update report visibility. Try again.");
      }
    } finally {
      if (mounted.current) setMutating(false);
    }
  }

  return (
    <div className={styles.panelBody}>
      <form className={styles.searchFilters} onSubmit={search}>
        <label>
          Search reports
          <input value={draftSearch} maxLength={80} onChange={(event) => setDraftSearch(event.target.value)} />
        </label>
        <button type="submit">Search</button>
        <button type="button" onClick={clearFilters}>Clear filters</button>
      </form>
      <div className={styles.filters}>
        <label>
          Report type
          <select value={query.reportType ?? ""} onChange={(event) => updateQuery({ reportType: (event.target.value || undefined) as BrowserAdminReportQuery["reportType"] })}>
            <option value="">All types</option><option value="lost">Lost</option><option value="found">Found</option>
          </select>
        </label>
        <label>
          Recovery status
          <select value={query.reportStatus ?? ""} onChange={(event) => updateQuery({ reportStatus: (event.target.value || undefined) as BrowserAdminReportQuery["reportStatus"] })}>
            <option value="">All recovery statuses</option><option value="open">Open</option><option value="claim_pending">Claim pending</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
          </select>
        </label>
        <label>
          Visibility
          <select value={query.moderationStatus ?? ""} onChange={(event) => updateQuery({ moderationStatus: (event.target.value || undefined) as BrowserAdminReportQuery["moderationStatus"] })}>
            <option value="">All visibility states</option><option value="visible">Visible</option><option value="hidden">Hidden</option>
          </select>
        </label>
      </div>

      {notice ? (
        <div className={styles.notice} role="alert">
          <p>{notice}</p>
          {/changed|Reload/.test(notice) ? <button type="button" onClick={() => void load(query)}>Reload moderation data</button> : null}
        </div>
      ) : null}
      {state.status === "loading" ? <p role="status">Loading submitted reports</p> : null}
      {state.status === "error" ? <div className={styles.statePanel} role="alert"><p>Report list is temporarily unavailable.</p><button type="button" onClick={() => void load(query)}>Retry report list</button></div> : null}
      {state.status === "accessChanged" ? <p role="status">Administrator access changed</p> : null}
      {state.status === "ready" && state.data.reports.length === 0 ? <p className={styles.empty}>No reports match these filters.</p> : null}
      {state.status === "ready" && state.data.reports.length > 0 ? (
        <ul className={styles.cardList}>
          {state.data.reports.map((item) => (
            <li className={styles.card} key={item.id}>
              <div className={styles.cardHeader}>
                <div><p className={styles.badges}><span>{item.reportType}</span><span>{item.status.replace("_", " ")}</span><span>{item.moderationStatus}</span></p><h3>{item.title}</h3></div>
                <time dateTime={item.updatedAt}>Updated {formatter.format(new Date(item.updatedAt))}</time>
              </div>
              <p>{item.publicDescription}</p>
              <dl className={styles.facts}>
                <div><dt>Occurred</dt><dd>{formatter.format(new Date(item.occurredAt))}</dd></div>
                <div><dt>Colours</dt><dd>{item.colors.join(", ")}</dd></div>
                <div><dt>Photos</dt><dd>{item.photoUrls.length}</dd></div>
              </dl>
              {item.tags.length > 0 ? <p className={styles.tags}>Tags: {item.tags.join(", ")}</p> : null}
              <div className={styles.cardActions}>
                {item.moderationStatus === "visible" ? <Link href={`/reports/${encodeURIComponent(item.id)}`}>View safe report</Link> : null}
                <button type="button" onClick={() => openAction({ kind: item.moderationStatus === "visible" ? "hide" : "restore", report: item })}>
                  {item.moderationStatus === "visible" ? "Hide report" : "Restore report"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {state.status === "ready" && state.data.pagination.totalPages > 1 ? (
        <nav className={styles.pagination} aria-label="Report list pages">
          <button type="button" disabled={query.page <= 1} onClick={() => updateQuery({ page: query.page - 1 })}>Previous</button>
          <span role="status">Page {query.page} of {state.data.pagination.totalPages}</span>
          <button type="button" disabled={query.page >= state.data.pagination.totalPages} onClick={() => updateQuery({ page: query.page + 1 })}>Next</button>
        </nav>
      ) : null}

      {action ? (
        <form className={styles.confirmation} onSubmit={(event) => void confirmAction(event)}>
          <h3 ref={actionHeading} tabIndex={-1}>{action.kind === "hide" ? "Hide this report?" : "Restore this report?"}</h3>
          <p>{action.kind === "hide" ? "Members will no longer discover this report. Recovery and Claim records remain unchanged." : "Members will be able to discover this report again."}</p>
          {action.kind === "hide" ? (
            <label>
              Hide reason
              <select value={hideReason} disabled={mutating} onChange={(event) => { setHideReason(event.target.value as BrowserDirectHideReason | ""); setActionError(null); }}>
                <option value="">Choose a reason</option>
                {DIRECT_HIDE_REASON_VALUES.map((value) => <option key={value} value={value}>{hideReasonLabels[value]}</option>)}
              </select>
            </label>
          ) : null}
          {actionError ? <p className={styles.fieldError} role="alert">{actionError}</p> : null}
          <label htmlFor="report-moderation-note">Internal note (optional)</label>
          <textarea id="report-moderation-note" value={note} maxLength={500} rows={4} disabled={mutating} onChange={(event) => setNote(event.target.value)} />
          <div className={styles.cardActions}>
            <button type="submit" disabled={mutating}>{mutating ? "Saving visibility" : action.kind === "hide" ? "Confirm hiding" : "Confirm restoration"}</button>
            <button type="button" disabled={mutating} onClick={() => openAction(null)}>Cancel</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
