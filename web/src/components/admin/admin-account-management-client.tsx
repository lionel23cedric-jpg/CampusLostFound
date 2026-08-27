"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuthSession } from "@/components/auth/auth-session-provider";
import {
  BrowserAccountManagementError,
  listAdministratorAccounts,
} from "@/lib/admin/account-browser-client";
import {
  accountBrowserSearchSchema,
  type AccountBrowserQuery,
  type ManagedBrowserAccount,
  type ManagedBrowserAccountPage,
} from "@/lib/admin/account-browser-contract";

import styles from "./admin-account-management.module.css";

type ListState =
  | { status: "loading" }
  | {
      status: "ready";
      data: ManagedBrowserAccountPage;
      isRefreshing: boolean;
      refreshFailed: boolean;
    }
  | { status: "error" }
  | { status: "accessChanged" };

type FilterDraft = {
  q: string;
  role: "" | "student" | "staff";
  status: "" | "active" | "suspended" | "deactivated";
};

const EMPTY_FILTERS: FilterDraft = { q: "", role: "", status: "" };
const dateFormatter = new Intl.DateTimeFormat("en-NZ", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Pacific/Auckland",
});

function toQuery(filters: FilterDraft, page: number): AccountBrowserQuery {
  return {
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.role ? { role: filters.role } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    page,
  };
}

function titleCase(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "Never";
}

function AccountCard({ account }: { account: ManagedBrowserAccount }) {
  const headingId = `managed-account-${account.id}`;

  return (
    <li className={styles.accountCard}>
      <article aria-labelledby={headingId}>
        <header className={styles.accountHeading}>
          <div>
            <h2 id={headingId}>{account.displayName}</h2>
            <p>{account.email}</p>
          </div>
          <div className={styles.accountLabels} aria-label="Account classification">
            <span>{titleCase(account.role)}</span>
            <span>{titleCase(account.status)}</span>
          </div>
        </header>
        <dl className={styles.metadataList}>
          <div>
            <dt>Created</dt>
            <dd>
              <time dateTime={account.createdAt}>{formatDate(account.createdAt)}</time>
            </dd>
          </div>
          <div>
            <dt>Last sign in</dt>
            <dd>
              {account.lastLoginAt ? (
                <time dateTime={account.lastLoginAt}>
                  {formatDate(account.lastLoginAt)}
                </time>
              ) : (
                "Never"
              )}
            </dd>
          </div>
          <div>
            <dt>Last updated</dt>
            <dd>
              <time dateTime={account.updatedAt}>{formatDate(account.updatedAt)}</time>
            </dd>
          </div>
        </dl>
      </article>
    </li>
  );
}

