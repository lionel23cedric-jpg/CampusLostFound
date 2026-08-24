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
vi.mock("@/components/claims/claimant-access-boundary", () => ({
  ClaimantAccessBoundary: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/lib/claims/browser-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/claims/browser-client")>(
    "@/lib/claims/browser-client",
  );
  return { ...actual, getMyClaims: vi.fn() };
});

import { useRouter, useSearchParams } from "next/navigation";

import ClaimsPage, { metadata } from "@/app/claims/page";
import {
  ClaimBrowserError,
  getMyClaims,
  type ClaimPage,
  type ClaimantClaim,
  type ClaimStatus,
} from "@/lib/claims/browser-client";

import { ClaimListClient } from "./claim-list-client";

const push = vi.fn();
const replace = vi.fn();
let currentSearch = new URLSearchParams();

const claim: ClaimantClaim = {
  id: "claim/id with spaces",
  report: {
    id: "report-id",
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
};

const claimPage: ClaimPage = {
  claims: [claim],
  pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
};

function pageFor(status: ClaimStatus, title = `${status} report`): ClaimPage {
  return {
    claims: [
      {
        ...claim,
        id: `${status}-claim`,
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
  vi.mocked(getMyClaims).mockResolvedValue(claimPage);
});

afterEach(cleanup);

describe("ClaimListClient route and URL state", () => {
  it("provides route metadata, main landmark, Suspense fallback and access boundary", async () => {
    expect(metadata.title).toBe("My claims");
    const routeSource = readFileSync(resolve("src/app/claims/page.tsx"), "utf8");
    expect(routeSource).toContain('<main id="main-content">');
    expect(routeSource).toContain("<Suspense");
    expect(routeSource).toContain("Loading claim history");
    expect(routeSource).toContain("<ClaimantAccessBoundary>");

    const { container } = render(<ClaimsPage />);
    expect(container.querySelector("main#main-content")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "My claims" })).toBeTruthy();
  });

  it("loads safe defaults and exposes all five native status options", async () => {
    render(<ClaimListClient />);

    expect(await screen.findByText(claim.report.title)).toBeTruthy();
    expect(getMyClaims).toHaveBeenCalledWith({});
    const select = screen.getByRole("combobox", { name: "Claim status" });
    expect(select.tagName).toBe("SELECT");
    expect(
      screen.getAllByRole("option").map((option) => ({
        label: option.textContent,
        value: (option as HTMLOptionElement).value,
      })),
    ).toEqual([
      { label: "All statuses", value: "" },
      { label: "Pending", value: "pending" },
      { label: "Approved", value: "approved" },
      { label: "Rejected", value: "rejected" },
      { label: "Withdrawn", value: "withdrawn" },
      { label: "Completed", value: "completed" },
    ]);
  });

  it("recovers duplicate and invalid URL values without sending them to the API", async () => {
    currentSearch = new URLSearchParams(
      "status=pending&status=approved&page=0&page=2&private=evidence",
    );
    render(<ClaimListClient />);

    expect(await screen.findByText("Some invalid claim filters were ignored.")).toBeTruthy();
    expect(getMyClaims).toHaveBeenCalledWith({});
    expect((screen.getByLabelText("Claim status") as HTMLSelectElement).value).toBe("");
    expect(document.body.textContent).not.toContain("evidence");
  });

  it("changes status through the URL and resets the page", async () => {
    const user = userEvent.setup();
    currentSearch = new URLSearchParams("status=pending&page=3");
    render(<ClaimListClient />);
    await screen.findByRole("heading", { name: "My claims" });

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Claim status" }),
      "approved",
    );
    expect(push).toHaveBeenCalledWith("/claims?status=approved");
  });

  it("treats Back and Forward URL changes as authoritative", async () => {
    vi.mocked(getMyClaims).mockImplementation(async ({ status }) =>
      pageFor(status ?? "pending"),
    );
    currentSearch = new URLSearchParams("status=pending");
    const view = render(<ClaimListClient />);
    expect(await screen.findByText("pending report")).toBeTruthy();

    currentSearch = new URLSearchParams("status=approved");
    view.rerender(<ClaimListClient />);
    expect(await screen.findByText("approved report")).toBeTruthy();
    expect(screen.queryByText("pending report")).toBeNull();

    currentSearch = new URLSearchParams("status=pending");
    view.rerender(<ClaimListClient />);
    expect(await screen.findByText("pending report")).toBeTruthy();
    expect(getMyClaims).toHaveBeenLastCalledWith({ status: "pending" });
  });
});

