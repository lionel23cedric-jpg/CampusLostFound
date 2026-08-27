// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { useState } from "react";

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import {
  ReferenceDataFilters,
  ReferenceDataPagination,
  type ReferenceDataStatus,
} from "./reference-data-panel-controls";

afterEach(cleanup);

function FilterHarness({
  isBusy = false,
  onSearchDraftChange = vi.fn(),
  onStatusChange = vi.fn(),
  onSearch = vi.fn(),
  onReset = vi.fn(),
}: {
  isBusy?: boolean;
  onSearchDraftChange?: (value: string) => void;
  onStatusChange?: (value: ReferenceDataStatus) => void;
  onSearch?: () => void;
  onReset?: () => void;
}) {
  const [searchDraft, setSearchDraft] = useState("");
  const [status, setStatus] = useState<ReferenceDataStatus>("all");

  return (
    <ReferenceDataFilters
      resourceLabel="categories"
      searchDraft={searchDraft}
      status={status}
      isBusy={isBusy}
      onSearchDraftChange={(value) => {
        setSearchDraft(value);
        onSearchDraftChange(value);
      }}
      onStatusChange={(value) => {
        setStatus(value);
        onStatusChange(value);
      }}
      onSearch={onSearch}
      onReset={onReset}
    />
  );
}

it("exposes labelled category filters and reports changes explicitly", async () => {
  const user = userEvent.setup();
  const onSearchDraftChange = vi.fn();
  const onStatusChange = vi.fn();
  const onSearch = vi.fn();
  const onReset = vi.fn();
  render(
    <FilterHarness
      onSearchDraftChange={onSearchDraftChange}
      onStatusChange={onStatusChange}
      onSearch={onSearch}
      onReset={onReset}
    />,
  );

  const search = screen.getByLabelText("Search categories");
  const status = screen.getByLabelText("Category status");
  expect(search.getAttribute("maxlength")).toBe("80");
  expect(screen.getByRole("option", { name: "All" })).toBeTruthy();
  expect(screen.getByRole("option", { name: "Active" })).toBeTruthy();
  expect(screen.getByRole("option", { name: "Inactive" })).toBeTruthy();

  await user.type(search, "wallet");
  expect(onSearchDraftChange).toHaveBeenLastCalledWith("wallet");
  await user.selectOptions(status, "inactive");
  expect(onStatusChange).toHaveBeenCalledWith("inactive");
  expect(onSearch).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Search categories" }));
  expect(onSearch).toHaveBeenCalledOnce();

  const reset = screen.getByRole("button", { name: "Reset category filters" });
  expect(reset.getAttribute("type")).toBe("button");
  await user.click(reset);
  expect(onReset).toHaveBeenCalledOnce();
});

it("disables every filter while its panel is busy", () => {
  render(<FilterHarness isBusy />);

  expect(screen.getByLabelText("Search categories").hasAttribute("disabled")).toBe(
    true,
  );
  expect(screen.getByLabelText("Category status").hasAttribute("disabled")).toBe(
    true,
  );
  expect(
    screen
      .getByRole("button", { name: "Search categories" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(
    screen
      .getByRole("button", { name: "Reset category filters" })
      .hasAttribute("disabled"),
  ).toBe(true);
});

it("reports the current page and emits only adjacent in-range pages", async () => {
  const user = userEvent.setup();
  const onPageChange = vi.fn();
  render(
    <ReferenceDataPagination
      resourceLabel="categories"
      page={2}
      totalPages={4}
      total={61}
      isBusy={false}
      onPageChange={onPageChange}
    />,
  );

  expect(screen.getByText("Page 2 of 4 · 61 categories")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Previous" }));
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(onPageChange.mock.calls).toEqual([[1], [3]]);
});

it.each([
  { page: 1, totalPages: 4, isBusy: false, previous: true, next: false },
  { page: 4, totalPages: 4, isBusy: false, previous: false, next: true },
  { page: 2, totalPages: 4, isBusy: true, previous: true, next: true },
  { page: 1, totalPages: 0, isBusy: false, previous: true, next: true },
])(
  "disables bounded pagination safely for $page of $totalPages while busy=$isBusy",
  async ({ page, totalPages, isBusy, previous, next }) => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(
      <ReferenceDataPagination
        resourceLabel="categories"
        page={page}
        totalPages={totalPages}
        total={totalPages === 0 ? 0 : 61}
        isBusy={isBusy}
        onPageChange={onPageChange}
      />,
    );

    const previousButton = screen.getByRole("button", { name: "Previous" });
    const nextButton = screen.getByRole("button", { name: "Next" });
    expect(previousButton.hasAttribute("disabled")).toBe(previous);
    expect(nextButton.hasAttribute("disabled")).toBe(next);
    await user.click(previousButton);
    await user.click(nextButton);

    if (previous && next) expect(onPageChange).not.toHaveBeenCalled();
    for (const [requestedPage] of onPageChange.mock.calls) {
      expect(requestedPage).toBeGreaterThanOrEqual(1);
      expect(requestedPage).toBeLessThanOrEqual(totalPages);
    }
  },
);

it("starts the shared responsive and focus-visible style vocabulary", () => {
  const css = readFileSync(
    resolve("src/components/admin/admin-reference-data.module.css"),
    "utf8",
  );

  for (const className of [
    "workspace",
    "tabs",
    "tab",
    "panel",
    "filters",
    "pagination",
    "buttonRow",
    "visuallyHidden",
  ]) {
    expect(css).toMatch(new RegExp(`\\.${className}\\b`));
  }
  expect(css).toMatch(/min-height:\s*44px/);
  expect(css).toMatch(/min-width:\s*0/);
  expect(css).toMatch(/:focus-visible/);
  expect(css).toMatch(/@media\s*\(max-width:\s*20rem\)/);
  expect(css).not.toMatch(/overflow-x:\s*(auto|scroll)/);
});
