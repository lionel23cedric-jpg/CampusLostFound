"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { isInternalReportImagePath } from "@/lib/reports/photo-reference";
import { ContextIllustration } from "@/components/context-illustration";
import { PageBackLink } from "@/components/page-back-link";
import {
  StaffReportBrowserError,
  getStaffReports,
  type StaffReportPage,
  type StaffReportSummary,
} from "@/lib/staff-reports/browser-client";
import {
  parseStaffReportListSearchParams,
  staffReportListHref,
  type StaffReportListSearch,
} from "@/lib/staff-reports/list-search";

import styles from "./staff-report-handling.module.css";

type ListState =
  | { status: "loading"; queryKey: string }
  | { status: "ready"; queryKey: string; page: StaffReportPage }
  | { status: "forbidden"; queryKey: string }
  | { status: "error"; queryKey: string };

const labels = {
  reportType: { lost: "Lost", found: "Found" },
  status: { open: "Open", claim_pending: "Claim pending", resolved: "Resolved" },
  verification: { pending: "Pending", verified: "Verified" },
  custody: {
    not_applicable: "Not applicable",
    not_held: "Not held",
    stored: "Stored",
    released: "Released",
  },
} as const;
const dateFormatter = new Intl.DateTimeFormat("en-NZ", {
  dateStyle: "medium",
  timeZone: "Pacific/Auckland",
});

export function StaffReportListClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();
  const parsed = useMemo(
    () => parseStaffReportListSearchParams(new URLSearchParams(queryKey)),
    [queryKey],
  );
  const requestId = useRef(0);
  const [state, setState] = useState<ListState>({ status: "loading", queryKey });

  const loadReports = useCallback(
    async (signal?: AbortSignal) => {
      const currentRequest = ++requestId.current;
      setState({ status: "loading", queryKey });
      const canonicalHref = staffReportListHref(parsed.values);
      if (queryKey !== (canonicalHref.split("?", 2)[1] ?? "")) {
        router.replace(canonicalHref);
      }
      try {
        const page = await getStaffReports(parsed.request, signal);
        if (currentRequest !== requestId.current || signal?.aborted) return;
        if (
          parsed.values.page > 1 &&
          page.pagination.totalPages > 0 &&
          parsed.values.page > page.pagination.totalPages
        ) {
          router.replace(
            staffReportListHref({
              ...parsed.values,
              page: page.pagination.totalPages,
            }),
          );
          return;
        }
        setState({ status: "ready", queryKey, page });
      } catch (error) {
        if (currentRequest !== requestId.current || signal?.aborted) return;
        if (error instanceof StaffReportBrowserError) {
          if (error.status === 401) {
            router.replace("/login");
            return;
          }
          if (error.status === 403) {
            setState({ status: "forbidden", queryKey });
            return;
          }
        }
        setState({ status: "error", queryKey });
      }
    },
    [parsed, queryKey, router],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => void loadReports(controller.signal),
      0,
    );
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
      requestId.current += 1;
    };
  }, [loadReports]);

  const visibleState =
    state.queryKey === queryKey ? state : ({ status: "loading", queryKey } as const);

  if (visibleState.status === "forbidden") {
    return (
      <section className={styles.statePanel}>
        <PageBackLink href="/dashboard">Back to dashboard</PageBackLink>
        <h1>Report handling access unavailable</h1>
        <p>Your account cannot handle reports.</p>
      </section>
    );
  }

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    router.push(
      staffReportListHref({
        reportType: data.get("reportType") as StaffReportListSearch["reportType"],
        reportStatus: data.get("reportStatus") as StaffReportListSearch["reportStatus"],
        verificationStatus: data.get("verificationStatus") as StaffReportListSearch["verificationStatus"],
        custodyStatus: data.get("custodyStatus") as StaffReportListSearch["custodyStatus"],
        page: 1,
      }),
    );
  }

  return (
    <div className={styles.listPage}>
      <PageBackLink href="/dashboard">Back to dashboard</PageBackLink>
      <header className={styles.listHeader}>
        <h1>Report handling</h1>
        <p>Verify reports and track where Found items are held for recovery.</p>
      </header>
      <ContextIllustration kind="administration" variant="banner" priority />
      {parsed.ignoredInvalidValues ? (
        <p className={styles.notice} role="status">Some invalid report filters were ignored.</p>
      ) : null}
      <form key={queryKey} className={styles.filters} onSubmit={applyFilters}>
        <Filter label="Report type" name="reportType" value={parsed.values.reportType} options={[['all','All types'],['lost','Lost'],['found','Found']]} />
        <Filter label="Lifecycle" name="reportStatus" value={parsed.values.reportStatus} options={[['active','Active'],['open','Open'],['claim_pending','Claim pending'],['resolved','Resolved']]} />
        <Filter label="Verification" name="verificationStatus" value={parsed.values.verificationStatus} options={[['all','All states'],['pending','Pending'],['verified','Verified']]} />
        <Filter label="Custody" name="custodyStatus" value={parsed.values.custodyStatus} options={[['all','All states'],['not_applicable','Not applicable'],['not_held','Not held'],['stored','Stored'],['released','Released']]} />
        <div className={styles.filterActions}>
          <button type="submit">Apply filters</button>
          <button type="button" onClick={() => router.push("/staff/reports")}>Clear filters</button>
        </div>
      </form>
      <section className={styles.results} aria-labelledby="report-results-heading">
        <div className={styles.resultsHeader}>
          <h2 id="report-results-heading">Handling queue</h2>
          {visibleState.status === "ready" ? <p>{visibleState.page.pagination.total} reports · Page {visibleState.page.pagination.page}</p> : null}
        </div>
        <Results state={visibleState} values={parsed.values} retry={loadReports} />
      </section>
    </div>
  );
}

