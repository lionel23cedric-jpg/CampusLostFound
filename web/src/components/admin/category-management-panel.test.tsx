// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/components/auth/auth-session-provider", () => ({
  useAuthSession: vi.fn(),
}));
vi.mock("@/lib/admin/reference-data-browser-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/admin/reference-data-browser-client")
  >("@/lib/admin/reference-data-browser-client");
  return {
    ...actual,
    listAdministratorCategories: vi.fn(),
    createAdministratorCategory: vi.fn(),
    updateAdministratorCategory: vi.fn(),
  };
});

import { useRouter } from "next/navigation";
import { useAuthSession } from "@/components/auth/auth-session-provider";
import {
  BrowserReferenceDataError,
  createAdministratorCategory,
  listAdministratorCategories,
  updateAdministratorCategory,
  type BrowserReferenceDataErrorCode,
} from "@/lib/admin/reference-data-browser-client";
import type {
  AdminCategory,
  AdminCategoryPage,
} from "@/lib/admin/reference-data-contract";

import { CategoryManagementPanel } from "./category-management-panel";

const wallet: AdminCategory = {
  id: "64b64c5f2f8f9e0012345678",
  name: "Wallet",
  description: "Wallets and purses",
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-27T01:00:00.000Z",
};
const keys: AdminCategory = {
  id: "64b64c5f2f8f9e0012345679",
  name: "Keys",
  description: null,
  isActive: false,
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-27T02:00:00.000Z",
};

function categoryPage(
  categories: AdminCategory[] = [wallet, keys],
  overrides: Partial<AdminCategoryPage> = {},
): AdminCategoryPage {
  const total = overrides.total ?? categories.length;
  return {
    categories,
    page: 1,
    pageSize: 20,
    total,
    totalPages: Math.ceil(total / 20),
    ...overrides,
  };
}

const approvedErrors: Record<
  BrowserReferenceDataErrorCode,
  readonly [number, string]
> = {
  INVALID_REFERENCE_DATA_REQUEST: [400, "Reference data request is invalid"],
  AUTHENTICATION_REQUIRED: [401, "Authentication required"],
  ADMINISTRATOR_REQUIRED: [403, "Administrator access required"],
  REFERENCE_DATA_NOT_FOUND: [404, "Reference data not found"],
  REFERENCE_DATA_DUPLICATE: [409, "Reference data already exists"],
  REFERENCE_DATA_STATE_CONFLICT: [409, "Reference data has changed"],
  REFERENCE_DATA_OPERATION_FAILED: [500, "Reference data operation failed"],
};

function browserError(code: BrowserReferenceDataErrorCode) {
  const [status, message] = approvedErrors[code];
  return new BrowserReferenceDataError(code, status, message);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const replace = vi.fn();
const refreshSession = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listAdministratorCategories).mockReset();
  vi.mocked(createAdministratorCategory).mockReset();
  vi.mocked(updateAdministratorCategory).mockReset();
  vi.mocked(useRouter).mockReturnValue({ replace } as never);
  vi.mocked(useAuthSession).mockReturnValue({
    status: "authenticated",
    user: null,
    setAuthenticatedUser: vi.fn(),
    refreshSession,
    logout: vi.fn(),
  });
});

afterEach(cleanup);

it("loads page one and renders privacy-safe category cards", async () => {
  vi.mocked(listAdministratorCategories).mockResolvedValue(categoryPage());
  const { container } = render(<CategoryManagementPanel />);

  expect(screen.getByRole("status").textContent).toContain("Loading categories");
  expect(screen.getByRole("heading", { name: "Categories" })).toBeTruthy();
  expect(await screen.findByRole("heading", { name: "Wallet" })).toBeTruthy();
  expect(listAdministratorCategories).toHaveBeenCalledWith(
    { q: undefined, status: "all", page: 1 },
    expect.any(AbortSignal),
  );
  expect(screen.getByRole("heading", { name: "Keys" })).toBeTruthy();
  expect(screen.getByText("Wallets and purses")).toBeTruthy();
  expect(screen.getByText("No description provided")).toBeTruthy();
  expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByText("Inactive").length).toBeGreaterThanOrEqual(1);
  expect(container.textContent).not.toMatch(
    /passwordHash|tokenHash|MONGODB|PRIVATE|administratorId/i,
  );
});

