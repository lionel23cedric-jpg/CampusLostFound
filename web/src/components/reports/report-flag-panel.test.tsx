// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/components/auth/auth-session-provider", () => ({
  useAuthSession: vi.fn(),
}));
vi.mock("@/lib/moderation/browser-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/moderation/browser-client")
  >("@/lib/moderation/browser-client");
  return { ...actual, submitBrowserReportFlag: vi.fn() };
});

import { useRouter } from "next/navigation";

import { useAuthSession } from "@/components/auth/auth-session-provider";
import {
  BrowserModerationError,
  submitBrowserReportFlag,
} from "@/lib/moderation/browser-client";

import { ReportFlagPanel } from "./report-flag-panel";

const reportId = "a".repeat(24);
const replace = vi.fn();
const refreshSession = vi.fn().mockResolvedValue(undefined);
const receipt = {
  id: "b".repeat(24),
  reportId,
  reason: "privacy_concern" as const,
  status: "pending" as const,
  createdAt: "2026-08-29T01:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue({ replace } as never);
  vi.mocked(useAuthSession).mockReturnValue({ refreshSession } as never);
  vi.mocked(submitBrowserReportFlag).mockResolvedValue(receipt);
});

afterEach(cleanup);

describe("ReportFlagPanel", () => {
  it("submits a controlled privacy concern", async () => {
    const user = userEvent.setup();
    render(<ReportFlagPanel reportId={reportId} />);

    await user.click(screen.getByRole("button", { name: "Report this listing" }));
    await user.selectOptions(screen.getByLabelText("Reason"), "privacy_concern");
    await user.type(
      screen.getByLabelText("Additional details (optional)"),
      "The description contains private contact details.",
    );
    await user.click(screen.getByRole("button", { name: "Submit report" }));

    expect(submitBrowserReportFlag).toHaveBeenCalledWith(
      reportId,
      {
        reason: "privacy_concern",
        details: "The description contains private contact details.",
      },
      expect.any(AbortSignal),
    );
    expect((await screen.findByRole("status")).textContent).toContain(
      "Your concern has been sent for administrator review",
    );
  });

  it("requires a reason and details for another concern", async () => {
    const user = userEvent.setup();
    render(<ReportFlagPanel reportId={reportId} />);
    await user.click(screen.getByRole("button", { name: "Report this listing" }));
    await user.click(screen.getByRole("button", { name: "Submit report" }));
    expect(screen.getByRole("alert").textContent).toContain("Choose a reason");

    await user.selectOptions(screen.getByLabelText("Reason"), "other");
    await user.click(screen.getByRole("button", { name: "Submit report" }));
    expect(screen.getByRole("alert").textContent).toContain(
      "Add details for another concern",
    );
    expect(submitBrowserReportFlag).not.toHaveBeenCalled();
  });

  it("cancels and resets the form", async () => {
    const user = userEvent.setup();
    render(<ReportFlagPanel reportId={reportId} />);
    await user.click(screen.getByRole("button", { name: "Report this listing" }));
    await user.selectOptions(screen.getByLabelText("Reason"), "suspected_fraud");
    await user.type(screen.getByLabelText("Additional details (optional)"), "Text");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByLabelText("Reason")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Report this listing" }));
    expect((screen.getByLabelText("Reason") as HTMLSelectElement).value).toBe("");
    expect(
      (screen.getByLabelText("Additional details (optional)") as HTMLTextAreaElement)
        .value,
    ).toBe("");
  });

  it("locks submission and enforces the 500-character browser limit", async () => {
    const pending = new Promise<typeof receipt>(() => undefined);
    vi.mocked(submitBrowserReportFlag).mockReturnValue(pending);
    const user = userEvent.setup();
    render(<ReportFlagPanel reportId={reportId} />);
    await user.click(screen.getByRole("button", { name: "Report this listing" }));
    await user.selectOptions(screen.getByLabelText("Reason"), "privacy_concern");
    const details = screen.getByLabelText("Additional details (optional)");
    expect(details.getAttribute("maxlength")).toBe("500");
    await user.click(screen.getByRole("button", { name: "Submit report" }));
    expect(
      (screen.getByRole("button", { name: "Submitting report" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("shows safe duplicate and retryable failure states", async () => {
    vi.mocked(submitBrowserReportFlag)
      .mockRejectedValueOnce(
        new BrowserModerationError("REPORT_FLAG_ALREADY_PENDING", 409),
      )
      .mockRejectedValueOnce(
        new BrowserModerationError("REPORT_MODERATION_FAILED", 500),
      );
    const user = userEvent.setup();
    render(<ReportFlagPanel reportId={reportId} />);
    await user.click(screen.getByRole("button", { name: "Report this listing" }));
    await user.selectOptions(screen.getByLabelText("Reason"), "duplicate_report");
    await user.click(screen.getByRole("button", { name: "Submit report" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "already awaiting administrator review",
    );
    await user.click(screen.getByRole("button", { name: "Submit report" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "We could not send your concern",
    );
  });

  it("refreshes and redirects after authentication expiry", async () => {
    vi.mocked(submitBrowserReportFlag).mockRejectedValue(
      new BrowserModerationError("AUTHENTICATION_REQUIRED", 401),
    );
    const user = userEvent.setup();
    render(<ReportFlagPanel reportId={reportId} />);
    await user.click(screen.getByRole("button", { name: "Report this listing" }));
    await user.selectOptions(screen.getByLabelText("Reason"), "privacy_concern");
    await user.click(screen.getByRole("button", { name: "Submit report" }));
    await waitFor(() => expect(refreshSession).toHaveBeenCalledOnce());
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("aborts an in-flight request when unmounted", async () => {
    let signal: AbortSignal | undefined;
    vi.mocked(submitBrowserReportFlag).mockImplementation(
      async (_reportId, _input, nextSignal) => {
        signal = nextSignal;
        return new Promise<typeof receipt>(() => undefined);
      },
    );
    const user = userEvent.setup();
    const view = render(<ReportFlagPanel reportId={reportId} />);
    await user.click(screen.getByRole("button", { name: "Report this listing" }));
    await user.selectOptions(screen.getByLabelText("Reason"), "privacy_concern");
    await user.click(screen.getByRole("button", { name: "Submit report" }));
    view.unmount();
    expect(signal?.aborted).toBe(true);
  });
});
