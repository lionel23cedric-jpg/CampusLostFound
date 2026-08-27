// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
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
  updateAdministratorAccountStatus,
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
  vi.mocked(updateAdministratorAccountStatus).mockReset();
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

it("offers only transitions permitted by the current status", async () => {
  vi.mocked(listAdministratorAccounts).mockResolvedValue(page);
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");

  const alex = screen.getByText("Alex Student").closest("li")!;
  expect(
    within(alex).getByRole("button", { name: "Suspend Alex Student" }),
  ).toBeTruthy();
  expect(
    within(alex).getByRole("button", { name: "Deactivate Alex Student" }),
  ).toBeTruthy();

  const taylor = screen.getByText("Taylor Staff").closest("li")!;
  expect(
    within(taylor).getByRole("button", { name: "Restore Taylor Staff" }),
  ).toBeTruthy();
  expect(
    within(taylor).getByRole("button", { name: "Deactivate Taylor Staff" }),
  ).toBeTruthy();
  expect(within(taylor).queryByRole("button", { name: /Suspend/ })).toBeNull();
});

it("offers no status action for a deactivated account", async () => {
  vi.mocked(listAdministratorAccounts).mockResolvedValue({
    accounts: [
      {
        ...accounts[0],
        id: "64b64c5f2f8f9e0012345680",
        displayName: "Former Student",
        status: "deactivated",
      },
    ],
    pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
  });
  render(<AdminAccountManagementClient />);

  const account = (await screen.findByText("Former Student")).closest("li")!;
  expect(within(account).queryByRole("button")).toBeNull();
  expect(
    within(account).getByText("No further status changes are available."),
  ).toBeTruthy();
});

it("opens one confirmation and cancels without a request", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorAccounts).mockResolvedValue(page);
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");

  const trigger = screen.getByRole("button", { name: "Suspend Alex Student" });
  await user.click(trigger);
  expect(
    screen.getByRole("heading", { name: "Suspend Alex Student?" }),
  ).toBe(document.activeElement);
  expect(
    screen.getByText(/all current sessions will be revoked/i),
  ).toBeTruthy();

  await user.click(screen.getByRole("button", { name: "Cancel account change" }));
  expect(updateAdministratorAccountStatus).not.toHaveBeenCalled();
  await waitFor(() => expect(trigger).toBe(document.activeElement));
});

it("suspends with the selected reason and exact updatedAt", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorAccounts).mockResolvedValue(page);
  vi.mocked(updateAdministratorAccountStatus).mockResolvedValue({
    ...accounts[0],
    status: "suspended",
    updatedAt: "2026-08-27T03:00:00.000Z",
  });
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");

  await user.click(screen.getByRole("button", { name: "Suspend Alex Student" }));
  await user.selectOptions(
    screen.getByLabelText("Suspension reason"),
    "policy_violation",
  );
  await user.click(screen.getByRole("button", { name: "Confirm suspension" }));

  expect(updateAdministratorAccountStatus).toHaveBeenCalledWith(
    accounts[0].id,
    {
      status: "suspended",
      reason: "policy_violation",
      expectedUpdatedAt: accounts[0].updatedAt,
    },
    expect.any(AbortSignal),
  );
  expect(
    await screen.findByText(
      "Account suspended. Existing sessions were revoked.",
    ),
  ).toBeTruthy();
  const card = screen.getByText("Alex Student").closest("li")!;
  expect(within(card).getByText("Suspended")).toBeTruthy();
  expect(
    within(card).getByRole("region", { name: "Account actions for Alex Student" }),
  ).toBe(document.activeElement);
});

it.each([
  ["Restore Taylor Staff", "Confirm restoration", "active", "account_restored"],
  [
    "Deactivate Taylor Staff",
    "Confirm deactivation",
    "deactivated",
    "account_closed",
  ],
] as const)("submits %s safely", async (openName, confirmName, status, reason) => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorAccounts).mockResolvedValue(page);
  vi.mocked(updateAdministratorAccountStatus).mockResolvedValue({
    ...accounts[1],
    status,
    updatedAt: "2026-08-27T03:00:00.000Z",
  });
  render(<AdminAccountManagementClient />);
  await screen.findByText("Taylor Staff");

  await user.click(screen.getByRole("button", { name: openName }));
  await user.click(screen.getByRole("button", { name: confirmName }));
  expect(updateAdministratorAccountStatus).toHaveBeenCalledWith(
    accounts[1].id,
    { status, reason, expectedUpdatedAt: accounts[1].updatedAt },
    expect.any(AbortSignal),
  );
});