it("submits search explicitly, changes status at page one, resets and pages", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorCategories).mockResolvedValue(categoryPage());
  render(<CategoryManagementPanel />);
  await screen.findByRole("heading", { name: "Wallet" });

  await user.type(screen.getByLabelText("Search categories"), "wallet & keys");
  expect(listAdministratorCategories).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Search categories" }));
  expect(listAdministratorCategories).toHaveBeenLastCalledWith(
    { q: "wallet & keys", status: "all", page: 1 },
    expect.any(AbortSignal),
  );

  await user.selectOptions(screen.getByLabelText("Category status"), "inactive");
  expect(listAdministratorCategories).toHaveBeenLastCalledWith(
    { q: "wallet & keys", status: "inactive", page: 1 },
    expect.any(AbortSignal),
  );

  vi.mocked(listAdministratorCategories).mockResolvedValue(
    categoryPage([wallet], { page: 1, total: 21, totalPages: 2 }),
  );
  await user.click(screen.getByRole("button", { name: "Reset category filters" }));
  expect(screen.getByLabelText("Search categories").getAttribute("value")).toBe("");
  expect(listAdministratorCategories).toHaveBeenLastCalledWith(
    { q: undefined, status: "all", page: 1 },
    expect.any(AbortSignal),
  );
  await waitFor(() =>
    expect(screen.getByText("Page 1 of 2 · 21 categories")).toBeTruthy(),
  );
  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(listAdministratorCategories).toHaveBeenLastCalledWith(
    { q: undefined, status: "all", page: 2 },
    expect.any(AbortSignal),
  );
});

it("shows unfiltered and filtered empty states with a safe reset", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorCategories).mockResolvedValue(categoryPage([]));
  render(<CategoryManagementPanel />);

  expect(await screen.findByText("No categories yet")).toBeTruthy();
  expect(screen.getByText("Create the first category above.")).toBeTruthy();

  await user.type(screen.getByLabelText("Search categories"), "laptop");
  await user.click(screen.getByRole("button", { name: "Search categories" }));
  const emptyHeading = await screen.findByRole("heading", {
    name: "No categories match these filters",
  });
  await user.click(
    within(emptyHeading.parentElement as HTMLElement).getByRole("button", {
      name: "Reset category filters",
    }),
  );
  expect(listAdministratorCategories).toHaveBeenLastCalledWith(
    { q: undefined, status: "all", page: 1 },
    expect.any(AbortSignal),
  );
});

it("supports initial retry and retains the last valid page on refresh failure", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorCategories)
    .mockRejectedValueOnce(new Error("PRIVATE-INITIAL"))
    .mockResolvedValueOnce(categoryPage())
    .mockRejectedValueOnce(new Error("PRIVATE-REFRESH"));
  render(<CategoryManagementPanel />);

  expect(await screen.findByRole("heading", { name: "Category management unavailable" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Retry categories" }));
  expect(await screen.findByRole("heading", { name: "Wallet" })).toBeTruthy();
  await user.selectOptions(screen.getByLabelText("Category status"), "inactive");
  expect((await screen.findByRole("alert")).textContent).toContain(
    "We could not refresh categories. The last valid list remains visible.",
  );
  expect(screen.getByRole("heading", { name: "Wallet" })).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/PRIVATE/i);
});

it("ignores aborted and stale list responses and aborts on unmount", async () => {
  const user = userEvent.setup();
  const first = deferred<AdminCategoryPage>();
  const second = deferred<AdminCategoryPage>();
  vi.mocked(listAdministratorCategories)
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const view = render(<CategoryManagementPanel />);

  await waitFor(() => expect(listAdministratorCategories).toHaveBeenCalledTimes(1));
  const firstSignal = vi.mocked(listAdministratorCategories).mock.calls[0][1];
  await user.type(screen.getByLabelText("Search categories"), "keys");
  await user.click(screen.getByRole("button", { name: "Search categories" }));
  expect(firstSignal?.aborted).toBe(true);
  second.resolve(categoryPage([keys]));
  expect(await screen.findByRole("heading", { name: "Keys" })).toBeTruthy();
  first.resolve(categoryPage([wallet]));
  await act(async () => undefined);
  expect(screen.queryByRole("heading", { name: "Wallet" })).toBeNull();

  const secondSignal = vi.mocked(listAdministratorCategories).mock.calls[1][1];
  view.unmount();
  expect(secondSignal?.aborted).toBe(true);
});

