"use client";

import type { FormEvent } from "react";

import { REFERENCE_DATA_STATUSES } from "@/lib/admin/reference-data-contract";

import styles from "./admin-reference-data.module.css";

export type ReferenceDataStatus = "all" | "active" | "inactive";

const statusLabels: Record<ReferenceDataStatus, string> = {
  all: "All",
  active: "Active",
  inactive: "Inactive",
};

function isReferenceDataStatus(value: string): value is ReferenceDataStatus {
  return REFERENCE_DATA_STATUSES.some((status) => status === value);
}

function resourceCopy(resourceLabel: string) {
  return resourceLabel === "categories"
    ? { singular: "category", statusLabel: "Category status" }
    : {
        singular: "campus location",
        statusLabel: "Campus location status",
      };
}

export function ReferenceDataFilters({
  resourceLabel,
  searchDraft,
  status,
  isBusy,
  onSearchDraftChange,
  onStatusChange,
  onSearch,
  onReset,
}: {
  resourceLabel: string;
  searchDraft: string;
  status: ReferenceDataStatus;
  isBusy: boolean;
  onSearchDraftChange(value: string): void;
  onStatusChange(value: ReferenceDataStatus): void;
  onSearch(): void;
  onReset(): void;
}): React.JSX.Element {
  const resourceId = resourceLabel.replaceAll(" ", "-");
  const copy = resourceCopy(resourceLabel);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isBusy) onSearch();
  }

  return (
    <form className={styles.filters} role="search" onSubmit={handleSubmit}>
      <div className={styles.filterField}>
        <label htmlFor={`${resourceId}-search`}>Search {resourceLabel}</label>
        <input
          id={`${resourceId}-search`}
          type="search"
          value={searchDraft}
          maxLength={80}
          disabled={isBusy}
          onChange={(event) => onSearchDraftChange(event.target.value)}
        />
      </div>

      <div className={styles.filterField}>
        <label htmlFor={`${resourceId}-status`}>{copy.statusLabel}</label>
        <select
          id={`${resourceId}-status`}
          value={status}
          disabled={isBusy}
          onChange={(event) => {
            if (isReferenceDataStatus(event.target.value)) {
              onStatusChange(event.target.value);
            }
          }}
        >
          {REFERENCE_DATA_STATUSES.map((value) => (
            <option key={value} value={value}>
              {statusLabels[value]}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.buttonRow}>
        <button type="submit" disabled={isBusy}>
          Search {resourceLabel}
        </button>
        <button type="button" disabled={isBusy} onClick={onReset}>
          Reset {copy.singular} filters
        </button>
      </div>
    </form>
  );
}

export function ReferenceDataPagination({
  resourceLabel,
  page,
  totalPages,
  total,
  isBusy,
  onPageChange,
}: {
  resourceLabel: string;
  page: number;
  totalPages: number;
  total: number;
  isBusy: boolean;
  onPageChange(page: number): void;
}): React.JSX.Element {
  const hasPages = totalPages >= 1;
  const previousPage = page - 1;
  const nextPage = page + 1;
  const previousDisabled = isBusy || !hasPages || previousPage < 1;
  const nextDisabled = isBusy || !hasPages || nextPage > totalPages;

  function requestPage(requestedPage: number) {
    if (
      !isBusy &&
      Number.isInteger(requestedPage) &&
      requestedPage >= 1 &&
      requestedPage <= totalPages &&
      requestedPage !== page
    ) {
      onPageChange(requestedPage);
    }
  }

  return (
    <nav className={styles.pagination} aria-label={`${resourceLabel} pages`}>
      <button
        type="button"
        disabled={previousDisabled}
        onClick={() => requestPage(previousPage)}
      >
        Previous
      </button>
      <p aria-live="polite">
        {hasPages
          ? `Page ${page} of ${totalPages} · ${total} ${resourceLabel}`
          : `0 ${resourceLabel}`}
      </p>
      <button
        type="button"
        disabled={nextDisabled}
        onClick={() => requestPage(nextPage)}
      >
        Next
      </button>
    </nav>
  );
}
