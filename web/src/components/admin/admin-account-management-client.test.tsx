// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/components/auth/auth-session-provider", () => ({
  useAuthSession: vi.fn(),
}));
vi.mock("@/lib/admin/account-browser-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/admin/account-browser-client")
  >("@/lib/admin/account-browser-client");
  return {
    ...actual,
    listAdministratorAccounts: vi.fn(),
    updateAdministratorAccountStatus: vi.fn(),
  };
});

import { useRouter } from "next/navigation";
import { useAuthSession } from "@/components/auth/auth-session-provider";
import {
  BrowserAccountManagementError,
  listAdministratorAccounts,
} from "@/lib/admin/account-browser-client";
import type {
  ManagedBrowserAccount,
  ManagedBrowserAccountPage,
} from "@/lib/admin/account-browser-contract";

import { AdminAccountManagementClient } from "./admin-account-management-client";

const accounts = [
  {
    id: "64b64c5f2f8f9e0012345678",
    email: "student@example.test",
    displayName: "Alex Student",
    role: "student" as const,
    status: "active" as const,
    createdAt: "2026-08-01T00:00:00.000Z",
    lastLoginAt: "2026-08-26T02:00:00.000Z",
    updatedAt: "2026-08-27T01:00:00.000Z",
  },
  {
    id: "64b64c5f2f8f9e0012345679",
    email: "staff@example.test",
    displayName: "Taylor Staff",
    role: "staff" as const,
    status: "suspended" as const,
    createdAt: "2026-08-02T00:00:00.000Z",
    lastLoginAt: null,
    updatedAt: "2026-08-27T01:30:00.000Z",
  },
] satisfies ManagedBrowserAccount[];

const page: ManagedBrowserAccountPage = {
  accounts,
  pagination: { page: 1, pageSize: 20, totalItems: 22, totalPages: 2 },
};
const replace = vi.fn();
const refreshSession = vi.fn().mockResolvedValue(undefined);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listAdministratorAccounts).mockReset();
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

it("loads page one and renders public account cards", async () => {
  vi.mocked(listAdministratorAccounts).mockResolvedValue(page);
  const { container } = render(<AdminAccountManagementClient />);

  expect(screen.getByRole("status").textContent).toContain("Loading accounts");
  expect(
    await screen.findByRole("heading", { name: "Manage accounts" }),
  ).toBeTruthy();
  expect(listAdministratorAccounts).toHaveBeenCalledWith(
    { page: 1 },
    expect.any(AbortSignal),
  );
  expect(screen.getByText("Alex Student")).toBeTruthy();
  expect(screen.getByText("student@example.test")).toBeTruthy();
  expect(screen.getByText("Taylor Staff")).toBeTruthy();
  expect(screen.getByText("Never")).toBeTruthy();
  expect(screen.getByText("1 Aug 2026, 12:00 pm")).toBeTruthy();
  expect(screen.getByText("1–20 of 22 accounts")).toBeTruthy();
  expect(
    screen.getByRole("form", { name: "Search and filter accounts" }),
  ).toBeTruthy();
  expect(container.textContent).not.toMatch(
    /passwordHash|tokenHash|emailVerifiedAt|notificationSettings|PRIVATE/i,
  );
});

it("renders a valid empty result with reset", async () => {
  vi.mocked(listAdministratorAccounts).mockResolvedValue({
    accounts: [],
    pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
  });
  render(<AdminAccountManagementClient />);

  expect(await screen.findByText("No accounts match these filters")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Reset filters" })).toBeTruthy();
});

it("submits normalized search and filters explicitly", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorAccounts).mockResolvedValue(page);
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");

  await user.type(screen.getByLabelText("Search accounts"), "  Alex   Student ");
  await user.selectOptions(screen.getByLabelText("Role"), "student");
  await user.selectOptions(screen.getByLabelText("Status"), "active");
  expect(listAdministratorAccounts).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Apply filters" }));

  await waitFor(() =>
    expect(listAdministratorAccounts).toHaveBeenLastCalledWith(
      { q: "Alex Student", role: "student", status: "active", page: 1 },
      expect.any(AbortSignal),
    ),
  );
});

