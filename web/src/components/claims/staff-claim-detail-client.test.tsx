// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactNode } from "react";

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/components/claims/staff-claim-access-boundary", () => ({
  StaffClaimAccessBoundary: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/lib/claims/staff-browser-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/claims/staff-browser-client")
  >("@/lib/claims/staff-browser-client");
  return { ...actual, getStaffClaim: vi.fn() };
});

import { useRouter } from "next/navigation";

import StaffClaimDetailPage, { metadata } from "@/app/staff/claims/[id]/page";
import { ClaimBrowserError } from "@/lib/claims/browser-client";
import {
  getStaffClaim,
  type StaffClaimDetail,
} from "@/lib/claims/staff-browser-client";

import { StaffClaimDetailClient } from "./staff-claim-detail-client";

const replace = vi.fn();

const staffDetail: StaffClaimDetail = {
  id: "64b64c6f2f4d9f1a2b3c4d50",
  report: {
    id: "64b64c6f2f4d9f1a2b3c4d51",
    title: "Found student card",
    reportType: "found",
    status: "claim_pending",
  },
  status: "pending",
  reviewedAt: null,
  withdrawnAt: null,
  completedAt: null,
  createdAt: "2026-08-24T01:00:00.000Z",
  updatedAt: "2026-08-24T02:00:00.000Z",
  claimant: {
    id: "64b64c6f2f4d9f1a2b3c4d52",
    email: "student@example.com",
    displayName: "Student Name",
    preferredContactMethod: "email",
  },
  verification: { questionCount: 2, matchedCount: 1 },
  reviewedBy: null,
  reviewNote: null,
  responses: [
    {
      questionIndex: 0,
      question: "What is printed on the reverse?",
      answer: "Blue library label",
      matched: true,
    },
    {
      questionIndex: 1,
      question: "Where was it last used?",
      answer: "Engineering library",
      matched: false,
    },
  ],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function claimError(code: string, status: number) {
  return new ClaimBrowserError({ code, status, message: "private service detail" });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue({ replace } as never);
  vi.mocked(getStaffClaim).mockResolvedValue(staffDetail);
});

afterEach(cleanup);

describe("StaffClaimDetailClient route and controlled detail", () => {
  it("provides the protected async staff route", async () => {
    expect(metadata.title).toBe("Claim review");
    const source = readFileSync(resolve("src/app/staff/claims/[id]/page.tsx"), "utf8");
    expect(source).toContain("params: Promise<{ id: string }>");
    expect(source).toContain("<StaffClaimAccessBoundary>");

    const route = await StaffClaimDetailPage({
      params: Promise.resolve({ id: staffDetail.id }),
    });
    render(route);
    expect(await screen.findByRole("heading", { name: "Claim review" })).toBeTruthy();
    expect(getStaffClaim).toHaveBeenCalledWith(staffDetail.id);
  });

  it("shows loading then complete controlled fields and local dates", async () => {
    const pending = deferred<StaffClaimDetail>();
    vi.mocked(getStaffClaim).mockReturnValue(pending.promise);
    render(<StaffClaimDetailClient claimId={staffDetail.id} />);
    expect(screen.getByRole("status").textContent).toContain("Loading Claim review");
    pending.resolve(staffDetail);

    expect(await screen.findByRole("heading", { name: "Claim review" })).toBeTruthy();
    expect(screen.getByText(staffDetail.report.title)).toBeTruthy();
    expect(screen.getByText("Found report")).toBeTruthy();
    expect(screen.getByText("Report status: Claim pending")).toBeTruthy();
    expect(screen.getByText("Pending", { selector: "strong" })).toBeTruthy();
    expect(screen.getByText(staffDetail.claimant.displayName)).toBeTruthy();
    expect(screen.getByText(staffDetail.claimant.email)).toBeTruthy();
    expect(screen.getByText("Email")).toBeTruthy();
    expect(screen.getByText("1 of 2 answers matched")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to Claim reviews" }).getAttribute("href"))
      .toBe("/staff/claims");
    expect(screen.getByRole("link", { name: "View report" }).getAttribute("href"))
      .toBe(`/reports/${staffDetail.report.id}`);

    const formatter = new Intl.DateTimeFormat("en-NZ", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Pacific/Auckland",
    });
    expect(screen.getByText(formatter.format(new Date(staffDetail.createdAt)))).toBeTruthy();
    expect(screen.getByText(formatter.format(new Date(staffDetail.updatedAt)))).toBeTruthy();
  });

  it("renders ordered evidence with explicit match text and no forbidden fields", async () => {
    const reviewedDetail = {
      ...staffDetail,
      reviewedBy: "64b64c6f2f4d9f1a2b3c4d62",
      reviewNote: "Identity confirmed",
    };
    vi.mocked(getStaffClaim).mockResolvedValue(reviewedDetail);
    const { container } = render(
      <StaffClaimDetailClient claimId={reviewedDetail.id} />,
    );

    const evidence = within(
      await screen.findByRole("region", { name: "Ownership evidence" }),
    ).getAllByRole("listitem");
    expect(evidence).toHaveLength(2);
    expect(evidence[0].textContent).toContain("What is printed on the reverse?");
    expect(evidence[0].textContent).toContain("Blue library label");
    expect(evidence[0].textContent).toContain("Matched");
    expect(evidence[1].textContent).toContain("Where was it last used?");
    expect(evidence[1].textContent).toContain("Not matched");
    expect(screen.getByText("Identity confirmed")).toBeTruthy();
    expect(container.textContent).not.toMatch(
      /expectedAnswer|password|sessionToken|activeClaimKey/,
    );
    expect(container.textContent).not.toContain(reviewedDetail.reviewedBy);
  });

  it("renders only non-null lifecycle timestamps", async () => {
    vi.mocked(getStaffClaim).mockResolvedValue({
      ...staffDetail,
      status: "completed",
      reviewedAt: "2026-08-24T03:00:00.000Z",
      withdrawnAt: "2026-08-24T04:00:00.000Z",
      completedAt: "2026-08-24T05:00:00.000Z",
    });
    render(<StaffClaimDetailClient claimId={staffDetail.id} />);
    const timeline = await screen.findByRole("region", { name: "Claim timeline" });
    expect(within(timeline).getByText("Reviewed")).toBeTruthy();
    expect(within(timeline).getByText("Withdrawn")).toBeTruthy();
    expect(within(timeline).getByText("Completed")).toBeTruthy();
  });
});