it("prevents concurrent account changes while a mutation is pending", async () => {
  const user = userEvent.setup();
  const mutation = deferred<ManagedBrowserAccount>();
  vi.mocked(listAdministratorAccounts).mockResolvedValue(page);
  vi.mocked(updateAdministratorAccountStatus).mockReturnValue(mutation.promise);
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");

  await user.click(screen.getByRole("button", { name: "Suspend Alex Student" }));
  await user.click(screen.getByRole("button", { name: "Confirm suspension" }));

  expect(
    screen
      .getByRole("button", { name: "Changing account status" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(
    screen
      .getByRole("button", { name: "Restore Taylor Staff" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(updateAdministratorAccountStatus).toHaveBeenCalledTimes(1);

  await act(async () => {
    mutation.resolve({
      ...accounts[0],
      status: "suspended",
      updatedAt: "2026-08-27T03:00:00.000Z",
    });
    await mutation.promise;
  });
});

it.each([
  [
    "ACCOUNT_STATE_CONFLICT",
    "Account data changed. The current list has been refreshed.",
  ],
  [
    "ACCOUNT_NOT_FOUND",
    "That account is no longer available. The current list has been refreshed.",
  ],
] as const)("reloads the committed query after %s", async (code, message) => {
  const user = userEvent.setup();
  const refreshedPage: ManagedBrowserAccountPage = {
    ...page,
    accounts: [{ ...accounts[0], status: "suspended" }, accounts[1]],
  };
  vi.mocked(listAdministratorAccounts)
    .mockResolvedValueOnce(page)
    .mockResolvedValueOnce(page)
    .mockResolvedValueOnce(refreshedPage);
  vi.mocked(updateAdministratorAccountStatus).mockRejectedValue(
    new BrowserAccountManagementError(code),
  );
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");

  await user.type(screen.getByLabelText("Search accounts"), "Alex");
  await user.click(screen.getByRole("button", { name: "Apply filters" }));
  await waitFor(() => expect(listAdministratorAccounts).toHaveBeenCalledTimes(2));
  await user.click(screen.getByRole("button", { name: "Suspend Alex Student" }));
  await user.click(screen.getByRole("button", { name: "Confirm suspension" }));

  expect(await screen.findByText(message)).toBeTruthy();
  await waitFor(() =>
    expect(listAdministratorAccounts).toHaveBeenLastCalledWith(
      { q: "Alex", page: 1 },
      expect.any(AbortSignal),
    ),
  );
  expect(
    screen.queryByRole("heading", { name: "Suspend Alex Student?" }),
  ).toBeNull();
  expect(
    within(screen.getByText("Alex Student").closest("li")!).getByText(
      "Suspended",
    ),
  ).toBeTruthy();
});

it.each(["ACCOUNT_STATE_CONFLICT", "ACCOUNT_NOT_FOUND"] as const)(
  "does not claim a refresh when %s recovery reload fails",
  async (code) => {
    const user = userEvent.setup();
    vi.mocked(listAdministratorAccounts)
      .mockResolvedValueOnce(page)
      .mockRejectedValueOnce(new Error("PRIVATE-REFRESH-FAILURE"));
    vi.mocked(updateAdministratorAccountStatus).mockRejectedValue(
      new BrowserAccountManagementError(code),
    );
    render(<AdminAccountManagementClient />);
    await screen.findByText("Alex Student");

    await user.click(
      screen.getByRole("button", { name: "Suspend Alex Student" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm suspension" }),
    );

    expect(
      (await screen.findByRole("alert")).textContent,
    ).toContain("We could not update the account list");
    expect(document.body.textContent).not.toContain(
      "The current list has been refreshed",
    );
    expect(document.body.textContent).not.toContain("PRIVATE-REFRESH-FAILURE");
  },
);

it("closes a stale confirmation when refreshed account data arrives", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorAccounts)
    .mockResolvedValueOnce(page)
    .mockResolvedValueOnce({
      ...page,
      accounts: [{ ...accounts[0], status: "suspended" }, accounts[1]],
    });
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");

  await user.click(screen.getByRole("button", { name: "Suspend Alex Student" }));
  expect(
    screen.getByRole("heading", { name: "Suspend Alex Student?" }),
  ).toBeTruthy();
  await user.type(screen.getByLabelText("Search accounts"), "Alex");
  await user.click(screen.getByRole("button", { name: "Apply filters" }));

  await waitFor(() =>
    expect(
      screen.queryByRole("heading", { name: "Suspend Alex Student?" }),
    ).toBeNull(),
  );
  expect(
    screen.getByRole("button", { name: "Restore Alex Student" }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Suspend Alex Student" }),
  ).toBeNull();
});

it("rejects a valid mutation response for the wrong account", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorAccounts).mockResolvedValue(page);
  vi.mocked(updateAdministratorAccountStatus).mockResolvedValue({
    ...accounts[1],
    status: "deactivated",
    updatedAt: "2026-08-27T03:00:00.000Z",
  });
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");

  await user.click(screen.getByRole("button", { name: "Suspend Alex Student" }));
  await user.click(screen.getByRole("button", { name: "Confirm suspension" }));

  expect(
    (await screen.findByRole("alert", { name: "Account change failed" }))
      .textContent,
  ).toContain("We could not update this account");
  expect(
    screen.getByRole("heading", { name: "Suspend Alex Student?" }),
  ).toBeTruthy();
  expect(document.body.textContent).not.toContain("Account suspended.");
  expect(
    within(screen.getByText("Taylor Staff").closest("li")!).getByText(
      "Suspended",
    ),
  ).toBeTruthy();
});

it("closes a forbidden action without exposing raw details", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorAccounts).mockResolvedValue(page);
  vi.mocked(updateAdministratorAccountStatus).mockRejectedValue(
    new BrowserAccountManagementError("ACCOUNT_ACTION_FORBIDDEN"),
  );
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");

  const trigger = screen.getByRole("button", {
    name: "Deactivate Alex Student",
  });
  await user.click(trigger);
  await user.click(screen.getByRole("button", { name: "Confirm deactivation" }));

  expect(
    await screen.findByRole("alert", {
      name: "Account action not permitted",
    }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("heading", { name: "Deactivate Alex Student?" }),
  ).toBeNull();
  expect(screen.getByText("Alex Student")).toBeTruthy();
  await waitFor(() => expect(trigger).toBe(document.activeElement));
});

it("retains the confirmation and offers safe retry after a server failure", async () => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorAccounts).mockResolvedValue(page);
  vi.mocked(updateAdministratorAccountStatus)
    .mockRejectedValueOnce(new Error("PRIVATE-DATABASE-HOST"))
    .mockResolvedValueOnce({
      ...accounts[0],
      status: "suspended",
      updatedAt: "2026-08-27T03:00:00.000Z",
    });
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");

  await user.click(screen.getByRole("button", { name: "Suspend Alex Student" }));
  await user.click(screen.getByRole("button", { name: "Confirm suspension" }));

  expect(
    (await screen.findByRole("alert", { name: "Account change failed" }))
      .textContent,
  ).toContain("We could not update this account");
  expect(document.body.textContent).not.toContain("PRIVATE-DATABASE-HOST");
  expect(
    screen.getByRole("heading", { name: "Suspend Alex Student?" }),
  ).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Confirm suspension" }));
  expect(updateAdministratorAccountStatus).toHaveBeenCalledTimes(2);
});

it.each([
  ["AUTHENTICATION_REQUIRED", true],
  ["ADMINISTRATOR_REQUIRED", false],
] as const)("clears account data when mutation returns %s", async (code, redirects) => {
  const user = userEvent.setup();
  vi.mocked(listAdministratorAccounts).mockResolvedValue(page);
  vi.mocked(updateAdministratorAccountStatus).mockRejectedValue(
    new BrowserAccountManagementError(code),
  );
  render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");

  await user.click(screen.getByRole("button", { name: "Suspend Alex Student" }));
  await user.click(screen.getByRole("button", { name: "Confirm suspension" }));

  await waitFor(() => expect(refreshSession).toHaveBeenCalledOnce());
  expect(screen.queryByText("Alex Student")).toBeNull();
  expect(replace).toHaveBeenCalledTimes(redirects ? 1 : 0);
  if (redirects) expect(replace).toHaveBeenCalledWith("/login");
});

it("aborts a pending account mutation on unmount and ignores late completion", async () => {
  const user = userEvent.setup();
  const mutation = deferred<ManagedBrowserAccount>();
  vi.mocked(listAdministratorAccounts).mockResolvedValue(page);
  vi.mocked(updateAdministratorAccountStatus).mockReturnValue(mutation.promise);
  const { unmount } = render(<AdminAccountManagementClient />);
  await screen.findByText("Alex Student");

  await user.click(screen.getByRole("button", { name: "Suspend Alex Student" }));
  await user.click(screen.getByRole("button", { name: "Confirm suspension" }));
  const signal = vi.mocked(updateAdministratorAccountStatus).mock.calls[0][2];
  expect(signal?.aborted).toBe(false);
  unmount();
  expect(signal?.aborted).toBe(true);

  await act(async () => {
    mutation.resolve({
      ...accounts[0],
      status: "suspended",
      updatedAt: "2026-08-27T03:00:00.000Z",
    });
    await mutation.promise;
  });
});
