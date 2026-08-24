// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactNode } from "react";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    getClaimQuestionsForReport: vi.fn(),
    submitClaim: vi.fn(),
  };
});

import { useRouter } from "next/navigation";

import ClaimReportPage, { metadata } from "@/app/reports/[id]/claim/page";
import {
  ClaimBrowserError,
  getClaimQuestionsForReport,
  submitClaim,
  type ClaimantClaim,
  type ClaimQuestions,
} from "@/lib/claims/browser-client";

import { ClaimSubmissionClient } from "./claim-submission-client";

const replace = vi.fn();

const claimQuestions: ClaimQuestions = {
  report: {
    id: "report/id",
    title: "Found student card",
    reportType: "found",
  },
  questions: [
    { questionIndex: 0, question: "What is printed on the reverse?" },
    { questionIndex: 1, question: "Which colour is the holder?" },
  ],
};

const claimantClaim: ClaimantClaim = {
  id: "claim/id",
  report: { ...claimQuestions.report, status: "open" },
  status: "pending",
  reviewedAt: null,
  withdrawnAt: null,
  completedAt: null,
  createdAt: "2026-08-24T01:00:00.000Z",
  updatedAt: "2026-08-24T01:00:00.000Z",
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue({ replace } as never);
  vi.mocked(getClaimQuestionsForReport).mockResolvedValue(claimQuestions);
  vi.mocked(submitClaim).mockResolvedValue(claimantClaim);
});

afterEach(cleanup);

