// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/components/auth/auth-session-provider", () => ({
  useAuthSession: vi.fn(),
}));
vi.mock("@/lib/admin/browser-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin/browser-client")>(
    "@/lib/admin/browser-client",
  );
  return { ...actual, getAdministratorOverview: vi.fn() };
});

import { useRouter } from "next/navigation";
import { useAuthSession } from "@/components/auth/auth-session-provider";
import {
  BrowserAdminOverviewError,
  getAdministratorOverview,
} from "@/lib/admin/browser-client";
import type { AdministratorOverview } from "@/lib/admin/overview-contract";

import { AdminOverviewClient } from "./admin-overview-client";

const overview = {
  generatedAt: "2026-08-25T03:30:00.000Z",
  reports: {
    submittedLost: 4,
    submittedFound: 3,
    submittedTotal: 7,
    unresolved: 2,
    recovered: 1,
    matched: 2,
  },
  claims: {
    pending: 2,
    approved: 1,
    rejected: 3,
    withdrawn: 1,
    completed: 2,
    total: 9,
  },
  accounts: { active: 8, suspended: 1, deactivated: 2, total: 11 },
} satisfies AdministratorOverview;

const replace = vi.fn();
const refreshSession = vi.fn().mockResolvedValue(undefined);

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function metricValue(label: string) {
  return screen.getByText(label).parentElement?.querySelector("dd")?.textContent;
}

beforeEach(() => {
  vi.clearAllMocks();
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

it("loads once and renders every metric with a definition", async () => {
  vi.mocked(getAdministratorOverview).mockResolvedValue(overview);
  const { container } = render(<AdminOverviewClient />);

  expect(screen.getByRole("status").textContent).toContain(
    "Loading administrator overview",
  );
  await waitFor(() => expect(getAdministratorOverview).toHaveBeenCalledOnce());
  expect(
    await screen.findByRole("heading", { name: "Administrator overview" }),
  ).toBeTruthy();

  const expectedLabels = [
    "Lost submitted",
    "Found submitted",
    "Total submitted",
    "Unresolved",
    "Recovered",
    "Matched",
    "Pending Claims",
    "Approved Claims",
    "Rejected Claims",
    "Withdrawn Claims",
    "Completed Claims",
    "Total Claims",
    "Active accounts",
    "Suspended accounts",
    "Deactivated accounts",
    "Total accounts",
  ];
  for (const label of expectedLabels) {
    expect(screen.getByText(label).tagName).toBe("DT");
  }

  expect(metricValue("Lost submitted")).toBe("4");
  expect(screen.getByText("Lost submitted").parentElement?.textContent).toContain(
    "Non-draft lost reports submitted to Campus Find",
  );
  expect(metricValue("Total submitted")).toBe("7");
  expect(metricValue("Total Claims")).toBe("9");
  expect(metricValue("Total accounts")).toBe("11");
  expect(screen.getByText(/25 Aug 2026/)).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "Review ownership Claims" }).getAttribute("href"),
  ).toBe("/staff/claims");
  expect(
    screen.getByRole("link", { name: "Manage accounts" }).getAttribute("href"),
  ).toBe("/admin/accounts");
  expect(container.textContent).not.toMatch(
    /admin@example|userId|reportId|claimId|password|token|verification/i,
  );
});

it("keeps all zero metrics visible and explains the valid empty snapshot", async () => {
  vi.mocked(getAdministratorOverview).mockResolvedValue({
    generatedAt: overview.generatedAt,
    reports: {
      submittedLost: 0,
      submittedFound: 0,
      submittedTotal: 0,
      unresolved: 0,
      recovered: 0,
      matched: 0,
    },
    claims: {
      pending: 0,
      approved: 0,
      rejected: 0,
      withdrawn: 0,
      completed: 0,
      total: 0,
    },
    accounts: { active: 0, suspended: 0, deactivated: 0, total: 0 },
  });
  render(<AdminOverviewClient />);

  expect(await screen.findByText("No activity recorded yet")).toBeTruthy();
  expect(metricValue("Lost submitted")).toBe("0");
  expect(metricValue("Total Claims")).toBe("0");
  expect(metricValue("Total accounts")).toBe("0");
});

it("retains the current snapshot while refreshing", async () => {
  const user = userEvent.setup();
  const refresh = deferred<typeof overview>();
  vi.mocked(getAdministratorOverview)
    .mockResolvedValueOnce(overview)
    .mockReturnValueOnce(refresh.promise);
  render(<AdminOverviewClient />);
  await screen.findByText("Lost submitted");

  await user.click(screen.getByRole("button", { name: "Refresh overview" }));
  expect(metricValue("Lost submitted")).toBe("4");
  expect(
    screen.getByRole("button", { name: "Refreshing overview" }).hasAttribute("disabled"),
  ).toBe(true);

  refresh.resolve({
    ...overview,
    reports: { ...overview.reports, submittedLost: 5, submittedTotal: 8 },
  });
  await waitFor(() => expect(metricValue("Lost submitted")).toBe("5"));
});