it("validates category creation locally", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorCategories).mockResolvedValue(categoryPage());
  render(<CategoryManagementPanel />);
  await screen.findByRole("heading", { name: "Wallet" });

  expect(screen.getByLabelText("Category name").getAttribute("maxlength")).toBe("80");
  expect(screen.getByLabelText("Category description").getAttribute("maxlength")).toBe("300");
  await user.type(screen.getByLabelText("Category name"), "x");
  await user.click(screen.getByRole("button", { name: "Create category" }));
  expect(screen.getByText("Enter a category name between 2 and 80 valid characters.")).toBeTruthy();
  expect(createAdministratorCategory).not.toHaveBeenCalled();
});

it("creates a category once, clears the form, resets filters and focuses success", async () => {
  const user = userEvent.setup();
  const created = { ...wallet, id: "64b64c5f2f8f9e0012345680", name: "ID cards" };
  vi.mocked(listAdministratorCategories).mockResolvedValue(categoryPage());
  vi.mocked(createAdministratorCategory).mockResolvedValue(created);
  render(<CategoryManagementPanel />);
  await screen.findByRole("heading", { name: "Wallet" });
  await user.type(screen.getByLabelText("Search categories"), "wallet");
  await user.click(screen.getByRole("button", { name: "Search categories" }));
  await user.type(screen.getByLabelText("Category name"), "ID cards");
  await user.type(
    screen.getByLabelText("Category description"),
    "Student identification cards",
  );
  const create = screen.getByRole("button", { name: "Create category" });
  await user.click(create);

  expect(createAdministratorCategory).toHaveBeenCalledWith(
    { name: "ID cards", description: "Student identification cards" },
    expect.any(AbortSignal),
  );
  expect(createAdministratorCategory).toHaveBeenCalledTimes(1);
  const notice = await screen.findByText("Category ID cards created");
  await waitFor(() => expect(document.activeElement).toBe(notice));
  expect(screen.getByLabelText("Category name").getAttribute("value")).toBe("");
  expect(screen.getByLabelText("Search categories").getAttribute("value")).toBe("");
  expect(listAdministratorCategories).toHaveBeenLastCalledWith(
    { q: undefined, status: "all", page: 1 },
    expect.any(AbortSignal),
  );
});

