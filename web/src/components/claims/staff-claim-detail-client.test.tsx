// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactNode } from "react";

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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/components/claims/staff-claim-access-boundary", () => ({
  StaffClaimAccessBoundary: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/lib/claims/staff-browser-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/claims/staff-browser-client")
  >("@/lib/claims/staff-browser-client");
  return {
    ...actual,
    getStaffClaim: vi.fn(),
    decideStaffClaim: vi.fn(),
    completeStaffClaim: vi.fn(),
  };
});

import { useRouter } from "next/navigation";

import StaffClaimDetailPage, { metadata } from "@/app/staff/claims/[id]/page";
import { ClaimBrowserError } from "@/lib/claims/browser-client";
import {
  completeStaffClaim,
  decideStaffClaim,
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
  vi.mocked(decideStaffClaim).mockResolvedValue({
    ...staffDetail,
    status: "approved",
    reviewedAt: "2026-08-25T01:00:00.000Z",
  });
  vi.mocked(completeStaffClaim).mockResolvedValue({
    ...staffDetail,
    status: "completed",
    completedAt: "2026-08-25T02:00:00.000Z",
  });
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
    expect(screen.getByText("Identity confirmed", { selector: "p" })).toBeTruthy();
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
    await waitFor(() => expect(document.activeElement).toBe(safeHeading));
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

describe("StaffClaimDetailClient decisions", () => {
  it("confirms approval, warns about competing Claims and posts the trimmed note once", async () => {
    const user = userEvent.setup();
    const pending = deferred<StaffClaimDetail>();
    vi.mocked(decideStaffClaim).mockReturnValue(pending.promise);
    render(<StaffClaimDetailClient claimId={staffDetail.id} />);

    await user.type(
      await screen.findByLabelText("Internal review note"),
      "  Identity confirmed  ",
    );
    const trigger = screen.getByRole("button", { name: "Approve Claim" });
    await user.click(trigger);
    const confirmationHeading = screen.getByRole("heading", {
      name: "Approve this Claim?",
    });
    expect(document.activeElement).toBe(confirmationHeading);
    expect(screen.getByText(/other pending Claims.*rejected/i)).toBeTruthy();
    await user.dblClick(
      screen.getByRole("button", { name: "Confirm approval" }),
    );

    expect(decideStaffClaim).toHaveBeenCalledOnce();
    expect(decideStaffClaim).toHaveBeenCalledWith(staffDetail.id, {
      decision: "approve",
      reviewNote: "Identity confirmed",
    });
    expect(
      (screen.getByLabelText("Internal review note") as HTMLTextAreaElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Refresh review" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    await act(async () =>
      pending.resolve({
        ...staffDetail,
        status: "approved",
        reviewNote: "Identity confirmed",
        reviewedAt: "2026-08-25T01:00:00.000Z",
      }),
    );
    const statusHeading = await screen.findByRole("heading", {
      name: "Claim status: Approved",
    });
    expect(document.activeElement).toBe(statusHeading);
  });

  it("confirms rejection with a null blank note", async () => {
    const user = userEvent.setup();
    vi.mocked(decideStaffClaim).mockResolvedValue({
      ...staffDetail,
      status: "rejected",
      reviewedAt: "2026-08-25T01:00:00.000Z",
    });
    render(<StaffClaimDetailClient claimId={staffDetail.id} />);

    await user.click(
      await screen.findByRole("button", { name: "Reject Claim" }),
    );
    expect(
      screen.getByText(/current Claim will become rejected/i),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Confirm rejection" }),
    );
    expect(decideStaffClaim).toHaveBeenCalledWith(staffDetail.id, {
      decision: "reject",
      reviewNote: null,
    });
    expect(
      await screen.findByRole("heading", {
        name: "Claim status: Rejected",
      }),
    ).toBeTruthy();
  });

  it("rejects an internal note over 1000 characters locally", async () => {
    const user = userEvent.setup();
    render(<StaffClaimDetailClient claimId={staffDetail.id} />);
    const note = await screen.findByLabelText("Internal review note");
    fireEvent.change(note, { target: { value: "n".repeat(1001) } });
    await user.click(screen.getByRole("button", { name: "Approve Claim" }));
    await user.click(screen.getByRole("button", { name: "Confirm approval" }));

    expect(decideStaffClaim).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(
      "Review notes must be 1000 characters or fewer.",
    );
  });

  it("cancels a decision and restores focus to its trigger", async () => {
    const user = userEvent.setup();
    render(<StaffClaimDetailClient claimId={staffDetail.id} />);
    const trigger = await screen.findByRole("button", { name: "Reject Claim" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("heading", { name: "Reject this Claim?" }),
    ).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it.each([
    ["AUTHENTICATION_REQUIRED", 401, null],
    ["CLAIM_FORBIDDEN", 403, "Claim review access unavailable"],
    ["CLAIM_NOT_FOUND", 404, "Claim not found"],
  ])(
    "maps decision %s without retaining private detail",
    async (code, status, safeHeading) => {
      const user = userEvent.setup();
      vi.mocked(decideStaffClaim).mockRejectedValue(claimError(code, status));
      render(<StaffClaimDetailClient claimId={staffDetail.id} />);
      await user.click(
        await screen.findByRole("button", { name: "Approve Claim" }),
      );
      await user.click(
        screen.getByRole("button", { name: "Confirm approval" }),
      );

      if (status === 401) {
        await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
      } else {
        const heading = await screen.findByRole("heading", {
          name: safeHeading as string,
        });
        expect(document.activeElement).toBe(heading);
      }
      expect(document.body.textContent).not.toContain(staffDetail.claimant.email);
      expect(document.body.textContent).not.toContain("private service detail");
    },
  );

  it.each([
    [
      "VALIDATION_ERROR",
      400,
      "Review the decision and internal note, then try again.",
    ],
    [
      "CLAIM_OPERATION_FAILED",
      500,
      "We could not update this Claim. Please try again.",
    ],
  ])(
    "maps recoverable decision %s and restores focus",
    async (code, status, message) => {
      const user = userEvent.setup();
      vi.mocked(decideStaffClaim).mockRejectedValue(claimError(code, status));
      render(<StaffClaimDetailClient claimId={staffDetail.id} />);
      const trigger = await screen.findByRole("button", {
        name: "Approve Claim",
      });
      await user.click(trigger);
      await user.click(
        screen.getByRole("button", { name: "Confirm approval" }),
      );

      expect((await screen.findByRole("alert")).textContent).toContain(message);
      await waitFor(() => expect(document.activeElement).toBe(trigger));
      expect(screen.getByText(staffDetail.claimant.email)).toBeTruthy();
      expect(document.body.textContent).not.toContain("private service detail");
    },
  );

  it("preserves safe detail and enables refresh after a decision conflict", async () => {
    const user = userEvent.setup();
    vi.mocked(decideStaffClaim).mockRejectedValue(
      claimError("CLAIM_STATE_CONFLICT", 409),
    );
    render(<StaffClaimDetailClient claimId={staffDetail.id} />);
    const trigger = await screen.findByRole("button", { name: "Reject Claim" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Confirm rejection" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "This Claim changed. Refresh it before making another decision.",
    );
    expect(screen.getByText(staffDetail.claimant.email)).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Reject this Claim?" }),
    ).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Refresh review" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    const refreshButton = screen.getByRole("button", { name: "Refresh review" });
    await waitFor(() => expect(document.activeElement).toBe(refreshButton));
    expect((trigger as HTMLButtonElement).disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Approve Claim" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText(/Refresh this Claim before making another review action/i))
      .toBeTruthy();
    await user.click(trigger);
    expect(decideStaffClaim).toHaveBeenCalledOnce();

    vi.mocked(getStaffClaim)
      .mockRejectedValueOnce(claimError("CLAIM_OPERATION_FAILED", 500))
      .mockResolvedValueOnce(staffDetail);
    await user.click(refreshButton);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "We could not refresh this Claim. Please try again.",
    );
    expect((trigger as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Refresh this Claim before making another review action/i))
      .toBeTruthy();

    await user.click(refreshButton);
    expect(await screen.findByText("Claim review refreshed.")).toBeTruthy();
    expect((trigger as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/Refresh this Claim before making another review action/i))
      .toBeNull();
    await user.click(trigger);
    expect(
      screen.getByRole("heading", { name: "Reject this Claim?" }),
    ).toBeTruthy();
    expect(decideStaffClaim).toHaveBeenCalledOnce();
  });

  it("does not start a decision while refresh is running", async () => {
    const user = userEvent.setup();
    const refresh = deferred<StaffClaimDetail>();
    vi.mocked(getStaffClaim)
      .mockResolvedValueOnce(staffDetail)
      .mockReturnValueOnce(refresh.promise);
    render(<StaffClaimDetailClient claimId={staffDetail.id} />);
    await user.click(await screen.findByRole("button", { name: "Refresh review" }));

    expect(
      (screen.getByRole("button", { name: "Approve Claim" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Internal review note") as HTMLTextAreaElement)
        .disabled,
    ).toBe(true);
    expect(decideStaffClaim).not.toHaveBeenCalled();
    await act(async () => refresh.resolve(staffDetail));
  });
});

describe("StaffClaimDetailClient handover completion", () => {
  it("completes only an approved Claim through one confirmed request", async () => {
    const user = userEvent.setup();
    const approved = { ...staffDetail, status: "approved" as const };
    const completion = deferred<StaffClaimDetail>();
    vi.mocked(getStaffClaim).mockResolvedValue(approved);
    vi.mocked(completeStaffClaim).mockReturnValue(completion.promise);
    render(<StaffClaimDetailClient claimId={approved.id} />);

    await user.click(
      await screen.findByRole("button", { name: "Mark handover complete" }),
    );
    expect(
      screen.getByRole("heading", {
        name: "Record this handover as complete?",
      }),
    ).toBe(document.activeElement);
    expect(
      screen.getByText(/records the item as recovered and cannot be undone here/i),
    ).toBeTruthy();
    await user.dblClick(
      screen.getByRole("button", { name: "Confirm handover completion" }),
    );
    expect(completeStaffClaim).toHaveBeenCalledOnce();
    expect(completeStaffClaim).toHaveBeenCalledWith(approved.id);

    await act(async () =>
      completion.resolve({
        ...approved,
        status: "completed",
        completedAt: "2026-08-25T02:00:00.000Z",
      }),
    );
    const statusHeading = await screen.findByRole("heading", {
      name: "Claim status: Completed",
    });
    expect(document.activeElement).toBe(statusHeading);
  });

  it.each(["pending", "rejected", "withdrawn", "completed"] as const)(
    "does not offer completion for a %s Claim",
    async (status) => {
      vi.mocked(getStaffClaim).mockResolvedValue({ ...staffDetail, status });
      render(<StaffClaimDetailClient claimId={staffDetail.id} />);
      await screen.findByRole("heading", { name: "Claim review" });
      expect(
        screen.queryByRole("button", { name: "Mark handover complete" }),
      ).toBeNull();
    },
  );

  it("cancels completion and restores focus to its trigger", async () => {
    const user = userEvent.setup();
    vi.mocked(getStaffClaim).mockResolvedValue({
      ...staffDetail,
      status: "approved",
    });
    render(<StaffClaimDetailClient claimId={staffDetail.id} />);
    const trigger = await screen.findByRole("button", {
      name: "Mark handover complete",
    });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(document.activeElement).toBe(trigger);
  });

  it("maps a recoverable completion failure and preserves safe detail", async () => {
      const user = userEvent.setup();
      vi.mocked(getStaffClaim).mockResolvedValue({
        ...staffDetail,
        status: "approved",
      });
      vi.mocked(completeStaffClaim).mockRejectedValue(
        claimError("CLAIM_OPERATION_FAILED", 500),
      );
      render(<StaffClaimDetailClient claimId={staffDetail.id} />);
      const trigger = await screen.findByRole("button", {
        name: "Mark handover complete",
      });
      await user.click(trigger);
      await user.click(
        screen.getByRole("button", { name: "Confirm handover completion" }),
      );

      expect((await screen.findByRole("alert")).textContent).toContain(
        "We could not complete this handover. Please try again.",
      );
      expect(screen.getByText(staffDetail.claimant.email)).toBeTruthy();
      await waitFor(() => expect(document.activeElement).toBe(trigger));
      expect(
        (screen.getByRole("button", { name: "Refresh review" }) as HTMLButtonElement)
          .disabled,
      ).toBe(false);
  });

  it("blocks another completion after conflict until refresh succeeds", async () => {
    const user = userEvent.setup();
    vi.mocked(getStaffClaim).mockResolvedValue({
      ...staffDetail,
      status: "approved",
    });
    vi.mocked(completeStaffClaim).mockRejectedValue(
      claimError("CLAIM_STATE_CONFLICT", 409),
    );
    render(<StaffClaimDetailClient claimId={staffDetail.id} />);
    const trigger = await screen.findByRole("button", {
      name: "Mark handover complete",
    });
    await user.click(trigger);
    await user.click(
      screen.getByRole("button", { name: "Confirm handover completion" }),
    );

    expect((await screen.findByRole("alert")).textContent).toContain(
      "This Claim changed. Refresh it before recording the handover.",
    );
    const refreshButton = screen.getByRole("button", { name: "Refresh review" });
    await waitFor(() => expect(document.activeElement).toBe(refreshButton));
    expect((trigger as HTMLButtonElement).disabled).toBe(true);
    await user.click(trigger);
    expect(completeStaffClaim).toHaveBeenCalledOnce();

    await user.click(refreshButton);
    expect(await screen.findByText("Claim review refreshed.")).toBeTruthy();
    expect((trigger as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/Refresh this Claim before making another review action/i))
      .toBeNull();
    await user.click(trigger);
    expect(
      screen.getByRole("heading", {
        name: "Record this handover as complete?",
      }),
    ).toBeTruthy();
    expect(completeStaffClaim).toHaveBeenCalledOnce();
  });

  it.each([
    ["AUTHENTICATION_REQUIRED", 401, null],
    ["CLAIM_FORBIDDEN", 403, "Claim review access unavailable"],
    ["CLAIM_NOT_FOUND", 404, "Claim not found"],
  ])(
    "maps completion %s without retaining private detail",
    async (code, status, safeHeading) => {
      const user = userEvent.setup();
      vi.mocked(getStaffClaim).mockResolvedValue({
        ...staffDetail,
        status: "approved",
      });
      vi.mocked(completeStaffClaim).mockRejectedValue(claimError(code, status));
      render(<StaffClaimDetailClient claimId={staffDetail.id} />);
      await user.click(
        await screen.findByRole("button", { name: "Mark handover complete" }),
      );
      await user.click(
        screen.getByRole("button", { name: "Confirm handover completion" }),
      );

      if (status === 401) {
        await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
      } else {
        const heading = await screen.findByRole("heading", {
          name: safeHeading as string,
        });
        expect(document.activeElement).toBe(heading);
      }
      expect(document.body.textContent).not.toContain(staffDetail.claimant.email);
      expect(document.body.textContent).not.toContain("private service detail");
    },
  );

  it("ignores a completion response after unmount", async () => {
    const user = userEvent.setup();
    const completion = deferred<StaffClaimDetail>();
    const approved = { ...staffDetail, status: "approved" as const };
    vi.mocked(getStaffClaim).mockResolvedValue(approved);
    vi.mocked(completeStaffClaim).mockReturnValue(completion.promise);
    const view = render(<StaffClaimDetailClient claimId={approved.id} />);
    await user.click(
      await screen.findByRole("button", { name: "Mark handover complete" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm handover completion" }),
    );
    view.unmount();

    await act(async () =>
      completion.resolve({
        ...approved,
        status: "completed",
        completedAt: "2026-08-25T02:00:00.000Z",
      }),
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it("ignores a completed response after the Claim id changes", async () => {
    const user = userEvent.setup();
    const completion = deferred<StaffClaimDetail>();
    const approved = { ...staffDetail, status: "approved" as const };
    const nextClaim = {
      ...staffDetail,
      id: "64b64c6f2f4d9f1a2b3c4d70",
      report: { ...staffDetail.report, title: "Found library card" },
    };
    vi.mocked(getStaffClaim)
      .mockResolvedValueOnce(approved)
      .mockResolvedValueOnce(nextClaim);
    vi.mocked(completeStaffClaim).mockReturnValue(completion.promise);
    const view = render(<StaffClaimDetailClient claimId={approved.id} />);
    await user.click(
      await screen.findByRole("button", { name: "Mark handover complete" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Confirm handover completion" }),
    );
    view.rerender(<StaffClaimDetailClient claimId={nextClaim.id} />);

    expect(await screen.findByText("Found library card")).toBeTruthy();
    await act(async () =>
      completion.resolve({
        ...approved,
        status: "completed",
        completedAt: "2026-08-25T02:00:00.000Z",
      }),
    );
    expect(screen.queryByText("Completed", { selector: "strong" })).toBeNull();
    expect(screen.getByText("Pending", { selector: "strong" })).toBeTruthy();
  });
});