it("retains valid data and shows a safe alert after refresh failure", async () => {
  const user = userEvent.setup();
  vi.mocked(getAdministratorOverview)
    .mockResolvedValueOnce(overview)
    .mockRejectedValueOnce(new Error("PRIVATE-DATABASE"));
  render(<AdminOverviewClient />);
  await screen.findByText("Lost submitted");
  await user.click(screen.getByRole("button", { name: "Refresh overview" }));

  expect((await screen.findByRole("alert")).textContent).toContain(
    "We could not refresh the overview",
  );
  expect(metricValue("Lost submitted")).toBe("4");
  expect(document.body.textContent).not.toContain("PRIVATE-DATABASE");
});

it("renders a retryable safe panel after initial failure", async () => {
  const user = userEvent.setup();
  vi.mocked(getAdministratorOverview)
    .mockRejectedValueOnce(new Error("PRIVATE-HOST"))
    .mockResolvedValueOnce(overview);
  render(<AdminOverviewClient />);

  expect(await screen.findByText("Administrator overview unavailable")).toBeTruthy();
  expect(document.body.textContent).not.toContain("PRIVATE-HOST");
  await user.click(screen.getByRole("button", { name: "Retry overview" }));
  expect(await screen.findByText("Lost submitted")).toBeTruthy();
});

it("aborts an in-flight refresh and ignores its late completion after unmount", async () => {
  const user = userEvent.setup();
  const oldRefresh = deferred<typeof overview>();
  const newOverview = {
    ...overview,
    reports: { ...overview.reports, submittedLost: 6, submittedTotal: 9 },
  };
  vi.mocked(getAdministratorOverview)
    .mockResolvedValueOnce(overview)
    .mockReturnValueOnce(oldRefresh.promise)
    .mockResolvedValueOnce(newOverview);

  const oldView = render(<AdminOverviewClient />);
  await screen.findByText("Lost submitted");
  await user.click(screen.getByRole("button", { name: "Refresh overview" }));
  const oldSignal = vi.mocked(getAdministratorOverview).mock.calls[1][0];
  expect(oldSignal?.aborted).toBe(false);

  oldView.unmount();
  expect(oldSignal?.aborted).toBe(true);

  render(<AdminOverviewClient />);
  await waitFor(() => expect(metricValue("Lost submitted")).toBe("6"));
  oldRefresh.resolve({
    ...overview,
    reports: { ...overview.reports, submittedLost: 99, submittedTotal: 102 },
  });
  await Promise.resolve();
  expect(metricValue("Lost submitted")).toBe("6");
});

it("refreshes the session and redirects after authentication expiry", async () => {
  vi.mocked(getAdministratorOverview).mockRejectedValue(
    new BrowserAdminOverviewError("AUTHENTICATION_REQUIRED"),
  );
  render(<AdminOverviewClient />);

  await waitFor(() => expect(refreshSession).toHaveBeenCalledOnce());
  expect(replace).toHaveBeenCalledWith("/login");
  expect(screen.queryByText("Lost submitted")).toBeNull();
});

it("refreshes the session and removes stale metrics after access changes", async () => {
  const user = userEvent.setup();
  vi.mocked(getAdministratorOverview)
    .mockResolvedValueOnce(overview)
    .mockRejectedValueOnce(
      new BrowserAdminOverviewError("ADMINISTRATOR_REQUIRED"),
    );
  render(<AdminOverviewClient />);
  await screen.findByText("Lost submitted");
  await user.click(screen.getByRole("button", { name: "Refresh overview" }));

  await waitFor(() => expect(refreshSession).toHaveBeenCalledOnce());
  expect(screen.queryByText("Lost submitted")).toBeNull();
  expect(screen.getByText("Administrator access changed")).toBeTruthy();
});

it("keeps overview controls and metrics usable at 320 pixels", () => {
  const css = readFileSync(
    resolve("src/components/admin/admin-overview.module.css"),
    "utf8",
  );
  expect(css).toMatch(/min-height:\s*44px/);
  expect(css).toMatch(/:focus-visible/);
  expect(css).toMatch(/@media\s*\(max-width:\s*20rem\)/);
  expect(css).toMatch(/grid-template-columns:\s*1fr/);
  expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
});
