// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactNode } from "react";

import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}));
vi.mock("@/components/claims/staff-claim-access-boundary", () => ({
  StaffClaimAccessBoundary: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/lib/claims/staff-browser-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/claims/staff-browser-client")
  >("@/lib/claims/staff-browser-client");
  return { ...actual, getStaffClaims: vi.fn() };
});

import { useRouter, useSearchParams } from "next/navigation";

import StaffClaimsPage, { metadata } from "@/app/staff/claims/page";
import { ClaimBrowserError, type ClaimStatus } from "@/lib/claims/browser-client";
import {
  getStaffClaims,
  type StaffClaimPage,
  type StaffClaimSummary,
} from "@/lib/claims/staff-browser-client";

import { StaffClaimListClient } from "./staff-claim-list-client";

const push = vi.fn();
const replace = vi.fn();
let currentSearch = new URLSearchParams();

const claim: StaffClaimSummary = {
  id: "64b64c6f2f4d9f1a2b3c4d60",
  report: {
    id: "64b64c6f2f4d9f1a2b3c4d54",
    title: "Found student card",
    reportType: "found",
    status: "claim_pending",
  },
  status: "pending",
  reviewedAt: null,
  withdrawnAt: null,
  completedAt: null,
  createdAt: "2026-08-24T01:00:00.000Z",
  updatedAt: "2026-08-24T02:15:00.000Z",
  claimant: {
    id: "64b64c6f2f4d9f1a2b3c4d61",
    email: "student@example.com",
    displayName: "Student Name",
    preferredContactMethod: "email",
  },
  verification: { questionCount: 2, matchedCount: 1 },
  reviewedBy: null,
};

const staffPage: StaffClaimPage = {
  claims: [claim],
  pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
};

function pageFor(
  status: ClaimStatus,
  title = `${status[0].toUpperCase()}${status.slice(1)} report`,
): StaffClaimPage {
  return {
    claims: [
      {
        ...claim,
        id: `${status.padEnd(24, "0")}`,
        status,
        report: { ...claim.report, title },
      },
    ],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  currentSearch = new URLSearchParams();
  vi.mocked(useRouter).mockReturnValue({ push, replace } as never);
  vi.mocked(useSearchParams).mockImplementation(() => currentSearch as never);
  vi.mocked(getStaffClaims).mockResolvedValue(staffPage);
});

afterEach(cleanup);

describe("StaffClaimListClient route and URL state", () => {
  it("provides metadata, a protected main landmark and Suspense fallback", async () => {
    expect(metadata.title).toBe("Claim reviews");
    const routeSource = readFileSync(resolve("src/app/staff/claims/page.tsx"), "utf8");
    expect(routeSource).toContain('<main id="main-content">');
    expect(routeSource).toContain("<StaffClaimAccessBoundary>");
    expect(routeSource).toContain("<Suspense");
    expect(routeSource).toContain("Loading Claim reviews");

    const { container } = render(<StaffClaimsPage />);
    expect(container.querySelector("main#main-content")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Claim reviews" })).toBeTruthy();
  });

  it("loads the oldest pending queue by default and exposes all five statuses", async () => {
    render(<StaffClaimListClient />);

    expect(await screen.findByText(claim.report.title)).toBeTruthy();
    expect(getStaffClaims).toHaveBeenCalledWith({});
    expect(
      screen.getAllByRole("option").map((option) => ({
        label: option.textContent,
        value: (option as HTMLOptionElement).value,
      })),
    ).toEqual([
      { label: "Pending", value: "pending" },
      { label: "Approved", value: "approved" },
      { label: "Rejected", value: "rejected" },
      { label: "Withdrawn", value: "withdrawn" },
      { label: "Completed", value: "completed" },
    ]);
  });

  it.each<ClaimStatus>([
    "pending",
    "approved",
    "rejected",
    "withdrawn",
    "completed",
  ])("requests the %s queue represented by the URL", async (status) => {
    currentSearch = new URLSearchParams(`status=${status}`);
    vi.mocked(getStaffClaims).mockResolvedValue(pageFor(status));
    render(<StaffClaimListClient />);

    expect(await screen.findByText(pageFor(status).claims[0].report.title)).toBeTruthy();
    expect(getStaffClaims).toHaveBeenCalledWith(
      status === "pending" ? {} : { status },
    );
    expect((screen.getByLabelText("Claim status") as HTMLSelectElement).value).toBe(
      status,
    );
  });

  it("recovers malformed and duplicate filters through the canonical URL", async () => {
    currentSearch = new URLSearchParams(
      "status=pending&status=approved&page=0&page=2&private=raw-secret-value",
    );
    render(<StaffClaimListClient />);

    expect(await screen.findByText("Some invalid Claim filters were ignored.")).toBeTruthy();
    expect(replace).toHaveBeenCalledWith("/staff/claims");
    expect(getStaffClaims).toHaveBeenCalledWith({});
    expect(document.body.textContent).not.toContain("raw-secret-value");
  });

  it("removes redundant default parameters from the URL", async () => {
    currentSearch = new URLSearchParams("status=pending&page=1");
    render(<StaffClaimListClient />);

    expect(await screen.findByText(claim.report.title)).toBeTruthy();
    expect(replace).toHaveBeenCalledWith("/staff/claims");
    expect(getStaffClaims).toHaveBeenCalledWith({});
  });

  it("changes status through the URL and resets the page", async () => {
    const user = userEvent.setup();
    currentSearch = new URLSearchParams("status=approved&page=3");
    render(<StaffClaimListClient />);
    await waitFor(() => expect(getStaffClaims).toHaveBeenCalledWith({ status: "approved", page: 3 }));

    await user.selectOptions(screen.getByLabelText("Claim status"), "completed");
    expect(push).toHaveBeenCalledWith("/staff/claims?status=completed");
  });

  it("treats Back and Forward URL changes as authoritative", async () => {
    vi.mocked(getStaffClaims).mockImplementation(async ({ status }) =>
      pageFor(status ?? "pending"),
    );
    const view = render(<StaffClaimListClient />);
    expect(await screen.findByText("Pending report")).toBeTruthy();

    currentSearch = new URLSearchParams("status=completed");
    view.rerender(<StaffClaimListClient />);
    expect(await screen.findByText("Completed report")).toBeTruthy();
    expect(screen.queryByText("Pending report")).toBeNull();

    currentSearch = new URLSearchParams();
    view.rerender(<StaffClaimListClient />);
    expect(await screen.findByText("Pending report")).toBeTruthy();
    expect(getStaffClaims).toHaveBeenLastCalledWith({});
  });
});

describe("StaffClaimListClient results and recovery", () => {
  it("distinguishes an empty pending queue from empty filtered history", async () => {
    vi.mocked(getStaffClaims).mockResolvedValue({
      claims: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });
    const view = render(<StaffClaimListClient />);
    expect(await screen.findByText("No Claims are waiting for review")).toBeTruthy();

    currentSearch = new URLSearchParams("status=rejected");
    view.rerender(<StaffClaimListClient />);
    expect(await screen.findByText("No Claims match this status")).toBeTruthy();
  });

  it("offers a generic retry without exposing the underlying error", async () => {
    const user = userEvent.setup();
    vi.mocked(getStaffClaims)
      .mockRejectedValueOnce(new Error("private service detail"))
      .mockResolvedValueOnce(staffPage);
    render(<StaffClaimListClient />);

    const retry = await screen.findByRole("button", { name: "Retry Claim reviews" });
    expect(screen.getByText("We could not load Claim reviews")).toBeTruthy();
    expect(document.body.textContent).not.toContain("private service detail");
    await user.click(retry);
    expect(await screen.findByText(claim.report.title)).toBeTruthy();
    expect(getStaffClaims).toHaveBeenCalledTimes(2);
  });

  it("renders only concise queue fields, local time and an encoded review link", async () => {
    vi.mocked(getStaffClaims).mockResolvedValue({
      ...staffPage,
      claims: [
        {
          ...claim,
          reviewNote: "Private internal note",
          responses: [{ answer: "Blue library label", matched: true }],
          expectedAnswer: "Never render",
          activeClaimKey: "secret-key",
          reviewedBy: "64b64c6f2f4d9f1a2b3c4d77",
        } as StaffClaimSummary,
      ],
    });
    render(<StaffClaimListClient />);

    const article = await screen.findByRole("article", { name: claim.report.title });
    expect(article.textContent).toContain("Found report");
    expect(article.textContent).toContain("Student Name");
    expect(article.textContent).toContain("Pending");
    expect(article.textContent).toContain("1 of 2 answers matched");
    expect(article.textContent).toContain(
      new Intl.DateTimeFormat("en-NZ", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Pacific/Auckland",
      }).format(new Date(claim.createdAt)),
    );
    expect(
      within(article)
        .getByRole("link", { name: `Review claim for ${claim.report.title}` })
        .getAttribute("href"),
    ).toBe(`/staff/claims/${claim.id}`);
    for (const privateText of [
      "student@example.com",
      "email",
      "Private internal note",
      "Blue library label",
      "Never render",
      "secret-key",
      "64b64c6f2f4d9f1a2b3c4d77",
    ]) {
      expect(article.textContent).not.toContain(privateText);
    }
    expect(document.body.textContent).not.toContain(claim.report.id);
    expect(document.body.textContent).toContain("1 Claim · Page 1 of 1");
  });

  it("preserves status in bounded pagination controls", async () => {
    currentSearch = new URLSearchParams("status=completed&page=2");
    vi.mocked(getStaffClaims).mockResolvedValue({
      ...staffPage,
      pagination: { page: 2, pageSize: 20, total: 41, totalPages: 3 },
    });
    render(<StaffClaimListClient />);

    expect(
      (await screen.findByRole("link", { name: "Previous page" })).getAttribute(
        "href",
      ),
    ).toBe("/staff/claims?status=completed");
    expect(screen.getByRole("link", { name: "Next page" }).getAttribute("href")).toBe(
      "/staff/claims?status=completed&page=3",
    );
    expect(screen.getByRole("navigation", { name: "Claim review pages" })).toBeTruthy();
  });

  it("renders disabled pagination controls at both bounds", async () => {
    render(<StaffClaimListClient />);

    await screen.findByText(claim.report.title);
    expect(screen.queryByRole("link", { name: "Previous page" })).toBeNull();
    expect(screen.getByLabelText("Previous page").getAttribute("aria-disabled")).toBe(
      "true",
    );
    expect(screen.queryByRole("link", { name: "Next page" })).toBeNull();
    expect(screen.getByLabelText("Next page").getAttribute("aria-disabled")).toBe(
      "true",
    );
  });

  it("does not let an older queue overwrite the current URL", async () => {
    const pending = deferred<StaffClaimPage>();
    const completed = deferred<StaffClaimPage>();
    vi.mocked(getStaffClaims)
      .mockReturnValueOnce(pending.promise)
      .mockReturnValueOnce(completed.promise);
    const view = render(<StaffClaimListClient />);
    await waitFor(() => expect(getStaffClaims).toHaveBeenCalledTimes(1));

    currentSearch = new URLSearchParams("status=completed");
    view.rerender(<StaffClaimListClient />);
    await waitFor(() => expect(getStaffClaims).toHaveBeenCalledTimes(2));
    await act(async () => completed.resolve(pageFor("completed", "Completed report")));
    expect(await screen.findByText("Completed report")).toBeTruthy();
    await act(async () => pending.resolve(pageFor("pending", "Pending report")));
    expect(screen.queryByText("Pending report")).toBeNull();
  });

  it("replaces out-of-range pages and never renders their cards", async () => {
    currentSearch = new URLSearchParams("status=approved&page=4");
    vi.mocked(getStaffClaims).mockResolvedValue({
      claims: [{ ...claim, report: { ...claim.report, title: "Stale page card" } }],
      pagination: { page: 4, pageSize: 20, total: 21, totalPages: 2 },
    });
    render(<StaffClaimListClient />);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/staff/claims?status=approved&page=2"),
    );
    expect(screen.queryByText("Stale page card")).toBeNull();
  });

  it("returns an empty out-of-range page to page one", async () => {
    currentSearch = new URLSearchParams("status=completed&page=4");
    vi.mocked(getStaffClaims).mockResolvedValue({
      claims: [],
      pagination: { page: 4, pageSize: 20, total: 0, totalPages: 0 },
    });
    render(<StaffClaimListClient />);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/staff/claims?status=completed"),
    );
    expect(screen.queryByText("No Claims match this status")).toBeNull();
  });

  it("redirects a 401 and replaces a 403 with a safe permission state", async () => {
    vi.mocked(getStaffClaims).mockRejectedValueOnce(
      new ClaimBrowserError({
        code: "AUTHENTICATION_REQUIRED",
        status: 401,
        message: "Authentication required",
      }),
    );
    const view = render(<StaffClaimListClient />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));

    view.unmount();
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({ push, replace } as never);
    vi.mocked(useSearchParams).mockImplementation(() => currentSearch as never);
    vi.mocked(getStaffClaims).mockRejectedValueOnce(
      new ClaimBrowserError({
        code: "CLAIM_FORBIDDEN",
        status: 403,
        message: "Claim action is not permitted",
      }),
    );
    render(<StaffClaimListClient />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Claim review access unavailable");
    expect(alert.textContent).not.toContain("Claim action is not permitted");
    expect(screen.getByRole("link", { name: "Back to dashboard" }).getAttribute("href")).toBe(
      "/dashboard",
    );
  });
});