describe("StaffClaimDetailClient loading and refresh", () => {
  it("refreshes once manually, preserves safe detail and announces success", async () => {
    const user = userEvent.setup();
    const refresh = deferred<StaffClaimDetail>();
    vi.mocked(getStaffClaim)
      .mockResolvedValueOnce(staffDetail)
      .mockReturnValueOnce(refresh.promise);
    render(<StaffClaimDetailClient claimId={staffDetail.id} />);

    const button = await screen.findByRole("button", { name: "Refresh review" });
    await user.dblClick(button);
    expect(getStaffClaim).toHaveBeenCalledTimes(2);
    expect(screen.getByText(staffDetail.report.title)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Refreshing review" }) as HTMLButtonElement).disabled)
      .toBe(true);
    refresh.resolve({ ...staffDetail, status: "approved" });
    expect(await screen.findByText("Approved", { selector: "strong" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Claim review refreshed.");
  });

  it("keeps safe detail visible when refresh fails and can retry", async () => {
    const user = userEvent.setup();
    vi.mocked(getStaffClaim)
      .mockResolvedValueOnce(staffDetail)
      .mockRejectedValueOnce(
        new ClaimBrowserError({
          code: "NETWORK_ERROR",
          status: 0,
          message: "private network detail",
        }),
      )
      .mockResolvedValueOnce({ ...staffDetail, status: "approved" });
    render(<StaffClaimDetailClient claimId={staffDetail.id} />);

    await user.click(await screen.findByRole("button", { name: "Refresh review" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "We could not refresh this Claim. Please try again.",
    );
    expect(screen.getByText(staffDetail.report.title)).toBeTruthy();
    expect(document.body.textContent).not.toContain("private network detail");
    await user.click(screen.getByRole("button", { name: "Refresh review" }));
    expect(await screen.findByText("Approved", { selector: "strong" })).toBeTruthy();
  });

  it("hides old detail on id change and ignores the stale response", async () => {
    const user = userEvent.setup();
    const oldRefresh = deferred<StaffClaimDetail>();
    const nextLoad = deferred<StaffClaimDetail>();
    vi.mocked(getStaffClaim)
      .mockResolvedValueOnce(staffDetail)
      .mockReturnValueOnce(oldRefresh.promise)
      .mockReturnValueOnce(nextLoad.promise);
    const view = render(<StaffClaimDetailClient claimId={staffDetail.id} />);
    await user.click(await screen.findByRole("button", { name: "Refresh review" }));

    const nextClaim = {
      ...staffDetail,
      id: "64b64c6f2f4d9f1a2b3c4d70",
      report: { ...staffDetail.report, title: "Found library card" },
      status: "approved" as const,
    };
    view.rerender(<StaffClaimDetailClient claimId={nextClaim.id} />);
    expect(screen.queryByText(staffDetail.report.title)).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Loading Claim review");
    await waitFor(() => expect(getStaffClaim).toHaveBeenCalledTimes(3));
    await act(async () => nextLoad.resolve(nextClaim));
    expect(await screen.findByText(nextClaim.report.title)).toBeTruthy();

    await act(async () => oldRefresh.resolve({ ...staffDetail, status: "withdrawn" }));
    expect(screen.queryByText(staffDetail.report.title)).toBeNull();
    expect(screen.getByText("Approved", { selector: "strong" })).toBeTruthy();
  });

  it("ignores a stale authentication failure after unmount", async () => {
    const pending = deferred<StaffClaimDetail>();
    vi.mocked(getStaffClaim).mockReturnValue(pending.promise);
    const view = render(<StaffClaimDetailClient claimId={staffDetail.id} />);
    await waitFor(() => expect(getStaffClaim).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => {
      pending.reject(claimError("AUTHENTICATION_REQUIRED", 401));
      try {
        await pending.promise;
      } catch {
        // Expected stale rejection.
      }
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    ["CLAIM_FORBIDDEN", 403, "Claim review access unavailable"],
    ["CLAIM_NOT_FOUND", 404, "Claim not found"],
  ])("maps initial %s to a focused safe state", async (code, status, heading) => {
    vi.mocked(getStaffClaim).mockRejectedValue(claimError(code, status));
    render(<StaffClaimDetailClient claimId={staffDetail.id} />);
    const safeHeading = await screen.findByRole("heading", { name: heading });
    expect(document.activeElement).toBe(safeHeading);
    expect(document.body.textContent).not.toContain("private service detail");
  });

  it("redirects a 401 without exposing its message", async () => {
    vi.mocked(getStaffClaim).mockRejectedValue(
      claimError("AUTHENTICATION_REQUIRED", 401),
    );
    render(<StaffClaimDetailClient claimId={staffDetail.id} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.getByRole("status").textContent).toContain("Taking you to sign in");
    expect(document.body.textContent).not.toContain("private service detail");
    expect(document.body.textContent).not.toContain(staffDetail.claimant.email);
  });

  it("clears private detail immediately when refresh authentication expires", async () => {
    const user = userEvent.setup();
    const reviewedDetail = { ...staffDetail, reviewNote: "Private staff note" };
    vi.mocked(getStaffClaim)
      .mockResolvedValueOnce(reviewedDetail)
      .mockRejectedValueOnce(claimError("AUTHENTICATION_REQUIRED", 401));
    render(<StaffClaimDetailClient claimId={reviewedDetail.id} />);

    await user.click(await screen.findByRole("button", { name: "Refresh review" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.getByRole("status").textContent).toContain("Taking you to sign in");
    expect(document.body.textContent).not.toContain(reviewedDetail.report.title);
    expect(document.body.textContent).not.toContain(reviewedDetail.claimant.email);
    expect(document.body.textContent).not.toContain(reviewedDetail.responses[0].question);
    expect(document.body.textContent).not.toContain("Private staff note");
    expect(document.body.textContent).not.toContain("private service detail");
  });

  it("maps an explicit 500 envelope to generic safe copy", async () => {
    vi.mocked(getStaffClaim).mockRejectedValue(
      claimError("CLAIM_OPERATION_FAILED", 500),
    );
    render(<StaffClaimDetailClient claimId={staffDetail.id} />);

    expect(
      await screen.findByRole("heading", { name: "We could not load this Claim" }),
    ).toBeTruthy();
    expect(screen.getByText("Retry when the Claim service is available.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("private service detail");
  });

  it.each([
    ["CLAIM_FORBIDDEN", 403, "Claim review access unavailable"],
    ["CLAIM_NOT_FOUND", 404, "Claim not found"],
  ])("replaces detail and focuses after refresh %s", async (code, status, heading) => {
    const user = userEvent.setup();
    vi.mocked(getStaffClaim)
      .mockResolvedValueOnce(staffDetail)
      .mockRejectedValueOnce(claimError(code, status));
    render(<StaffClaimDetailClient claimId={staffDetail.id} />);
    await user.click(await screen.findByRole("button", { name: "Refresh review" }));
    const safeHeading = await screen.findByRole("heading", { name: heading });
    expect(document.activeElement).toBe(safeHeading);
    expect(screen.queryByText(staffDetail.report.title)).toBeNull();
  });

  it("offers a safe retry after a generic initial failure", async () => {
    const user = userEvent.setup();
    vi.mocked(getStaffClaim)
      .mockRejectedValueOnce(new Error("private load detail"))
      .mockResolvedValueOnce(staffDetail);
    render(<StaffClaimDetailClient claimId={staffDetail.id} />);
    const errorHeading = await screen.findByRole("heading", {
      name: "We could not load this Claim",
    });
    expect(document.activeElement).toBe(errorHeading);
    await user.click(screen.getByRole("button", { name: "Retry Claim review" }));
    expect(await screen.findByText(staffDetail.report.title)).toBeTruthy();
    expect(document.body.textContent).not.toContain("private load detail");
  });
});