describe("ClaimListClient results and recovery", () => {
  it("distinguishes an empty history from a filtered empty result", async () => {
    vi.mocked(getMyClaims).mockResolvedValue({
      claims: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });
    const view = render(<ClaimListClient />);
    expect(await screen.findByText("You have not submitted a claim yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Browse reports" }).getAttribute("href")).toBe(
      "/reports",
    );

    currentSearch = new URLSearchParams("status=rejected");
    view.rerender(<ClaimListClient />);
    expect(await screen.findByText("No claims match this status")).toBeTruthy();
    expect((screen.getByLabelText("Claim status") as HTMLSelectElement).value).toBe(
      "rejected",
    );
    expect(screen.queryByRole("link", { name: "Browse reports" })).toBeNull();
  });

  it("offers a retry after a generic failure", async () => {
    const user = userEvent.setup();
    vi.mocked(getMyClaims)
      .mockRejectedValueOnce(new Error("private service detail"))
      .mockResolvedValueOnce(claimPage);
    render(<ClaimListClient />);

    const retry = await screen.findByRole("button", { name: "Retry claim history" });
    expect(document.body.textContent).not.toContain("private service detail");
    await user.click(retry);
    expect(await screen.findByText(claim.report.title)).toBeTruthy();
    expect(getMyClaims).toHaveBeenCalledTimes(2);
  });

  it("renders only safe card fields, local dates and an encoded detail link", async () => {
    vi.mocked(getMyClaims).mockResolvedValue({
      ...claimPage,
      claims: [
        {
          ...claim,
          expectedAnswer: "never render",
          reviewNote: "private review",
          claimant: { email: "private@example.com" },
        } as ClaimantClaim,
      ],
    });
    render(<ClaimListClient />);

    const article = await screen.findByRole("article", { name: claim.report.title });
    expect(article.textContent).toContain("Found report");
    expect(article.textContent).toContain("Pending");
    const formatter = new Intl.DateTimeFormat("en-NZ", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Pacific/Auckland",
    });
    expect(within(article).getByText("Created")).toBeTruthy();
    expect(
      within(article).getByText(formatter.format(new Date(claim.createdAt))),
    ).toBeTruthy();
    expect(within(article).getByText("Updated")).toBeTruthy();
    expect(
      within(article).getByText(formatter.format(new Date(claim.updatedAt))),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: `View claim for ${claim.report.title}` }).getAttribute("href"),
    ).toBe("/claims/claim%2Fid%20with%20spaces");
    expect(document.body.textContent).not.toContain("never render");
    expect(document.body.textContent).not.toContain("private review");
    expect(document.body.textContent).not.toContain("private@example.com");
    expect(document.body.textContent).not.toContain(claim.report.id);
  });

  it("preserves the filter in bounded pagination controls", async () => {
    currentSearch = new URLSearchParams("status=pending&page=2");
    vi.mocked(getMyClaims).mockResolvedValue({
      ...claimPage,
      pagination: { page: 2, pageSize: 20, total: 41, totalPages: 3 },
    });
    render(<ClaimListClient />);

    expect(
      (await screen.findByRole("link", { name: "Previous page" })).getAttribute("href"),
    ).toBe("/claims?status=pending");
    expect(screen.getByRole("link", { name: "Next page" }).getAttribute("href")).toBe(
      "/claims?status=pending&page=3",
    );
    expect(screen.getByText("Page 2 of 3")).toBeTruthy();
  });

  it("renders disabled pagination text at both bounds", async () => {
    vi.mocked(getMyClaims).mockResolvedValue({
      ...claimPage,
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    render(<ClaimListClient />);

    await screen.findByText(claim.report.title);
    expect(screen.queryByRole("link", { name: "Previous page" })).toBeNull();
    expect(screen.getByLabelText("Previous page").getAttribute("aria-disabled")).toBe("true");
    expect(screen.queryByRole("link", { name: "Next page" })).toBeNull();
    expect(screen.getByLabelText("Next page").getAttribute("aria-disabled")).toBe("true");
  });

  it("does not let an older query overwrite the current URL result", async () => {
    const first = deferred<ClaimPage>();
    const second = deferred<ClaimPage>();
    vi.mocked(getMyClaims)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    currentSearch = new URLSearchParams("status=pending");
    const view = render(<ClaimListClient />);
    await waitFor(() => expect(getMyClaims).toHaveBeenCalledTimes(1));

    currentSearch = new URLSearchParams("status=approved");
    view.rerender(<ClaimListClient />);
    await waitFor(() => expect(getMyClaims).toHaveBeenCalledTimes(2));
    await act(async () => second.resolve(pageFor("approved", "Approved report")));
    expect(await screen.findByText("Approved report")).toBeTruthy();
    await act(async () => first.resolve(pageFor("pending", "Pending report")));
    expect(screen.queryByText("Pending report")).toBeNull();
  });

  it("clamps a nonempty out-of-range page once and hides its stale cards", async () => {
    currentSearch = new URLSearchParams("status=pending&page=4");
    vi.mocked(getMyClaims).mockResolvedValue({
      claims: [{ ...claim, report: { ...claim.report, title: "Stale page card" } }],
      pagination: { page: 4, pageSize: 20, total: 21, totalPages: 2 },
    });
    const view = render(<ClaimListClient />);

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/claims?status=pending&page=2"),
    );
    expect(screen.queryByText("Stale page card")).toBeNull();
    view.rerender(<ClaimListClient />);
    await act(async () => undefined);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("corrects the same out-of-range URL again after visiting a valid page", async () => {
    currentSearch = new URLSearchParams("status=pending&page=4");
    vi.mocked(getMyClaims).mockImplementation(async ({ page }) =>
      page === 4
        ? {
            claims: [
              {
                ...claim,
                report: { ...claim.report, title: "Stale repeated page card" },
              },
            ],
            pagination: { page: 4, pageSize: 20, total: 21, totalPages: 2 },
          }
        : {
            claims: [
              {
                ...claim,
                report: { ...claim.report, title: "Valid final page card" },
              },
            ],
            pagination: { page: 2, pageSize: 20, total: 21, totalPages: 2 },
          },
    );
    const view = render(<ClaimListClient />);
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));

    currentSearch = new URLSearchParams("status=pending&page=2");
    view.rerender(<ClaimListClient />);
    expect(await screen.findByText("Valid final page card")).toBeTruthy();

    currentSearch = new URLSearchParams("status=pending&page=4");
    view.rerender(<ClaimListClient />);
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(2));
    expect(replace).toHaveBeenLastCalledWith("/claims?status=pending&page=2");
    expect(screen.queryByText("Stale repeated page card")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Loading your claims");
  });

  it("returns an empty out-of-range URL to page one before showing an empty state", async () => {
    currentSearch = new URLSearchParams("status=pending&page=4");
    vi.mocked(getMyClaims).mockResolvedValue({
      claims: [],
      pagination: { page: 4, pageSize: 20, total: 0, totalPages: 0 },
    });
    render(<ClaimListClient />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/claims?status=pending"));
    expect(screen.queryByText("No claims match this status")).toBeNull();
  });

  it("keeps a genuinely empty page-one collection on page one", async () => {
    vi.mocked(getMyClaims).mockResolvedValue({
      claims: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });
    render(<ClaimListClient />);

    expect(await screen.findByText("You have not submitted a claim yet")).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects a later 401 and renders a safe 403 permission state", async () => {
    vi.mocked(getMyClaims).mockRejectedValueOnce(
      new ClaimBrowserError({
        code: "AUTHENTICATION_REQUIRED",
        status: 401,
        message: "Authentication required",
      }),
    );
    const view = render(<ClaimListClient />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));

    view.unmount();
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({ push, replace } as never);
    vi.mocked(useSearchParams).mockImplementation(() => currentSearch as never);
    vi.mocked(getMyClaims).mockRejectedValueOnce(
      new ClaimBrowserError({
        code: "CLAIM_FORBIDDEN",
        status: 403,
        message: "Claim action is not permitted",
      }),
    );
    render(<ClaimListClient />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Claim access unavailable");
    expect(alert.textContent).not.toContain("Claim action is not permitted");
    expect(screen.getByRole("link", { name: "Back to dashboard" }).getAttribute("href")).toBe(
      "/dashboard",
    );
  });
});