it("rejects invalid search without sending a request", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorAccounts).mockResolvedValue(page);
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");

  fireEvent.change(screen.getByLabelText("Search accounts"), {
    target: { value: "x".repeat(81) },
  });
  await user.click(screen.getByRole("button", { name: "Apply filters" }));

  expect(screen.getByRole("alert").textContent).toContain(
    "Enter between 1 and 80 valid characters",
  );
  expect(listAdministratorAccounts).toHaveBeenCalledTimes(1);
});

it("resets filters and returns to page one", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorAccounts).mockResolvedValue(page);
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");

  await user.type(screen.getByLabelText("Search accounts"), "Alex");
  await user.click(screen.getByRole("button", { name: "Apply filters" }));
  await user.click(screen.getByRole("button", { name: "Reset filters" }));

  await waitFor(() =>
    expect(listAdministratorAccounts).toHaveBeenLastCalledWith(
      { page: 1 },
      expect.any(AbortSignal),
    ),
  );
});

it("uses validated pagination bounds and accessible names", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorAccounts)
    .mockResolvedValueOnce(page)
    .mockResolvedValueOnce({
      ...page,
      pagination: { ...page.pagination, page: 2 },
    });
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");

  expect(
    screen
      .getByRole("button", { name: "Previous page" })
      .hasAttribute("disabled"),
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Next page, page 2" }));
  await waitFor(() =>
    expect(listAdministratorAccounts).toHaveBeenLastCalledWith(
      { page: 2 },
      expect.any(AbortSignal),
    ),
  );
  expect(
    screen.getByRole("button", { name: "Previous page, page 1" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Next page" }).hasAttribute("disabled"),
  ).toBe(true);
});

it("keeps pagination bound to the last successful filters", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorAccounts)
    .mockResolvedValueOnce(page)
    .mockRejectedValueOnce(new Error("FILTER-FAILURE"))
    .mockResolvedValueOnce({
      ...page,
      pagination: { ...page.pagination, page: 2 },
    });
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");

  await user.type(screen.getByLabelText("Search accounts"), "Alex");
  await user.click(screen.getByRole("button", { name: "Apply filters" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "We could not update the account list",
  );
  expect(screen.getByLabelText("Search accounts").getAttribute("value")).toBe(
    "Alex",
  );

  await user.click(screen.getByRole("button", { name: "Next page, page 2" }));
  await waitFor(() =>
    expect(listAdministratorAccounts).toHaveBeenLastCalledWith(
      { page: 2 },
      expect.any(AbortSignal),
    ),
  );
});

it("announces refreshes and prevents duplicate pagination requests", async () => {
  const user = userEvent.setup();
  const refresh = deferred<ManagedBrowserAccountPage>();
  vi.mocked(listAdministratorAccounts)
    .mockResolvedValueOnce(page)
    .mockReturnValueOnce(refresh.promise)
    .mockResolvedValueOnce({
      accounts: [accounts[1]],
      pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");

  await user.click(screen.getByRole("button", { name: "Next page, page 2" }));
  expect(screen.getByRole("status").textContent).toBe("Updating accounts");
  expect(
    screen
      .getByRole("region", { name: "Manage accounts" })
      .getAttribute("aria-busy"),
  ).toBe("true");
  await user.click(screen.getByRole("button", { name: "Next page" }));
  expect(listAdministratorAccounts).toHaveBeenCalledTimes(2);

  await user.type(screen.getByLabelText("Search accounts"), "Taylor");
  await user.click(screen.getByRole("button", { name: "Apply filters" }));
  await waitFor(() => expect(listAdministratorAccounts).toHaveBeenCalledTimes(3));
  expect(await screen.findByText("1–1 of 1 account")).toBeTruthy();
});

it("aborts the previous request and ignores its late completion", async () => {
  const user = userEvent.setup();
  const oldRequest = deferred<ManagedBrowserAccountPage>();
  const filteredPage: ManagedBrowserAccountPage = {
    accounts: [accounts[1]],
    pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
  };
  vi.mocked(listAdministratorAccounts)
    .mockResolvedValueOnce(page)
    .mockReturnValueOnce(oldRequest.promise)
    .mockResolvedValueOnce(filteredPage);
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");

  await user.click(screen.getByRole("button", { name: "Next page, page 2" }));
  const oldSignal = vi.mocked(listAdministratorAccounts).mock.calls[1][1];
  expect(oldSignal?.aborted).toBe(false);
  await user.type(screen.getByLabelText("Search accounts"), "Taylor");
  await user.click(screen.getByRole("button", { name: "Apply filters" }));
  await waitFor(() => expect(oldSignal?.aborted).toBe(true));
  expect(await screen.findByText("1–1 of 1 account")).toBeTruthy();

  await act(async () => {
    oldRequest.resolve({
      accounts: [{ ...accounts[0], displayName: "PRIVATE-LATE-ACCOUNT" }],
      pagination: { page: 2, pageSize: 20, totalItems: 21, totalPages: 2 },
    });
    await oldRequest.promise;
  });
  await waitFor(() =>
    expect(screen.queryByText("PRIVATE-LATE-ACCOUNT")).toBeNull(),
  );
  expect(screen.getByText("Taylor Staff")).toBeTruthy();
});

it("redirects safely when authentication expires", async () => {
  vi.mocked(listAdministratorAccounts).mockRejectedValue(
    new BrowserAccountManagementError("AUTHENTICATION_REQUIRED"),
  );
  render(<AdminAccountManagementClient />);

  await waitFor(() => expect(refreshSession).toHaveBeenCalledOnce());
  expect(replace).toHaveBeenCalledWith("/login");
  expect(screen.queryByText("Alex Student")).toBeNull();
});

it("clears existing results when authentication expires", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorAccounts)
    .mockResolvedValueOnce(page)
    .mockRejectedValueOnce(
      new BrowserAccountManagementError("AUTHENTICATION_REQUIRED"),
    );
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");

  await user.click(screen.getByRole("button", { name: "Next page, page 2" }));

  await waitFor(() => expect(refreshSession).toHaveBeenCalledOnce());
  expect(replace).toHaveBeenCalledWith("/login");
  expect(screen.queryByText("Alex Student")).toBeNull();
});

it("removes stale results when administrator access changes", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorAccounts)
    .mockResolvedValueOnce(page)
    .mockRejectedValueOnce(
      new BrowserAccountManagementError("ADMINISTRATOR_REQUIRED"),
    );
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");

  await user.click(screen.getByRole("button", { name: "Next page, page 2" }));

  await waitFor(() => expect(refreshSession).toHaveBeenCalledOnce());
  expect(screen.queryByText("Alex Student")).toBeNull();
  expect(screen.getByText("Administrator access changed")).toBeTruthy();
});

it("shows a safe retry after an initial failure", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorAccounts)
    .mockRejectedValueOnce(new Error("PRIVATE-HOST"))
    .mockResolvedValueOnce(page);
  render(<AdminAccountManagementClient />);

  expect(await screen.findByText("Account management unavailable")).toBeTruthy();
  expect(document.body.textContent).not.toContain("PRIVATE-HOST");
  await user.click(screen.getByRole("button", { name: "Retry accounts" }));
  expect(await screen.findByText("Alex Student")).toBeTruthy();
});

it("keeps the last valid results after a refresh failure", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorAccounts)
    .mockResolvedValueOnce(page)
    .mockRejectedValueOnce(new Error("PRIVATE-DATABASE"));
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");

  await user.click(screen.getByRole("button", { name: "Next page, page 2" }));

  expect((await screen.findByRole("alert")).textContent).toContain(
    "We could not update the account list",
  );
  expect(screen.getByText("Alex Student")).toBeTruthy();
  expect(document.body.textContent).not.toContain("PRIVATE-DATABASE");
});