it("blocks duplicate create submissions and retains safe form errors", async () => {
  const user = userEvent.setup();
  const pending = deferred<AdminCategory>();
  vi.mocked(listAdministratorCategories).mockResolvedValue(categoryPage());
  vi.mocked(createAdministratorCategory).mockReturnValueOnce(pending.promise);
  render(<CategoryManagementPanel />);
  await screen.findByRole("heading", { name: "Wallet" });
  await user.type(screen.getByLabelText("Category name"), "Phones");
  const button = screen.getByRole("button", { name: "Create category" });
  await user.click(button);
  expect(
    screen.getByRole("button", { name: "Creating category" }).hasAttribute("disabled"),
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Creating category" }));
  expect(createAdministratorCategory).toHaveBeenCalledTimes(1);
  pending.reject(browserError("REFERENCE_DATA_DUPLICATE"));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "A category with that name already exists. Choose a unique name.",
  );
  expect(screen.getByLabelText("Category name").getAttribute("value")).toBe("Phones");

  vi.mocked(createAdministratorCategory).mockRejectedValueOnce(
    browserError("INVALID_REFERENCE_DATA_REQUEST"),
  );
  await user.click(screen.getByRole("button", { name: "Create category" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Check the category values and try again.",
  );
});

it("edits approved fields with the exact updatedAt token and focuses the record", async () => {
  const user = userEvent.setup();
  const updated = {
    ...wallet,
    name: "Wallets",
    description: "Wallets, purses and card holders",
    updatedAt: "2026-08-28T03:00:00.000Z",
  };
  vi.mocked(listAdministratorCategories).mockResolvedValue(categoryPage());
  vi.mocked(updateAdministratorCategory).mockResolvedValue(updated);
  render(<CategoryManagementPanel />);
  await screen.findByRole("heading", { name: "Wallet" });
  await user.click(screen.getByRole("button", { name: "Edit category Wallet" }));
  const editForm = screen.getByRole("form", { name: "Edit category Wallet" });
  const name = within(editForm).getByLabelText("Category name");
  await user.clear(name);
  await user.type(name, "Wallets");
  const description = within(editForm).getByLabelText("Category description");
  await user.clear(description);
  await user.type(description, "Wallets, purses and card holders");
  await user.click(within(editForm).getByRole("button", { name: "Save category Wallet" }));

  expect(updateAdministratorCategory).toHaveBeenCalledWith(
    wallet.id,
    {
      updatedAt: wallet.updatedAt,
      name: "Wallets",
      description: "Wallets, purses and card holders",
    },
    expect.any(AbortSignal),
  );
  const heading = await screen.findByRole("heading", { name: "Wallets" });
  await waitFor(() => expect(document.activeElement).toBe(heading));
  expect(screen.queryByRole("form", { name: "Edit category Wallet" })).toBeNull();
});

it("requires explicit confirmation to deactivate and restore categories", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorCategories).mockResolvedValue(categoryPage());
  vi.mocked(updateAdministratorCategory)
    .mockResolvedValueOnce({ ...wallet, isActive: false })
    .mockResolvedValueOnce({ ...keys, isActive: true });
  render(<CategoryManagementPanel />);
  await screen.findByRole("heading", { name: "Wallet" });

  await user.click(screen.getByRole("button", { name: "Edit category Wallet" }));
  await user.click(screen.getByRole("button", { name: "Deactivate category Wallet" }));
  expect(
    screen.getByText(
      "Deactivate Wallet? It will no longer be available for new reports, while existing report references remain unchanged.",
    ),
  ).toBeTruthy();
  expect(updateAdministratorCategory).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Confirm deactivation of Wallet" }));
  expect(updateAdministratorCategory).toHaveBeenLastCalledWith(
    wallet.id,
    { updatedAt: wallet.updatedAt, isActive: false },
    expect.any(AbortSignal),
  );

  await user.click(screen.getByRole("button", { name: "Edit category Keys" }));
  await user.click(screen.getByRole("button", { name: "Restore category Keys" }));
  expect(screen.getByText("Restore Keys? It will be available for new reports again.")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Confirm restoration of Keys" }));
  expect(updateAdministratorCategory).toHaveBeenLastCalledWith(
    keys.id,
    { updatedAt: keys.updatedAt, isActive: true },
    expect.any(AbortSignal),
  );
});

it("preserves a stale edit and requires an explicit latest-record reload", async () => {
  const user = userEvent.setup();
  const latest = {
    ...wallet,
    name: "Wallet and purse",
    description: "Latest description",
    updatedAt: "2026-08-28T04:00:00.000Z",
  };
  vi.mocked(listAdministratorCategories)
    .mockResolvedValueOnce(categoryPage())
    .mockResolvedValueOnce(categoryPage([latest, keys]));
  vi.mocked(updateAdministratorCategory).mockRejectedValue(
    browserError("REFERENCE_DATA_STATE_CONFLICT"),
  );
  render(<CategoryManagementPanel />);
  await screen.findByRole("heading", { name: "Wallet" });
  await user.click(screen.getByRole("button", { name: "Edit category Wallet" }));
  const editForm = screen.getByRole("form", { name: "Edit category Wallet" });
  const name = within(editForm).getByLabelText("Category name");
  await user.clear(name);
  await user.type(name, "My draft wallet name");
  await user.click(within(editForm).getByRole("button", { name: "Save category Wallet" }));

  expect((await screen.findByRole("alert")).textContent).toContain(
    "This category changed after you opened it. Reload the latest version before saving again.",
  );
  expect(within(editForm).getByLabelText("Category name").getAttribute("value")).toBe(
    "My draft wallet name",
  );
  expect(
    screen
      .getByRole("button", { name: "Save category Wallet" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(updateAdministratorCategory).toHaveBeenCalledTimes(1);
  await user.click(
    screen.getByRole("button", { name: "Reload latest category Wallet" }),
  );
  expect(updateAdministratorCategory).toHaveBeenCalledTimes(1);
  await waitFor(() =>
    expect(
      within(
        screen.getByRole("form", { name: "Edit category Wallet and purse" }),
      )
        .getByLabelText("Category name")
        .getAttribute("value"),
    ).toBe("Wallet and purse"),
  );
  expect(screen.getByRole("button", { name: "Save category Wallet and purse" }).hasAttribute("disabled")).toBe(false);
});

it("closes a missing editor, refreshes the list and keeps duplicate drafts", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorCategories).mockResolvedValue(categoryPage());
  vi.mocked(updateAdministratorCategory)
    .mockRejectedValueOnce(browserError("REFERENCE_DATA_DUPLICATE"))
    .mockRejectedValueOnce(browserError("REFERENCE_DATA_NOT_FOUND"));
  render(<CategoryManagementPanel />);
  await screen.findByRole("heading", { name: "Wallet" });
  await user.click(screen.getByRole("button", { name: "Edit category Wallet" }));
  const editForm = screen.getByRole("form", { name: "Edit category Wallet" });
  const name = within(editForm).getByLabelText("Category name");
  await user.clear(name);
  await user.type(name, "Keys");
  await user.click(screen.getByRole("button", { name: "Save category Wallet" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "A category with that name already exists. Choose a unique name.",
  );
  expect(name.getAttribute("value")).toBe("Keys");
  await user.click(screen.getByRole("button", { name: "Save category Wallet" }));
  expect(await screen.findByText("That category is no longer available. The current list has been refreshed.")).toBeTruthy();
  expect(screen.queryByRole("form", { name: "Edit category Wallet" })).toBeNull();
  expect(listAdministratorCategories).toHaveBeenCalledTimes(2);
});

it.each([
  ["AUTHENTICATION_REQUIRED", "/login"],
  ["ADMINISTRATOR_REQUIRED", null],
] as const)("removes the workspace safely after %s", async (code, redirect) => {
  vi.mocked(listAdministratorCategories).mockRejectedValue(browserError(code));
  render(<CategoryManagementPanel />);

  expect(await screen.findByRole("heading", { name: "Administrator access changed" })).toBeTruthy();
  expect(refreshSession).toHaveBeenCalledOnce();
  if (redirect) expect(replace).toHaveBeenCalledWith(redirect);
  else expect(replace).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toMatch(/Reference data request|PRIVATE/i);
});

it("uses safe list and mutation failures without exposing raw errors", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorCategories).mockResolvedValue(categoryPage());
  vi.mocked(createAdministratorCategory).mockRejectedValue(
    new Error("PRIVATE-MONGODB-HOST"),
  );
  render(<CategoryManagementPanel />);
  await screen.findByRole("heading", { name: "Wallet" });
  await user.type(screen.getByLabelText("Category name"), "Phones");
  await user.click(screen.getByRole("button", { name: "Create category" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Category management is temporarily unavailable. Try again.",
  );
  expect(document.body.textContent).not.toMatch(/PRIVATE|MONGODB|HOST/i);
});

it("keeps the category workspace usable at 320 pixels", async () => {
  vi.mocked(listAdministratorCategories).mockResolvedValue(categoryPage());
  render(<CategoryManagementPanel />);
  await screen.findByRole("heading", { name: "Wallet" });

  const css = readFileSync(
    resolve("src/components/admin/admin-reference-data.module.css"),
    "utf8",
  );
  expect(css).toMatch(/@media\s*\(max-width:\s*(20|24)rem\)/);
  expect(css).toMatch(/min-height:\s*44px/);
  expect(css).toMatch(/focus-visible/);
  expect(css).toMatch(/prefers-reduced-motion/);
  expect(css).not.toMatch(/overflow-x:\s*(auto|scroll)/);
});