describe("ClaimSubmissionClient route and question loading", () => {
  it("provides protected route metadata and awaits its report id", async () => {
    expect(metadata.title).toBe("Claim an item");
    const source = readFileSync(resolve("src/app/reports/[id]/claim/page.tsx"), "utf8");
    expect(source).toContain("params: Promise<{ id: string }>");
    expect(source).toContain("<ClaimantAccessBoundary>");

    const route = await ClaimReportPage({
      params: Promise.resolve({ id: claimQuestions.report.id }),
    });
    render(route);
    expect(await screen.findByRole("heading", { name: "Claim Found student card" })).toBeTruthy();
  });

  it("renders loading, ordered labelled fields and privacy guidance", async () => {
    const pending = deferred<ClaimQuestions>();
    vi.mocked(getClaimQuestionsForReport).mockReturnValue(pending.promise);
    render(<ClaimSubmissionClient reportId={claimQuestions.report.id} />);
    expect(screen.getByRole("status").textContent).toContain("Loading ownership questions");
    pending.resolve(claimQuestions);

    const fields = await screen.findAllByRole("textbox");
    expect(fields.map((field) => field.getAttribute("aria-label"))).toEqual([
      claimQuestions.questions[0].question,
      claimQuestions.questions[1].question,
    ]);
    expect(fields.every((field) => field.getAttribute("maxlength") === "500")).toBe(true);
    expect(screen.getByRole("group", { name: "Ownership verification" })).toBeTruthy();
    expect(screen.getByText(/This found item report/)).toBeTruthy();
    expect(screen.getByText(/authorised staff for ownership review/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/expectedAnswer|matched|reviewNote|claimant/i);
  });

  it("keeps a 200-character question usable at narrow widths", async () => {
    const longQuestion = "ownership".repeat(25);
    vi.mocked(getClaimQuestionsForReport).mockResolvedValue({
      ...claimQuestions,
      questions: [{ questionIndex: 0, question: longQuestion }],
    });
    render(<ClaimSubmissionClient reportId={claimQuestions.report.id} />);

    expect(await screen.findByLabelText(longQuestion)).toBeTruthy();
    const cssSource = readFileSync(
      resolve("src/components/claims/claim-management.module.css"),
      "utf8",
    );
    expect(cssSource).toMatch(
      /\.answerField label\s*\{[\s\S]*?overflow-wrap:\s*anywhere;/,
    );
  });

  it("retries a safe generic load failure", async () => {
    const user = userEvent.setup();
    vi.mocked(getClaimQuestionsForReport)
      .mockRejectedValueOnce(new Error("private detail"))
      .mockResolvedValueOnce(claimQuestions);
    render(<ClaimSubmissionClient reportId={claimQuestions.report.id} />);
    await user.click(await screen.findByRole("button", { name: "Retry ownership questions" }));
    expect(await screen.findByRole("heading", { name: "Claim Found student card" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("private detail");
  });

  it.each([
    ["REPORT_NOT_CLAIMABLE", 409, "This report cannot be claimed"],
    ["CLAIM_ALREADY_EXISTS", 409, "You already have an active claim"],
    ["CLAIM_FORBIDDEN", 403, "Claim access unavailable"],
  ])("maps %s question failures to a safe state", async (code, status, heading) => {
    vi.mocked(getClaimQuestionsForReport).mockRejectedValue(
      new ClaimBrowserError({ code, status, message: "private" }),
    );
    render(<ClaimSubmissionClient reportId={claimQuestions.report.id} />);
    expect(await screen.findByRole("heading", { name: heading })).toBeTruthy();
    if (code !== "CLAIM_FORBIDDEN") {
      expect(screen.getByRole("status")).toBeTruthy();
    }
    expect(document.body.textContent).not.toContain("private");
  });

  it("redirects when authentication expires while questions load", async () => {
    vi.mocked(getClaimQuestionsForReport).mockRejectedValue(
      new ClaimBrowserError({
        code: "AUTHENTICATION_REQUIRED",
        status: 401,
        message: "private",
      }),
    );
    render(<ClaimSubmissionClient reportId={claimQuestions.report.id} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(document.body.textContent).not.toContain("private");
  });
});

describe("ClaimSubmissionClient submission", () => {
  it("validates blanks before sending", async () => {
    const user = userEvent.setup();
    render(<ClaimSubmissionClient reportId={claimQuestions.report.id} />);
    await screen.findByRole("heading", { name: "Claim Found student card" });
    await user.click(screen.getByRole("button", { name: "Submit claim" }));
    expect(submitClaim).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(
      "Review every answer and try again.",
    );
    expect(screen.getAllByText("Enter an answer")).toHaveLength(2);
  });

  it("rejects an answer over 500 characters locally", async () => {
    const user = userEvent.setup();
    render(<ClaimSubmissionClient reportId={claimQuestions.report.id} />);
    const first = await screen.findByLabelText(claimQuestions.questions[0].question);
    fireEvent.change(first, { target: { value: "x".repeat(501) } });
    await user.type(screen.getByLabelText(claimQuestions.questions[1].question), "Black");
    await user.click(screen.getByRole("button", { name: "Submit claim" }));
    expect(submitClaim).not.toHaveBeenCalled();
    expect(screen.getByText("Use 500 characters or fewer")).toBeTruthy();
  });

  it("submits only current server indexes and redirects to the encoded claim detail", async () => {
    const user = userEvent.setup();
    render(<ClaimSubmissionClient reportId={claimQuestions.report.id} />);
    await user.type(
      await screen.findByLabelText(claimQuestions.questions[0].question),
      " Blue label ",
    );
    await user.type(screen.getByLabelText(claimQuestions.questions[1].question), "Black");
    await user.click(screen.getByRole("button", { name: "Submit claim" }));

    expect(submitClaim).toHaveBeenCalledWith(claimQuestions.report.id, [
      { questionIndex: 0, answer: "Blue label" },
      { questionIndex: 1, answer: "Black" },
    ]);
    expect(replace).toHaveBeenCalledWith("/claims/claim%2Fid");
  });

  it("keeps answers after a retryable failure and prevents duplicate submits", async () => {
    const user = userEvent.setup();
    const pending = deferred<ClaimantClaim>();
    vi.mocked(submitClaim).mockReturnValue(pending.promise);
    render(<ClaimSubmissionClient reportId={claimQuestions.report.id} />);
    const first = await screen.findByLabelText(claimQuestions.questions[0].question);
    await user.type(first, "Blue label");
    await user.type(screen.getByLabelText(claimQuestions.questions[1].question), "Black");
    await user.dblClick(screen.getByRole("button", { name: "Submit claim" }));
    expect(submitClaim).toHaveBeenCalledOnce();
    expect(first.closest("fieldset")?.hasAttribute("disabled")).toBe(true);
    pending.reject(new ClaimBrowserError({ code: "NETWORK_ERROR", status: 0, message: "private" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "We could not submit your claim. Your answers are still here.",
    );
    expect((first as HTMLTextAreaElement).value).toBe("Blue label");
    expect(document.body.textContent).not.toContain("private");
  });

  it("ignores a successful submission after the form unmounts", async () => {
    const user = userEvent.setup();
    const pending = deferred<ClaimantClaim>();
    vi.mocked(submitClaim).mockReturnValue(pending.promise);
    const { unmount } = render(
      <ClaimSubmissionClient reportId={claimQuestions.report.id} />,
    );
    await user.type(
      await screen.findByLabelText(claimQuestions.questions[0].question),
      "Blue",
    );
    await user.type(
      screen.getByLabelText(claimQuestions.questions[1].question),
      "Black",
    );
    await user.click(screen.getByRole("button", { name: "Submit claim" }));

    unmount();
    await act(async () => {
      pending.resolve(claimantClaim);
      await pending.promise;
    });

    expect(replace).not.toHaveBeenCalled();
  });

  it("ignores a stale submission failure after the report changes", async () => {
    const user = userEvent.setup();
    const pending = deferred<ClaimantClaim>();
    vi.mocked(submitClaim).mockReturnValue(pending.promise);
    const { rerender } = render(
      <ClaimSubmissionClient reportId={claimQuestions.report.id} />,
    );
    await user.type(
      await screen.findByLabelText(claimQuestions.questions[0].question),
      "Blue",
    );
    await user.type(
      screen.getByLabelText(claimQuestions.questions[1].question),
      "Black",
    );
    await user.click(screen.getByRole("button", { name: "Submit claim" }));

    const nextQuestions: ClaimQuestions = {
      ...claimQuestions,
      report: {
        ...claimQuestions.report,
        id: "next/report",
        title: "Found library card",
      },
    };
    vi.mocked(getClaimQuestionsForReport).mockResolvedValue(nextQuestions);
    rerender(<ClaimSubmissionClient reportId={nextQuestions.report.id} />);
    expect(
      screen.queryByRole("heading", { name: "Claim Found student card" }),
    ).toBeNull();
    expect(screen.getByRole("status").textContent).toContain(
      "Loading ownership questions",
    );
    expect(
      await screen.findByRole("heading", { name: "Claim Found library card" }),
    ).toBeTruthy();

    await act(async () => {
      pending.reject(new Error("private stale failure"));
      try {
        await pending.promise;
      } catch {
        // The stale request is expected to reject.
      }
    });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.body.textContent).not.toContain("private stale failure");
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    ["REPORT_NOT_CLAIMABLE", 409, "This report cannot be claimed"],
    ["CLAIM_ALREADY_EXISTS", 409, "You already have an active claim"],
    ["CLAIM_FORBIDDEN", 403, "Claim access unavailable"],
  ])("maps %s to a safe replacement state", async (code, status, heading) => {
    const user = userEvent.setup();
    vi.mocked(submitClaim).mockRejectedValue(
      new ClaimBrowserError({ code, status, message: "private" }),
    );
    render(<ClaimSubmissionClient reportId={claimQuestions.report.id} />);
    await user.type(await screen.findByLabelText(claimQuestions.questions[0].question), "Blue");
    await user.type(screen.getByLabelText(claimQuestions.questions[1].question), "Black");
    await user.click(screen.getByRole("button", { name: "Submit claim" }));
    expect(await screen.findByRole("heading", { name: heading })).toBeTruthy();
    if (code !== "CLAIM_FORBIDDEN") {
      expect(screen.getByRole("status")).toBeTruthy();
    }
  });

  it("redirects when authentication expires and uses local validation copy", async () => {
    const user = userEvent.setup();
    vi.mocked(submitClaim).mockRejectedValueOnce(
      new ClaimBrowserError({ code: "VALIDATION_ERROR", status: 400, message: "private" }),
    );
    render(<ClaimSubmissionClient reportId={claimQuestions.report.id} />);
    await user.type(await screen.findByLabelText(claimQuestions.questions[0].question), "Blue");
    await user.type(screen.getByLabelText(claimQuestions.questions[1].question), "Black");
    await user.click(screen.getByRole("button", { name: "Submit claim" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Review every answer and try again.",
    );

    vi.mocked(submitClaim).mockRejectedValueOnce(
      new ClaimBrowserError({ code: "AUTHENTICATION_REQUIRED", status: 401, message: "private" }),
    );
    await user.click(screen.getByRole("button", { name: "Submit claim" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});
