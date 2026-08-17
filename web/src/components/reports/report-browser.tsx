"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { useAuthSession } from "@/components/auth/auth-session-provider";
import {
  parseReportSearchParams,
  reportSearchHref,
  validateReportSearch,
  type ReportSearchErrors,
  type ReportSearchValues,
} from "@/lib/reports/browse-search";
import {
  BrowserReportError,
  getReportCampusLocations,
  getReportCategories,
  getReports,
  type ReportCampusLocation,
  type ReportCategory,
  type ReportPage,
} from "@/lib/reports/browser-client";

import { ReportCard } from "./report-card";
import styles from "./report-browsing.module.css";

type ReportState =
  | { status: "loading"; queryKey: string }
  | { status: "ready"; queryKey: string; page: ReportPage }
  | { status: "error"; queryKey: string };

type ReferenceState =
  | { status: "loading" }
  | {
      status: "ready";
      categories: ReportCategory[];
      campusLocations: ReportCampusLocation[];
    }
  | { status: "error" };

const searchFields = [
  "q",
  "reportType",
  "categoryId",
  "campusLocationId",
  "status",
  "color",
  "occurredFrom",
  "occurredTo",
  "hasPhoto",
] as const satisfies ReadonlyArray<keyof ReportSearchValues>;

export function ReportBrowser() {
  const router = useRouter();
  const session = useAuthSession();

  useEffect(() => {
    if (session.status === "unauthenticated") router.replace("/login");
  }, [router, session.status]);

  if (session.status === "unavailable") {
    return (
      <section
        className={styles.statePanel}
        role="alert"
        aria-labelledby="browse-session-error"
      >
        <p className={styles.kicker}>Account check</p>
        <h1 id="browse-session-error">We could not check your account</h1>
        <p>Your session may still be active. Retry when the service is available.</p>
        <button
          className={styles.primaryButton}
          type="button"
          onClick={() => void session.refreshSession()}
        >
          Retry session check
        </button>
      </section>
    );
  }

  if (session.status !== "authenticated" || !session.user) {
    return (
      <section className={styles.loading} role="status" aria-live="polite">
        {session.status === "unauthenticated"
          ? "Taking you to sign in"
          : "Checking your account"}
      </section>
    );
  }

  if (session.user.status !== "active") {
    return <PermissionUnavailable />;
  }

  return <ActiveReportBrowser key={session.user.id} />;
}

function PermissionUnavailable() {
  return (
    <section
      className={styles.statePanel}
      role="alert"
      aria-labelledby="browse-permission-heading"
    >
      <p className={styles.kicker}>Campus reports</p>
      <h1 id="browse-permission-heading">Report browsing unavailable</h1>
      <p>Your account cannot browse member reports at the moment.</p>
      <Link className={styles.secondaryLink} href="/dashboard">
        Back to dashboard
      </Link>
    </section>
  );
}

