// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactNode } from "react";

import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/components/claims/claimant-access-boundary", () => ({
  ClaimantAccessBoundary: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/lib/claims/browser-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/claims/browser-client")
  >("@/lib/claims/browser-client");
  return {
    ...actual,
    getMyClaim: vi.fn(),
    withdrawMyClaim: vi.fn(),
  };
});

import { useRouter } from "next/navigation";

import ClaimDetailPage, { metadata } from "@/app/claims/[id]/page";
import {
  ClaimBrowserError,
  getMyClaim,
  withdrawMyClaim,
  type ClaimantClaim,
  type ClaimStatus,
} from "@/lib/claims/browser-client";

import { ClaimDetailClient } from "./claim-detail-client";

const replace = vi.fn();

const claimantClaim: ClaimantClaim = {
  id: "claim/id with spaces",
  report: {
    id: "report/id with spaces",
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
  vi.mocked(getMyClaim).mockResolvedValue(claimantClaim);
  vi.mocked(withdrawMyClaim).mockResolvedValue({
    ...claimantClaim,
    status: "withdrawn",
    withdrawnAt: "2026-08-24T03:00:00.000Z",
    updatedAt: "2026-08-24T03:00:00.000Z",
  });
});

afterEach(cleanup);

describe("ClaimDetailClient route and safe detail", () => {
  it("provides protected route metadata and awaits its claim id", async () => {
    expect(metadata.title).toBe("Claim details");
    const source = readFileSync(resolve("src/app/claims/[id]/page.tsx"), "utf8");
    expect(source).toContain("params: Promise<{ id: string }>");
    expect(source).toContain("<ClaimantAccessBoundary>");

    const route = await ClaimDetailPage({
      params: Promise.resolve({ id: claimantClaim.id }),
    });
    render(route);
    expect(await screen.findByRole("heading", { name: "Claim details" })).toBeTruthy();
    expect(getMyClaim).toHaveBeenCalledWith(claimantClaim.id);
  });

  it("shows loading then only claimant-safe fields, links and local dates", async () => {
    const pending = deferred<ClaimantClaim>();
    vi.mocked(getMyClaim).mockReturnValue(pending.promise);
    const privateShape = {
      ...claimantClaim,
      answers: [{ answer: "secret blue sticker" }],
      expectedAnswer: "secret answer",
      verificationMatchedCount: 2,
      reviewNote: "private staff note",
      reviewedBy: "private reviewer",
      claimant: { email: "private@example.com" },
    } as ClaimantClaim;
    render(<ClaimDetailClient claimId={claimantClaim.id} />);
    expect(screen.getByRole("status").textContent).toContain("Loading claim details");
    pending.resolve(privateShape);

    expect(await screen.findByRole("heading", { name: "Claim details" })).toBeTruthy();
    expect(screen.getByText(claimantClaim.report.title)).toBeTruthy();
    expect(screen.getByText("Found report")).toBeTruthy();
    expect(screen.getByText("Report status: Claim pending")).toBeTruthy();
    expect(screen.getByText("Pending")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to My claims" }).getAttribute("href"))
      .toBe("/claims");
    expect(screen.getByRole("link", { name: "View report" }).getAttribute("href"))
      .toBe("/reports/report%2Fid%20with%20spaces");

    const formatter = new Intl.DateTimeFormat("en-NZ", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Pacific/Auckland",
    });
    expect(screen.getByText(formatter.format(new Date(claimantClaim.createdAt)))).toBeTruthy();
    expect(screen.getByText(formatter.format(new Date(claimantClaim.updatedAt)))).toBeTruthy();
    expect(document.body.textContent).not.toMatch(
      /secret blue sticker|secret answer|private staff note|private reviewer|private@example.com/,
    );
  });

  it.each([
    ["pending", "Awaiting staff review."],
    ["approved", "Ownership review approved; follow campus handover instructions."],
    ["rejected", "The ownership claim was not approved."],
    ["withdrawn", "The student withdrew the claim."],
    ["completed", "Recovery was recorded as completed."],
  ] satisfies [ClaimStatus, string][]) (
    "renders safe explanatory copy for %s",
    async (status, copy) => {
      vi.mocked(getMyClaim).mockResolvedValue({ ...claimantClaim, status });
      render(<ClaimDetailClient claimId={claimantClaim.id} />);
      expect(await screen.findByText(copy)).toBeTruthy();
    },
  );

  it("renders only non-null lifecycle timestamps", async () => {
    const timestamped = {
      ...claimantClaim,
      status: "completed" as const,
      reviewedAt: "2026-08-24T03:00:00.000Z",
      withdrawnAt: "2026-08-24T04:00:00.000Z",
      completedAt: "2026-08-24T05:00:00.000Z",
    };
    vi.mocked(getMyClaim).mockResolvedValue(timestamped);
    render(<ClaimDetailClient claimId={claimantClaim.id} />);
    const details = await screen.findByRole("region", { name: "Claim timeline" });
    expect(within(details).getByText("Reviewed")).toBeTruthy();
    expect(within(details).getByText("Withdrawn")).toBeTruthy();
    expect(within(details).getByText("Completed")).toBeTruthy();
  });

  it("renders no optional lifecycle label when every optional date is null", async () => {
    render(<ClaimDetailClient claimId={claimantClaim.id} />);
    await screen.findByRole("heading", { name: "Claim details" });
    expect(screen.queryByText("Reviewed")).toBeNull();
    expect(screen.queryByText("Withdrawn")).toBeNull();
    expect(screen.queryByText("Completed")).toBeNull();
  });
});