export function AdminAccountManagementClient() {
  const router = useRouter();
  const { refreshSession } = useAuthSession();
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [draftFilters, setDraftFilters] =
    useState<FilterDraft>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] =
    useState<FilterDraft>(EMPTY_FILTERS);
  const [searchError, setSearchError] = useState<string | null>(null);
  const mounted = useRef(false);
  const requestId = useRef(0);
  const listController = useRef<AbortController | null>(null);

  const loadAccounts = useCallback(
    async (
      query: AccountBrowserQuery,
      mode: "initial" | "refresh",
      filtersOnSuccess?: FilterDraft,
    ) => {
      const currentRequest = ++requestId.current;
      listController.current?.abort();
      const nextController = new AbortController();
      listController.current = nextController;

      setState((current) =>
        mode === "refresh" && current.status === "ready"
          ? { ...current, isRefreshing: true, refreshFailed: false }
          : { status: "loading" },
      );

      try {
        const data = await listAdministratorAccounts(
          query,
          nextController.signal,
        );
        if (!mounted.current || requestId.current !== currentRequest) return;
        if (filtersOnSuccess) setAppliedFilters(filtersOnSuccess);
        setState({
          status: "ready",
          data,
          isRefreshing: false,
          refreshFailed: false,
        });
      } catch (error) {
        if (
          !mounted.current ||
          requestId.current !== currentRequest ||
          nextController.signal.aborted
        ) {
          return;
        }

        if (error instanceof BrowserAccountManagementError) {
          if (error.code === "AUTHENTICATION_REQUIRED") {
            setState({ status: "accessChanged" });
            await refreshSession().catch(() => undefined);
            if (mounted.current && requestId.current === currentRequest) {
              router.replace("/login");
            }
            return;
          }

          if (error.code === "ADMINISTRATOR_REQUIRED") {
            setState({ status: "accessChanged" });
            await refreshSession().catch(() => undefined);
            return;
          }
        }

        setState((current) =>
          mode === "refresh" && current.status === "ready"
            ? { ...current, isRefreshing: false, refreshFailed: true }
            : { status: "error" },
        );
      }
    },
    [refreshSession, router],
  );

  useEffect(() => {
    mounted.current = true;
    const timeoutId = window.setTimeout(() => {
      void loadAccounts({ page: 1 }, "initial");
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      mounted.current = false;
      requestId.current += 1;
      listController.current?.abort();
    };
  }, [loadAccounts]);

  function applyFilters() {
    const rawSearch = draftFilters.q;
    let normalizedSearch = "";

    if (rawSearch.trim()) {
      const parsed = accountBrowserSearchSchema.safeParse(rawSearch);
      if (!parsed.success) {
        setSearchError("Enter between 1 and 80 valid characters.");
        return;
      }
      normalizedSearch = parsed.data;
    }

    const nextFilters = { ...draftFilters, q: normalizedSearch };
    setDraftFilters(nextFilters);
    setSearchError(null);
    void loadAccounts(toQuery(nextFilters, 1), "refresh", nextFilters);
  }

  function resetFilters() {
    setDraftFilters(EMPTY_FILTERS);
    setSearchError(null);
    void loadAccounts({ page: 1 }, "refresh", EMPTY_FILTERS);
  }

  if (state.status === "loading") {
    return (
      <section className={styles.loading} aria-label="Account management">
        <p role="status" aria-live="polite">
          Loading accounts
        </p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section className={styles.statePanel} aria-labelledby="accounts-error">
        <h1 id="accounts-error">Account management unavailable</h1>
        <p>We could not load the account list. Try again.</p>
        <button
          type="button"
          onClick={() => void loadAccounts({ page: 1 }, "initial")}
        >
          Retry accounts
        </button>
      </section>
    );
  }

  if (state.status === "accessChanged") {
    return (
      <section
        className={styles.statePanel}
        aria-labelledby="accounts-access-changed"
      >
        <h1 id="accounts-access-changed">Administrator access changed</h1>
        <p>Your account no longer has access to account management.</p>
        <Link href="/dashboard">Back to dashboard</Link>
      </section>
    );
  }

  const { data } = state;
  const { page, pageSize, totalItems, totalPages } = data.pagination;
  const firstItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalItems);
  const resultLabel = `${firstItem}–${lastItem} of ${totalItems} ${
    totalItems === 1 ? "account" : "accounts"
  }`;
  const canGoBack = page > 1;
  const canGoForward = page < Math.min(totalPages, 500);

  return (
    <section
      className={styles.accountManagement}
      aria-labelledby="account-management-title"
      aria-busy={state.isRefreshing}
    >
      <header className={styles.header}>
        <div>
          <h1 id="account-management-title">Manage accounts</h1>
          <p>
            Find student and staff accounts, review their current access state
            and move through the directory without exposing restricted data.
          </p>
        </div>
        <Link href="/admin">Back to administrator overview</Link>
      </header>

      <form
        className={styles.filters}
        aria-label="Search and filter accounts"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters();
        }}
      >
        <div className={styles.filterField}>
          <label htmlFor="account-search">Search accounts</label>
          <input
            id="account-search"
            name="q"
            type="search"
            value={draftFilters.q}
            maxLength={80}
            aria-describedby={searchError ? "account-search-error" : undefined}
            aria-invalid={searchError ? "true" : undefined}
            onChange={(event) =>
              setDraftFilters((current) => ({
                ...current,
                q: event.target.value,
              }))
            }
          />
        </div>
        <div className={styles.filterField}>
          <label htmlFor="account-role">Role</label>
          <select
            id="account-role"
            name="role"
            value={draftFilters.role}
            onChange={(event) =>
              setDraftFilters((current) => ({
                ...current,
                role: event.target.value as FilterDraft["role"],
              }))
            }
          >
            <option value="">All roles</option>
            <option value="student">Student</option>
            <option value="staff">Staff</option>
          </select>
        </div>
        <div className={styles.filterField}>
          <label htmlFor="account-status">Status</label>
          <select
            id="account-status"
            name="status"
            value={draftFilters.status}
            onChange={(event) =>
              setDraftFilters((current) => ({
                ...current,
                status: event.target.value as FilterDraft["status"],
              }))
            }
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="deactivated">Deactivated</option>
          </select>
        </div>
        <div className={styles.actions}>
          <button type="submit">Apply filters</button>
          <button type="button" onClick={resetFilters}>
            Reset filters
          </button>
        </div>
      </form>

      {searchError ? (
        <div id="account-search-error" className={styles.alert} role="alert">
          {searchError}
        </div>
      ) : null}
      {state.refreshFailed ? (
        <div className={styles.alert} role="alert">
          We could not update the account list. The last valid results remain
          visible.
        </div>
      ) : null}

      <p className={styles.resultStatus} role="status" aria-live="polite">
        {state.isRefreshing ? "Updating accounts" : resultLabel}
      </p>

      {data.accounts.length === 0 ? (
        <section className={styles.emptyState} aria-labelledby="accounts-empty">
          <h2 id="accounts-empty">No accounts match these filters</h2>
          <p>Adjust the search or reset the filters to see the full directory.</p>
        </section>
      ) : (
        <ul className={styles.resultList} aria-label="Account results">
          {data.accounts.map((account) => (
            <AccountCard key={account.id} account={account} />
          ))}
        </ul>
      )}

      {totalItems > 0 ? (
        <nav className={styles.pagination} aria-label="Account result pages">
          <button
            type="button"
            disabled={state.isRefreshing || !canGoBack}
            aria-label={
              state.isRefreshing || !canGoBack
                ? "Previous page"
                : `Previous page, page ${page - 1}`
            }
            onClick={() =>
              void loadAccounts(toQuery(appliedFilters, page - 1), "refresh")
            }
          >
            Previous
          </button>
          <p>
            Page {page} of {totalPages}
          </p>
          <button
            type="button"
            disabled={state.isRefreshing || !canGoForward}
            aria-label={
              state.isRefreshing || !canGoForward
                ? "Next page"
                : `Next page, page ${page + 1}`
            }
            onClick={() =>
              void loadAccounts(toQuery(appliedFilters, page + 1), "refresh")
            }
          >
            Next
          </button>
        </nav>
      ) : null}
    </section>
  );
}
