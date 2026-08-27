"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuthSession } from "@/components/auth/auth-session-provider";
import {
  BrowserAccountManagementError,
  listAdministratorAccounts,
  updateAdministratorAccountStatus,
} from "@/lib/admin/account-browser-client";
import {
  accountBrowserSearchSchema,
  type AccountBrowserQuery,
  type AccountBrowserStatusInput,
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

type AccountAction = "suspend" | "restore" | "deactivate";
type OpenAction = { accountId: string; action: AccountAction };
type MutationStatus = "idle" | "pending" | "error";
type MutationNotice = { message: string; kind: "status" | "alert" };

const suspensionReasons = [
  ["security_concern", "Security concern"],
  ["policy_violation", "Policy violation"],
  ["administrative_review", "Administrative review"],
] as const;
type SuspensionReason = (typeof suspensionReasons)[number][0];

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

function actionInput(
  account: ManagedBrowserAccount,
  action: AccountAction,
  suspensionReason: SuspensionReason,
): AccountBrowserStatusInput {
  if (action === "suspend") {
    return {
      status: "suspended",
      reason: suspensionReason,
      expectedUpdatedAt: account.updatedAt,
    };
  }
  if (action === "restore") {
    return {
      status: "active",
      reason: "account_restored",
      expectedUpdatedAt: account.updatedAt,
    };
  }
  return {
    status: "deactivated",
    reason: "account_closed",
    expectedUpdatedAt: account.updatedAt,
  };
}

const actionLabels = {
  suspend: { verb: "Suspend", noun: "suspension" },
  restore: { verb: "Restore", noun: "restoration" },
  deactivate: { verb: "Deactivate", noun: "deactivation" },
} as const;

type AccountCardProps = {
  account: ManagedBrowserAccount;
  openAction: OpenAction | null;
  isMutating: boolean;
  suspensionReason: SuspensionReason;
  mutationError: string | null;
  confirmationHeadingRef: React.RefObject<HTMLHeadingElement | null>;
  setActionRegion: (accountId: string, node: HTMLDivElement | null) => void;
  onOpen: (
    accountId: string,
    action: AccountAction,
    trigger: HTMLButtonElement,
  ) => void;
  onCancel: () => void;
  onConfirm: () => void;
  onSuspensionReasonChange: (reason: SuspensionReason) => void;
};

function AccountCard({
  account,
  openAction,
  isMutating,
  suspensionReason,
  mutationError,
  confirmationHeadingRef,
  setActionRegion,
  onOpen,
  onCancel,
  onConfirm,
  onSuspensionReasonChange,
}: AccountCardProps) {
  const headingId = `managed-account-${account.id}`;
  const activeAction =
    openAction?.accountId === account.id ? openAction.action : null;

  function actionButton(action: AccountAction) {
    const label = actionLabels[action].verb;
    return (
      <button
        type="button"
        disabled={isMutating}
        onClick={(event) => onOpen(account.id, action, event.currentTarget)}
      >
        {label} {account.displayName}
      </button>
    );
  }

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
        <div
          ref={(node) => setActionRegion(account.id, node)}
          className={styles.accountActions}
          role="region"
          aria-label={`Account actions for ${account.displayName}`}
          tabIndex={-1}
        >
          <div className={styles.actionButtons}>
            {account.status === "active" ? (
              <>
                {actionButton("suspend")}
                {actionButton("deactivate")}
              </>
            ) : account.status === "suspended" ? (
              <>
                {actionButton("restore")}
                {actionButton("deactivate")}
              </>
            ) : (
              <p>No further status changes are available.</p>
            )}
          </div>

          {activeAction ? (
            <section
              className={styles.confirmation}
              aria-labelledby={`account-confirmation-${account.id}`}
            >
              <h3
                id={`account-confirmation-${account.id}`}
                ref={confirmationHeadingRef}
                tabIndex={-1}
              >
                {actionLabels[activeAction].verb} {account.displayName}?
              </h3>
              <p>
                This access change takes effect immediately. All current
                sessions will be revoked.
              </p>
              {activeAction === "suspend" ? (
                <label className={styles.reasonField}>
                  <span>Suspension reason</span>
                  <select
                    value={suspensionReason}
                    disabled={isMutating}
                    onChange={(event) =>
                      onSuspensionReasonChange(
                        event.target.value as SuspensionReason,
                      )
                    }
                  >
                    {suspensionReasons.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {mutationError ? (
                <div
                  className={styles.mutationError}
                  role="alert"
                  aria-label="Account change failed"
                >
                  {mutationError}
                </div>
              ) : null}
              <div className={styles.confirmationActions}>
                <button
                  type="button"
                  disabled={isMutating}
                  aria-label={
                    isMutating
                      ? "Changing account status"
                      : `Confirm ${actionLabels[activeAction].noun}`
                  }
                  onClick={onConfirm}
                >
                  {isMutating
                    ? "Changing status"
                    : `Confirm ${actionLabels[activeAction].noun}`}
                </button>
                <button
                  type="button"
                  disabled={isMutating}
                  onClick={onCancel}
                >
                  Cancel account change
                </button>
              </div>
            </section>
          ) : null}
        </div>
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
  const [openAction, setOpenAction] = useState<OpenAction | null>(null);
  const [suspensionReason, setSuspensionReason] =
    useState<SuspensionReason>("administrative_review");
  const [mutationStatus, setMutationStatus] =
    useState<MutationStatus>("idle");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutationNotice, setMutationNotice] =
    useState<MutationNotice | null>(null);
  const mounted = useRef(false);
  const requestId = useRef(0);
  const listController = useRef<AbortController | null>(null);
  const mutationRequestId = useRef(0);
  const mutationController = useRef<AbortController | null>(null);
  const mutationPendingRef = useRef(false);
  const initiatingButton = useRef<HTMLButtonElement | null>(null);
  const confirmationHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const actionRegions = useRef(new Map<string, HTMLDivElement>());

  const loadAccounts = useCallback(
    async (
      query: AccountBrowserQuery,
      mode: "initial" | "refresh",
      filtersOnSuccess?: FilterDraft,
    ) => {
      if (!mutationPendingRef.current) {
        setOpenAction(null);
        setMutationError(null);
        setMutationStatus("idle");
      }
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
        if (!mounted.current || requestId.current !== currentRequest) {
          return false;
        }
        if (filtersOnSuccess) setAppliedFilters(filtersOnSuccess);
        setState({
          status: "ready",
          data,
          isRefreshing: false,
          refreshFailed: false,
        });
        return true;
      } catch (error) {
        if (
          !mounted.current ||
          requestId.current !== currentRequest ||
          nextController.signal.aborted
        ) {
          return false;
        }

        if (error instanceof BrowserAccountManagementError) {
          if (error.code === "AUTHENTICATION_REQUIRED") {
            setState({ status: "accessChanged" });
            await refreshSession().catch(() => undefined);
            if (mounted.current && requestId.current === currentRequest) {
              router.replace("/login");
            }
            return false;
          }

          if (error.code === "ADMINISTRATOR_REQUIRED") {
            setState({ status: "accessChanged" });
            await refreshSession().catch(() => undefined);
            return false;
          }
        }

        setState((current) =>
          mode === "refresh" && current.status === "ready"
            ? { ...current, isRefreshing: false, refreshFailed: true }
            : { status: "error" },
        );
        return false;
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
      mutationRequestId.current += 1;
      listController.current?.abort();
      mutationController.current?.abort();
      mutationPendingRef.current = false;
    };
  }, [loadAccounts]);

  useEffect(() => {
    if (openAction) confirmationHeadingRef.current?.focus();
  }, [openAction]);

  function setActionRegion(accountId: string, node: HTMLDivElement | null) {
    if (node) actionRegions.current.set(accountId, node);
    else actionRegions.current.delete(accountId);
  }

  function focusActionRegion(accountId: string) {
    window.setTimeout(() => actionRegions.current.get(accountId)?.focus(), 0);
  }

  function openConfirmation(
    accountId: string,
    action: AccountAction,
    trigger: HTMLButtonElement,
  ) {
    if (mutationStatus === "pending") return;
    initiatingButton.current = trigger;
    setSuspensionReason("administrative_review");
    setMutationError(null);
    setMutationNotice(null);
    setMutationStatus("idle");
    setOpenAction({ accountId, action });
  }

  function cancelConfirmation() {
    if (mutationStatus === "pending") return;
    const trigger = initiatingButton.current;
    setOpenAction(null);
    setMutationError(null);
    setMutationStatus("idle");
    window.setTimeout(() => trigger?.focus(), 0);
  }

  async function confirmAction() {
    if (
      !openAction ||
      mutationStatus === "pending" ||
      state.status !== "ready"
    ) {
      return;
    }

    const account = state.data.accounts.find(
      (candidate) => candidate.id === openAction.accountId,
    );
    if (!account) return;

    const action = openAction.action;
    const committedQuery = toQuery(
      appliedFilters,
      state.data.pagination.page,
    );
    const currentRequest = ++mutationRequestId.current;
    mutationController.current?.abort();
    const nextController = new AbortController();
    mutationController.current = nextController;
    mutationPendingRef.current = true;
    setMutationStatus("pending");
    setMutationError(null);
    setMutationNotice(null);

    try {
      const updated = await updateAdministratorAccountStatus(
        account.id,
        actionInput(account, action, suspensionReason),
        nextController.signal,
      );
      if (updated.id !== account.id) {
        throw new Error("Account response target mismatch");
      }
      if (
        !mounted.current ||
        mutationRequestId.current !== currentRequest ||
        nextController.signal.aborted
      ) {
        return;
      }

      setState((current) =>
        current.status === "ready"
          ? {
              ...current,
              data: {
                ...current.data,
                accounts: current.data.accounts.map((candidate) =>
                  candidate.id === updated.id ? updated : candidate,
                ),
              },
            }
          : current,
      );
      setOpenAction(null);
      setMutationStatus("idle");
      mutationPendingRef.current = false;
      setMutationNotice({
        kind: "status",
        message:
          action === "suspend"
            ? "Account suspended. Existing sessions were revoked."
            : action === "restore"
              ? "Account restored. Existing sessions were revoked."
              : "Account deactivated. Existing sessions were revoked.",
      });
      focusActionRegion(account.id);
    } catch (error) {
      if (
        !mounted.current ||
        mutationRequestId.current !== currentRequest ||
        nextController.signal.aborted
      ) {
        return;
      }

      if (error instanceof BrowserAccountManagementError) {
        if (
          error.code === "AUTHENTICATION_REQUIRED" ||
          error.code === "ADMINISTRATOR_REQUIRED"
        ) {
          setOpenAction(null);
          setMutationStatus("idle");
          setMutationError(null);
          mutationPendingRef.current = false;
          setState({ status: "accessChanged" });
          await refreshSession().catch(() => undefined);
          if (
            error.code === "AUTHENTICATION_REQUIRED" &&
            mounted.current &&
            mutationRequestId.current === currentRequest
          ) {
            router.replace("/login");
          }
          return;
        }

        if (
          error.code === "ACCOUNT_STATE_CONFLICT" ||
          error.code === "ACCOUNT_NOT_FOUND"
        ) {
          setOpenAction(null);
          setMutationStatus("idle");
          setMutationError(null);
          mutationPendingRef.current = false;
          const refreshed = await loadAccounts(committedQuery, "refresh");
          if (refreshed) {
            setMutationNotice({
              kind: "status",
              message:
                error.code === "ACCOUNT_STATE_CONFLICT"
                  ? "Account data changed. The current list has been refreshed."
                  : "That account is no longer available. The current list has been refreshed.",
            });
            focusActionRegion(account.id);
          }
          return;
        }

        if (error.code === "ACCOUNT_ACTION_FORBIDDEN") {
          setOpenAction(null);
          setMutationStatus("idle");
          setMutationError(null);
          mutationPendingRef.current = false;
          setMutationNotice({
            kind: "alert",
            message: "This account action is not permitted.",
          });
          window.setTimeout(() => initiatingButton.current?.focus(), 0);
          return;
        }
      }

      setMutationStatus("error");
      mutationPendingRef.current = false;
      setMutationError(
        "We could not update this account. Check the current state and try again.",
      );
    }
  }

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
  const mutationPending = mutationStatus === "pending";

  return (
    <section
      className={styles.accountManagement}
      aria-labelledby="account-management-title"
      aria-busy={state.isRefreshing || mutationPending}
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
            disabled={mutationPending}
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
            disabled={mutationPending}
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
            disabled={mutationPending}
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
          <button type="submit" disabled={mutationPending}>
            Apply filters
          </button>
          <button
            type="button"
            disabled={mutationPending}
            onClick={resetFilters}
          >
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

      {mutationNotice ? (
        <p
          className={
            mutationNotice.kind === "alert"
              ? styles.mutationAlert
              : styles.mutationNotice
          }
          role={mutationNotice.kind}
          aria-live={mutationNotice.kind === "status" ? "polite" : undefined}
          aria-label={
            mutationNotice.kind === "alert"
              ? "Account action not permitted"
              : undefined
          }
        >
          {mutationNotice.message}
        </p>
      ) : null}

      {data.accounts.length === 0 ? (
        <section className={styles.emptyState} aria-labelledby="accounts-empty">
          <h2 id="accounts-empty">No accounts match these filters</h2>
          <p>Adjust the search or reset the filters to see the full directory.</p>
        </section>
      ) : (
        <ul className={styles.resultList} aria-label="Account results">
          {data.accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              openAction={openAction}
              isMutating={mutationPending || state.isRefreshing}
              suspensionReason={suspensionReason}
              mutationError={mutationError}
              confirmationHeadingRef={confirmationHeadingRef}
              setActionRegion={setActionRegion}
              onOpen={openConfirmation}
              onCancel={cancelConfirmation}
              onConfirm={() => void confirmAction()}
              onSuspensionReasonChange={setSuspensionReason}
            />
          ))}
        </ul>
      )}

      {totalItems > 0 ? (
        <nav className={styles.pagination} aria-label="Account result pages">
          <button
            type="button"
            disabled={state.isRefreshing || mutationPending || !canGoBack}
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
            disabled={state.isRefreshing || mutationPending || !canGoForward}
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