describe("ClaimDetailClient loading and refresh", () => {
  it("refreshes manually while preserving safe detail and uses the returned claim", async () => {
    const user = userEvent.setup();
    const refresh = deferred<ClaimantClaim>();
    vi.mocked(getMyClaim)
      .mockResolvedValueOnce(claimantClaim)
      .mockReturnValueOnce(refresh.promise);
    render(<ClaimDetailClient claimId={claimantClaim.id} />);

    await user.click(await screen.findByRole("button", { name: "Refresh status" }));
    expect(screen.getByText(claimantClaim.report.title)).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Refreshing status" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(screen.getByText("Refreshing claim status")).toBeTruthy();
    refresh.resolve({ ...claimantClaim, status: "approved" });
    expect(await screen.findByText(/Ownership review approved/)).toBeTruthy();
    expect(getMyClaim).toHaveBeenCalledTimes(2);
  });

  it("keeps safe detail after a refresh failure and can retry", async () => {
    const user = userEvent.setup();
    vi.mocked(getMyClaim)
      .mockResolvedValueOnce(claimantClaim)
      .mockRejectedValueOnce(new Error("private refresh detail"))
      .mockResolvedValueOnce({ ...claimantClaim, status: "approved" });
    render(<ClaimDetailClient claimId={claimantClaim.id} />);

    await user.click(await screen.findByRole("button", { name: "Refresh status" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "We could not refresh this claim. Please try again.",
    );
    expect(screen.getByText(claimantClaim.report.title)).toBeTruthy();
    expect(document.body.textContent).not.toContain("private refresh detail");
    await user.click(screen.getByRole("button", { name: "Refresh status" }));
    expect(await screen.findByText(/Ownership review approved/)).toBeTruthy();
  });

  it("hides old detail immediately and ignores an older refresh after claim id changes", async () => {
    const user = userEvent.setup();
    const oldRefresh = deferred<ClaimantClaim>();
    const nextLoad = deferred<ClaimantClaim>();
    vi.mocked(getMyClaim)
      .mockResolvedValueOnce(claimantClaim)
      .mockReturnValueOnce(oldRefresh.promise)
      .mockReturnValueOnce(nextLoad.promise);
    const view = render(<ClaimDetailClient claimId={claimantClaim.id} />);
    await user.click(await screen.findByRole("button", { name: "Refresh status" }));

    const nextClaim = {
      ...claimantClaim,
      id: "next/claim",
      report: { ...claimantClaim.report, title: "Found library card" },
      status: "approved" as const,
    };
    view.rerender(<ClaimDetailClient claimId={nextClaim.id} />);
    expect(screen.queryByText(claimantClaim.report.title)).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Loading claim details");
    await act(async () => nextLoad.resolve(nextClaim));
    expect(await screen.findByText(nextClaim.report.title)).toBeTruthy();

    await act(async () => oldRefresh.resolve({ ...claimantClaim, status: "withdrawn" }));
    expect(screen.queryByText(claimantClaim.report.title)).toBeNull();
    expect(screen.queryByText("The student withdrew the claim.")).toBeNull();
  });

  it("ignores a stale authentication failure after unmount", async () => {
    const pending = deferred<ClaimantClaim>();
    vi.mocked(getMyClaim).mockReturnValue(pending.promise);
    const view = render(<ClaimDetailClient claimId={claimantClaim.id} />);
    await waitFor(() => expect(getMyClaim).toHaveBeenCalledOnce());
    view.unmount();
    await act(async () => {
      pending.reject(claimError("AUTHENTICATION_REQUIRED", 401));
      try {
        await pending.promise;
      } catch {
        // The stale request is expected to reject.
      }
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    ["CLAIM_NOT_FOUND", 404, "Claim not found"],
    ["CLAIM_FORBIDDEN", 403, "Claim access unavailable"],
  ])("maps %s to a safe state", async (code, status, heading) => {
    vi.mocked(getMyClaim).mockRejectedValue(claimError(code, status));
    render(<ClaimDetailClient claimId={claimantClaim.id} />);
    expect(await screen.findByRole("heading", { name: heading })).toBeTruthy();
    expect(document.body.textContent).not.toContain("private service detail");
  });

  it("redirects a later 401", async () => {
    vi.mocked(getMyClaim).mockRejectedValue(
      claimError("AUTHENTICATION_REQUIRED", 401),
    );
    render(<ClaimDetailClient claimId={claimantClaim.id} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(document.body.textContent).not.toContain("private service detail");
  });

  it.each([
    ["CLAIM_FORBIDDEN", 403, "Claim access unavailable"],
    ["CLAIM_NOT_FOUND", 404, "Claim not found"],
  ])("focuses the safe heading after refresh %s", async (code, status, heading) => {
    const user = userEvent.setup();
    vi.mocked(getMyClaim)
      .mockResolvedValueOnce(claimantClaim)
      .mockRejectedValueOnce(claimError(code, status));
    render(<ClaimDetailClient claimId={claimantClaim.id} />);

    await user.click(await screen.findByRole("button", { name: "Refresh status" }));
    const safeHeading = await screen.findByRole("heading", { name: heading });
    expect(document.activeElement).toBe(safeHeading);
    expect(safeHeading.getAttribute("tabindex")).toBe("-1");
  });

  it("offers a safe retry after a generic initial failure", async () => {
    const user = userEvent.setup();
    vi.mocked(getMyClaim)
      .mockRejectedValueOnce(new Error("private load detail"))
      .mockResolvedValueOnce(claimantClaim);
    render(<ClaimDetailClient claimId={claimantClaim.id} />);
    await user.click(await screen.findByRole("button", { name: "Retry claim details" }));
    expect(await screen.findByText(claimantClaim.report.title)).toBeTruthy();
    expect(document.body.textContent).not.toContain("private load detail");
  });
});

describe("ClaimDetailClient withdrawal", () => {
  it.each(["pending", "approved"] satisfies ClaimStatus[]) (
    "offers withdrawal for %s",
    async (status) => {
      vi.mocked(getMyClaim).mockResolvedValue({ ...claimantClaim, status });
      render(<ClaimDetailClient claimId={claimantClaim.id} />);
      expect(await screen.findByRole("button", { name: "Withdraw claim" })).toBeTruthy();
    },
  );

  it.each(["rejected", "withdrawn", "completed"] satisfies ClaimStatus[]) (
    "does not offer withdrawal for %s",
    async (status) => {
      vi.mocked(getMyClaim).mockResolvedValue({ ...claimantClaim, status });
      render(<ClaimDetailClient claimId={claimantClaim.id} />);
      await screen.findByRole("heading", { name: "Claim details" });
      expect(screen.queryByRole("button", { name: "Withdraw claim" })).toBeNull();
    },
  );

  it("opens adjacent confirmation and Keep claim cancels without a request", async () => {
    const user = userEvent.setup();
    render(<ClaimDetailClient claimId={claimantClaim.id} />);
    const trigger = await screen.findByRole("button", { name: "Withdraw claim" });
    await user.click(trigger);
    const confirmation = screen.getByRole("region", { name: "Withdraw this claim?" });
    expect(trigger.nextElementSibling).toBe(confirmation);
    expect(within(confirmation).getByText("Withdrawal cannot be undone.")).toBeTruthy();
    await user.click(within(confirmation).getByRole("button", { name: "Keep claim" }));
    expect(screen.queryByRole("region", { name: "Withdraw this claim?" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(withdrawMyClaim).not.toHaveBeenCalled();
  });

  it("prevents duplicate withdrawal and replaces detail with the returned claim", async () => {
    const user = userEvent.setup();
    const pending = deferred<ClaimantClaim>();
    vi.mocked(withdrawMyClaim).mockReturnValue(pending.promise);
    render(<ClaimDetailClient claimId={claimantClaim.id} />);

    await user.click(await screen.findByRole("button", { name: "Withdraw claim" }));
    const confirm = screen.getByRole("button", { name: "Confirm withdrawal" });
    await user.dblClick(confirm);
    expect(withdrawMyClaim).toHaveBeenCalledOnce();
    expect(
      (screen.getByRole("button", { name: "Withdrawing claim" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Keep claim" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    const withdrawn = {
      ...claimantClaim,
      report: {
        ...claimantClaim.report,
        title: "Found updated student card",
        status: "closed" as const,
      },
      status: "withdrawn",
      withdrawnAt: "2026-08-24T03:00:00.000Z",
      updatedAt: "2026-08-24T04:30:00.000Z",
    } satisfies ClaimantClaim;
    pending.resolve(withdrawn);
    expect(await screen.findByText("The student withdrew the claim.")).toBeTruthy();
    expect(screen.getByText(withdrawn.report.title)).toBeTruthy();
    expect(screen.getByText("Report status: Closed")).toBeTruthy();
    expect(
      screen.getByText(
        new Intl.DateTimeFormat("en-NZ", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: "Pacific/Auckland",
        }).format(new Date(withdrawn.updatedAt)),
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Withdraw claim" })).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Refresh status" }),
    );
  });

  it("keeps safe detail and asks for refresh after a state conflict", async () => {
    const user = userEvent.setup();
    vi.mocked(withdrawMyClaim).mockRejectedValue(
      claimError("CLAIM_STATE_CONFLICT", 409),
    );
    render(<ClaimDetailClient claimId={claimantClaim.id} />);

    await user.click(await screen.findByRole("button", { name: "Withdraw claim" }));
    await user.click(screen.getByRole("button", { name: "Confirm withdrawal" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "This claim changed. Refresh its status before trying again.",
    );
    expect(screen.getByText(claimantClaim.report.title)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Withdraw this claim?" })).toBeNull();
    expect(document.body.textContent).not.toContain("private service detail");
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Refresh status" }),
    );
  });

  it("does not let an older refresh completion unlock a newer refresh", async () => {
    const user = userEvent.setup();
    const refreshA = deferred<ClaimantClaim>();
    const refreshB = deferred<ClaimantClaim>();
    const withdrawn = {
      ...claimantClaim,
      status: "withdrawn" as const,
      withdrawnAt: "2026-08-24T03:00:00.000Z",
    };
    vi.mocked(getMyClaim)
      .mockResolvedValueOnce(claimantClaim)
      .mockReturnValueOnce(refreshA.promise)
      .mockReturnValueOnce(refreshB.promise);
    vi.mocked(withdrawMyClaim).mockResolvedValue(withdrawn);
    render(<ClaimDetailClient claimId={claimantClaim.id} />);

    await user.click(await screen.findByRole("button", { name: "Refresh status" }));
    await user.click(screen.getByRole("button", { name: "Withdraw claim" }));
    await user.click(screen.getByRole("button", { name: "Confirm withdrawal" }));
    expect(await screen.findByText("The student withdrew the claim.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Refresh status" }));
    const activeRefresh = screen.getByRole("button", { name: "Refreshing status" });
    expect((activeRefresh as HTMLButtonElement).disabled).toBe(true);

    await act(async () => refreshA.resolve({ ...claimantClaim, status: "approved" }));
    expect((activeRefresh as HTMLButtonElement).disabled).toBe(true);
    await user.click(activeRefresh);
    expect(getMyClaim).toHaveBeenCalledTimes(3);

    await act(async () =>
      refreshB.resolve({ ...withdrawn, status: "completed", completedAt: "2026-08-24T05:00:00.000Z" }),
    );
    expect(await screen.findByText("Recovery was recorded as completed.")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Refresh status" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("keeps safe detail after a generic withdrawal failure", async () => {
    const user = userEvent.setup();
    vi.mocked(withdrawMyClaim).mockRejectedValue(new Error("private mutation detail"));
    render(<ClaimDetailClient claimId={claimantClaim.id} />);
    await user.click(await screen.findByRole("button", { name: "Withdraw claim" }));
    await user.click(screen.getByRole("button", { name: "Confirm withdrawal" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "We could not withdraw this claim. Please try again.",
    );
    expect(screen.getByText(claimantClaim.report.title)).toBeTruthy();
    expect(document.body.textContent).not.toContain("private mutation detail");
  });

  it.each([
    ["CLAIM_FORBIDDEN", 403, "Claim access unavailable"],
    ["CLAIM_NOT_FOUND", 404, "Claim not found"],
  ])("maps withdrawal %s to a safe replacement state", async (code, status, heading) => {
    const user = userEvent.setup();
    vi.mocked(withdrawMyClaim).mockRejectedValue(claimError(code, status));
    render(<ClaimDetailClient claimId={claimantClaim.id} />);
    await user.click(await screen.findByRole("button", { name: "Withdraw claim" }));
    await user.click(screen.getByRole("button", { name: "Confirm withdrawal" }));
    expect(await screen.findByRole("heading", { name: heading })).toBeTruthy();
  });

  it.each([
    ["CLAIM_FORBIDDEN", 403, "Claim access unavailable"],
    ["CLAIM_NOT_FOUND", 404, "Claim not found"],
  ])(
    "blocks refresh while withdrawal is pending and focuses the %s safe state",
    async (code, status, heading) => {
      const user = userEvent.setup();
      const mutation = deferred<ClaimantClaim>();
      vi.mocked(withdrawMyClaim).mockReturnValue(mutation.promise);
      render(<ClaimDetailClient claimId={claimantClaim.id} />);
      await user.click(await screen.findByRole("button", { name: "Withdraw claim" }));
      await user.click(screen.getByRole("button", { name: "Confirm withdrawal" }));

      const refresh = screen.getByRole("button", { name: "Refresh status" });
      expect((refresh as HTMLButtonElement).disabled).toBe(true);
      await user.click(refresh);
      expect(getMyClaim).toHaveBeenCalledOnce();

      await act(async () => {
        mutation.reject(claimError(code, status));
        try {
          await mutation.promise;
        } catch {
          // The safe permission/not-found response is expected to reject.
        }
      });
      const safeHeading = await screen.findByRole("heading", { name: heading });
      expect(document.activeElement).toBe(safeHeading);
      expect(getMyClaim).toHaveBeenCalledOnce();
      expect(screen.queryByText(claimantClaim.report.title)).toBeNull();
    },
  );

  it("redirects when authentication expires during withdrawal", async () => {
    const user = userEvent.setup();
    vi.mocked(withdrawMyClaim).mockRejectedValue(
      claimError("AUTHENTICATION_REQUIRED", 401),
    );
    render(<ClaimDetailClient claimId={claimantClaim.id} />);
    await user.click(await screen.findByRole("button", { name: "Withdraw claim" }));
    await user.click(screen.getByRole("button", { name: "Confirm withdrawal" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("ignores an older withdrawal after claim id changes", async () => {
    const user = userEvent.setup();
    const mutation = deferred<ClaimantClaim>();
    vi.mocked(withdrawMyClaim).mockReturnValue(mutation.promise);
    const view = render(<ClaimDetailClient claimId={claimantClaim.id} />);
    await user.click(await screen.findByRole("button", { name: "Withdraw claim" }));
    await user.click(screen.getByRole("button", { name: "Confirm withdrawal" }));

    const nextClaim = {
      ...claimantClaim,
      id: "next/claim",
      report: { ...claimantClaim.report, title: "Found red scarf" },
      status: "approved" as const,
    };
    vi.mocked(getMyClaim).mockResolvedValueOnce(nextClaim);
    view.rerender(<ClaimDetailClient claimId={nextClaim.id} />);
    expect(screen.queryByText(claimantClaim.report.title)).toBeNull();
    expect(await screen.findByText(nextClaim.report.title)).toBeTruthy();

    await act(async () => {
      mutation.reject(claimError("AUTHENTICATION_REQUIRED", 401));
      try {
        await mutation.promise;
      } catch {
        // The stale mutation is expected to reject.
      }
    });
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText(nextClaim.report.title)).toBeTruthy();
  });
});