function ActiveReportBrowser() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryKey = searchParams.toString();
  const parsedSearch = useMemo(
    () => parseReportSearchParams(new URLSearchParams(queryKey)),
    [queryKey],
  );
  const [reportState, setReportState] = useState<ReportState>({
    status: "loading",
    queryKey,
  });
  const [referenceState, setReferenceState] = useState<ReferenceState>({
    status: "loading",
  });
  const [permissionUnavailable, setPermissionUnavailable] = useState(false);
  const [formValidation, setFormValidation] = useState<{
    queryKey: string;
    errors: ReportSearchErrors;
  }>({ queryKey, errors: {} });
  const mounted = useRef(false);
  const reportRequestId = useRef(0);
  const referenceRequestId = useRef(0);
  const pendingResultFocus = useRef(false);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  const errorHeadingRef = useRef<HTMLHeadingElement>(null);

  const classifyError = useCallback(
    (error: unknown) => {
      if (!(error instanceof BrowserReportError)) return false;
      if (error.status === 401 || error.code === "AUTHENTICATION_REQUIRED") {
        router.replace("/login");
        return true;
      }
      if (error.status === 403 || error.code === "ACCOUNT_UNAVAILABLE") {
        setPermissionUnavailable(true);
        return true;
      }
      return false;
    },
    [router],
  );

  const loadReports = useCallback(
    async (focusResults = false) => {
      if (!mounted.current) return;
      const currentRequest = ++reportRequestId.current;
      setReportState({ status: "loading", queryKey });

      try {
        const page = await getReports(parsedSearch.request);
        if (!mounted.current || currentRequest !== reportRequestId.current) return;

        const requestedPage = parsedSearch.request.page ?? 1;
        if (
          page.reports.length === 0 &&
          page.pagination.totalPages > 0 &&
          requestedPage > page.pagination.totalPages
        ) {
          pendingResultFocus.current = focusResults;
          router.replace(
            reportSearchHref({
              ...parsedSearch.request,
              page: page.pagination.totalPages,
            }),
          );
          return;
        }

        setReportState({ status: "ready", queryKey, page });
        if (focusResults) {
          window.requestAnimationFrame(() => {
            const heading = resultsHeadingRef.current;
            if (heading?.dataset.queryKey === queryKey) heading.focus();
          });
        }
      } catch (error) {
        if (!mounted.current || currentRequest !== reportRequestId.current) return;
        if (!classifyError(error)) {
          setReportState({ status: "error", queryKey });
        }
      }
    },
    [classifyError, parsedSearch.request, queryKey, router],
  );

  const loadReferences = useCallback(async () => {
    if (!mounted.current) return;
    const currentRequest = ++referenceRequestId.current;
    setReferenceState({ status: "loading" });

    try {
      const [categories, campusLocations] = await Promise.all([
        getReportCategories(),
        getReportCampusLocations(),
      ]);
      if (!mounted.current || currentRequest !== referenceRequestId.current) return;
      setReferenceState({ status: "ready", categories, campusLocations });
    } catch (error) {
      if (!mounted.current || currentRequest !== referenceRequestId.current) return;
      if (!classifyError(error)) setReferenceState({ status: "error" });
    }
  }, [classifyError]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      reportRequestId.current += 1;
      referenceRequestId.current += 1;
    };
  }, []);

  useEffect(() => {
    const shouldFocus = pendingResultFocus.current;
    pendingResultFocus.current = false;
    const timeoutId = window.setTimeout(() => {
      void loadReports(shouldFocus);
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
      reportRequestId.current += 1;
    };
  }, [loadReports]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadReferences();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadReferences]);

  const formErrors =
    formValidation.queryKey === queryKey ? formValidation.errors : {};

  useEffect(() => {
    if (
      formValidation.queryKey === queryKey &&
      Object.keys(formValidation.errors).length > 0
    ) {
      errorHeadingRef.current?.focus();
    }
  }, [formValidation, queryKey]);

  if (permissionUnavailable) return <PermissionUnavailable />;

  const values = parsedSearch.values;
  const request = parsedSearch.request;
  const visibleReportState: ReportState =
    reportState.queryKey === queryKey
      ? reportState
      : { status: "loading", queryKey };
  const categoryNames = new Map(
    referenceState.status === "ready"
      ? referenceState.categories.map((category) => [category.id, category.name])
      : [],
  );
  const campusLocationNames = new Map(
    referenceState.status === "ready"
      ? referenceState.campusLocations.map((location) => [
          location.id,
          `${location.campusName} · ${location.locationName}`,
        ])
      : [],
  );
  const selectedCategory =
    referenceState.status === "ready"
      ? referenceState.categories.find(
          (category) => category.id === values.categoryId,
        )
      : undefined;
  const selectedLocation =
    referenceState.status === "ready"
      ? referenceState.campusLocations.find(
          (location) => location.id === values.campusLocationId,
        )
      : undefined;
  const hasFilters = Object.keys(request).some((key) => key !== "page");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submitted = Object.fromEntries(
      searchFields.map((field) => [field, String(formData.get(field) ?? "")]),
    ) as ReportSearchValues;
    const validation = validateReportSearch(submitted);
    if (!validation.success) {
      setFormValidation({ queryKey, errors: validation.errors });
      return;
    }

    setFormValidation({ queryKey, errors: {} });
    pendingResultFocus.current = true;
    router.push(reportSearchHref(validation.request));
  }

  const fieldError = (name: keyof ReportSearchValues) => formErrors[name]?.[0];
  const fieldAccessibility = (name: keyof ReportSearchValues) => ({
    "aria-invalid": fieldError(name) ? (true as const) : undefined,
    "aria-describedby": fieldError(name) ? `${name}-error` : undefined,
  });
  const totalLabel =
    visibleReportState.status === "ready"
      ? `${visibleReportState.page.pagination.total} ${
          visibleReportState.page.pagination.total === 1 ? "report" : "reports"
        }`
      : "Reports";

  const referenceWarning =
    referenceState.status === "error" ? (
      <div className={styles.inlineState} role="alert">
        <p>Report labels are temporarily unavailable.</p>
        <button type="button" onClick={() => void loadReferences()}>
          Retry report labels
        </button>
      </div>
    ) : null;

  let reportContent;
  if (visibleReportState.status === "loading") {
    reportContent = <p role="status">Loading reports</p>;
  } else if (visibleReportState.status === "error") {
    reportContent = (
      <div className={styles.inlineState} role="alert">
        <p>We could not load reports.</p>
        <button type="button" onClick={() => void loadReports(false)}>
          Retry reports
        </button>
      </div>
    );
  } else if (visibleReportState.page.reports.length === 0) {
    reportContent = hasFilters ? (
      <div className={styles.emptyState}>
        <p>No reports match these filters.</p>
        <Link href="/reports" onClick={() => (pendingResultFocus.current = true)}>
          Clear filters
        </Link>
      </div>
    ) : (
      <div className={styles.emptyState}>
        <p>No reports have been shared yet.</p>
        <Link href="/reports/new">Report an item</Link>
      </div>
    );
  } else {
    reportContent = (
      <div className={styles.reportList}>
        {visibleReportState.page.reports.map((report) => (
          <ReportCard
            key={report.id}
            report={report}
            categoryName={
              referenceState.status === "loading"
                ? "Category details loading"
                : categoryNames.get(report.categoryId) ?? "Category unavailable"
            }
            campusLocationName={
              report.campusLocationId
                ? referenceState.status === "loading"
                  ? "Campus location details loading"
                  : campusLocationNames.get(report.campusLocationId) ??
                    "Campus location unavailable"
                : "Location hidden"
            }
          />
        ))}
      </div>
    );
  }

  const pagination =
    visibleReportState.status === "ready" &&
    visibleReportState.page.pagination.totalPages > 0
      ? (() => {
          const { page, totalPages } = visibleReportState.page.pagination;
          const previousHref =
            page > 1 ? reportSearchHref({ ...request, page: page - 1 }) : undefined;
          const nextHref =
            page < totalPages
              ? reportSearchHref({ ...request, page: page + 1 })
              : undefined;
          return (
            <nav aria-label="Report result pages" className={styles.pagination}>
              {previousHref ? (
                <Link
                  href={previousHref}
                  onClick={() => (pendingResultFocus.current = true)}
                >
                  Previous
                </Link>
              ) : (
                <span aria-disabled="true">Previous</span>
              )}
              <span>
                Page {page} of {totalPages}
              </span>
              {nextHref ? (
                <Link
                  href={nextHref}
                  onClick={() => (pendingResultFocus.current = true)}
                >
                  Next
                </Link>
              ) : (
                <span aria-disabled="true">Next</span>
              )}
            </nav>
          );
        })()
      : null;

  return (
    <div className={styles.browserPage}>
      <header className={styles.introduction}>
        <p className={styles.kicker}>Campus reports</p>
        <h1>Find an item</h1>
        <p>Search privacy-safe lost and found reports shared by campus members.</p>
      </header>

      {parsedSearch.ignoredInvalidValues ? (
        <p className={styles.queryNotice} role="status">
          Some invalid search filters were ignored.
        </p>
      ) : null}

      <div className={styles.workspace}>
        <form
          key={queryKey}
          role="search"
          aria-labelledby="report-filter-heading"
          className={styles.filters}
          onSubmit={handleSubmit}
          noValidate
        >
          <h2 id="report-filter-heading">Filter reports</h2>
          {Object.keys(formErrors).length > 0 ? (
            <section className={styles.errorSummary} role="alert">
              <h3 ref={errorHeadingRef} tabIndex={-1}>
                Check your search
              </h3>
              <p>Correct the highlighted fields and try again.</p>
            </section>
          ) : null}

          <label>
            Keyword
            <input
              aria-label="Keyword"
              name="q"
              defaultValue={values.q}
              {...fieldAccessibility("q")}
            />
            {fieldError("q") ? <span id="q-error">{fieldError("q")}</span> : null}
          </label>
          <label>
            Report type
            <select
              aria-label="Report type"
              name="reportType"
              defaultValue={values.reportType}
              {...fieldAccessibility("reportType")}
            >
              <option value="">Any type</option>
              <option value="lost">Lost</option>
              <option value="found">Found</option>
            </select>
            {fieldError("reportType") ? (
              <span id="reportType-error">{fieldError("reportType")}</span>
            ) : null}
          </label>
          <label>
            Status
            <select
              aria-label="Status"
              name="status"
              defaultValue={values.status}
              {...fieldAccessibility("status")}
            >
              <option value="">Any status</option>
              <option value="open">Open</option>
              <option value="claim_pending">Claim pending</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
            {fieldError("status") ? (
              <span id="status-error">{fieldError("status")}</span>
            ) : null}
          </label>
          <label>
            Category
            <select
              aria-label="Category"
              name="categoryId"
              defaultValue={values.categoryId}
              {...fieldAccessibility("categoryId")}
            >
              <option value="">Any category</option>
              {values.categoryId ? (
                <option value={values.categoryId}>
                  {selectedCategory?.name ?? "Selected category"}
                </option>
              ) : null}
              {referenceState.status === "ready"
                ? referenceState.categories
                    .filter((category) => category.id !== values.categoryId)
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))
                : null}
            </select>
            {fieldError("categoryId") ? (
              <span id="categoryId-error">{fieldError("categoryId")}</span>
            ) : null}
          </label>
          <label>
            Campus location
            <select
              aria-label="Campus location"
              name="campusLocationId"
              defaultValue={values.campusLocationId}
              {...fieldAccessibility("campusLocationId")}
            >
              <option value="">Any campus location</option>
              {values.campusLocationId ? (
                <option value={values.campusLocationId}>
                  {selectedLocation
                    ? `${selectedLocation.campusName} · ${selectedLocation.locationName}`
                    : "Selected campus location"}
                </option>
              ) : null}
              {referenceState.status === "ready"
                ? referenceState.campusLocations
                    .filter((location) => location.id !== values.campusLocationId)
                    .map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.campusName} · {location.locationName}
                      </option>
                    ))
                : null}
            </select>
            {fieldError("campusLocationId") ? (
              <span id="campusLocationId-error">
                {fieldError("campusLocationId")}
              </span>
            ) : null}
          </label>
          <label>
            Colour
            <input
              aria-label="Colour"
              name="color"
              defaultValue={values.color}
              maxLength={32}
              {...fieldAccessibility("color")}
            />
            {fieldError("color") ? (
              <span id="color-error">{fieldError("color")}</span>
            ) : null}
          </label>
          <label>
            Occurred from
            <input
              aria-label="Occurred from"
              name="occurredFrom"
              type="date"
              defaultValue={values.occurredFrom}
              {...fieldAccessibility("occurredFrom")}
            />
            {fieldError("occurredFrom") ? (
              <span id="occurredFrom-error">{fieldError("occurredFrom")}</span>
            ) : null}
          </label>
          <label>
            Occurred to
            <input
              aria-label="Occurred to"
              name="occurredTo"
              type="date"
              defaultValue={values.occurredTo}
              {...fieldAccessibility("occurredTo")}
            />
            {fieldError("occurredTo") ? (
              <span id="occurredTo-error">{fieldError("occurredTo")}</span>
            ) : null}
          </label>
          <label>
            Photo availability
            <select
              aria-label="Photo availability"
              name="hasPhoto"
              defaultValue={values.hasPhoto}
              {...fieldAccessibility("hasPhoto")}
            >
              <option value="">Any</option>
              <option value="true">Has a visible photo</option>
              <option value="false">No visible photo</option>
            </select>
            {fieldError("hasPhoto") ? (
              <span id="hasPhoto-error">{fieldError("hasPhoto")}</span>
            ) : null}
          </label>

          <div className={styles.filterActions}>
            <button className={styles.primaryButton} type="submit">
              Search reports
            </button>
            <Link
              className={styles.secondaryLink}
              href="/reports"
              onClick={() => (pendingResultFocus.current = true)}
            >
              Clear filters
            </Link>
          </div>
        </form>

        <section aria-labelledby="report-results-heading" className={styles.results}>
          <h2
            id="report-results-heading"
            ref={resultsHeadingRef}
            data-query-key={queryKey}
            tabIndex={-1}
          >
            <span aria-live="polite">{totalLabel}</span>
          </h2>
          {referenceWarning}
          {reportContent}
          {pagination}
        </section>
      </div>
    </div>
  );
}