function Filter({ label, name, value, options }: { label: string; name: string; value: string; options: ReadonlyArray<readonly [string,string]> }) {
  return <label className={styles.filter}>{label}<select name={name} defaultValue={value}>{options.map(([optionValue, text]) => <option key={optionValue} value={optionValue}>{text}</option>)}</select></label>;
}

function Results({ state, values, retry }: { state: ListState; values: StaffReportListSearch; retry: () => Promise<void> }) {
  if (state.status === "loading") return <p className={styles.inlineState} role="status">Loading reports</p>;
  if (state.status === "error") return <div className={styles.inlineState} role="alert"><p>We could not load reports</p><button type="button" onClick={() => void retry()}>Retry reports</button></div>;
  if (state.status !== "ready") return null;
  if (state.page.reports.length === 0) return <div className={styles.inlineState}><p>{values.verificationStatus === "pending" ? "No reports are waiting for verification" : "No reports match these filters"}</p></div>;
  return <><ul className={styles.reportList}>{state.page.reports.map((report) => <ReportRow key={report.id} report={report} />)}</ul><Pagination page={state.page.pagination.page} totalPages={state.page.pagination.totalPages} values={values} /></>;
}

function ReportRow({ report }: { report: StaffReportSummary }) {
  const imagePath = report.photoUrls.find(isInternalReportImagePath);
  return <li className={styles.reportRow}><article><div className={styles.thumbnail}>{imagePath ? <Image src={imagePath} alt={report.title} width={120} height={90} unoptimized /> : <span>No preview</span>}</div><div className={styles.rowBody}><h3>{report.title}</h3><div className={styles.badges}><span>{labels.reportType[report.reportType]}</span><span>Lifecycle: {labels.status[report.status]}</span><span>Verification: {labels.verification[report.handling.verificationStatus]}</span><span>Custody: {labels.custody[report.handling.custodyStatus]}</span></div><dl><div><dt>Event date</dt><dd>{dateFormatter.format(new Date(report.occurredAt))}</dd></div><div><dt>Submitted</dt><dd>{dateFormatter.format(new Date(report.createdAt))}</dd></div></dl><Link href={`/staff/reports/${encodeURIComponent(report.id)}`} aria-label={`Open ${report.title}`}>Open report</Link></div></article></li>;
}

function Pagination({ page, totalPages, values }: { page: number; totalPages: number; values: StaffReportListSearch }) {
  if (totalPages < 1) return null;
  return <nav className={styles.pagination} aria-label="Report handling pages">{page > 1 ? <Link href={staffReportListHref({ ...values, page: page - 1 })} aria-label="Previous page">Previous</Link> : <span aria-disabled="true">Previous</span>}<span>Page {page} of {totalPages}</span>{page < totalPages ? <Link href={staffReportListHref({ ...values, page: page + 1 })} aria-label="Next page">Next</Link> : <span aria-disabled="true">Next</span>}</nav>;
}
