// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const flagQueue = vi.fn(() => <div data-testid="flag-queue" />);

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/components/auth/auth-session-provider", () => ({ useAuthSession: vi.fn() }));
vi.mock("@/lib/moderation/browser-client", () => ({
  scanBrowserDuplicateReports: vi.fn(),
  submitBrowserReportFlag: vi.fn(),
  BrowserModerationError: class BrowserModerationError extends Error {
    constructor(readonly code: string) { super(code); }
  },
}));

vi.mock("./admin-moderation-flag-queue", () => ({
  AdminModerationFlagQueue: () => flagQueue(),
}));
vi.mock("./admin-moderation-report-list", () => ({
  AdminModerationReportList: () => <div data-testid="report-list" />,
}));

import { AdminModerationClient } from "./admin-moderation-client";
import { useRouter } from "next/navigation";
import { useAuthSession } from "@/components/auth/auth-session-provider";
import {
  BrowserModerationError,
  scanBrowserDuplicateReports,
  submitBrowserReportFlag,
} from "@/lib/moderation/browser-client";

const pair = {
  leftReport: {
    id: "a".repeat(24),
    reportType: "lost" as const,
    title: "Black laptop charger",
    occurredAt: "2026-09-25T01:00:00.000Z",
  },
  rightReport: {
    id: "b".repeat(24),
    reportType: "lost" as const,
    title: "Black USB-C charger",
    occurredAt: "2026-09-25T02:00:00.000Z",
  },
  similarity: 0.93,
  reasons: ["Same category", "Reports occurred on the same day"],
  method: "model_assisted" as const,
};
const replace = vi.fn();
const refreshSession = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue({ replace } as never);
  vi.mocked(useAuthSession).mockReturnValue({ refreshSession } as never);
  vi.mocked(scanBrowserDuplicateReports).mockResolvedValue({ pairs: [pair] });
  vi.mocked(submitBrowserReportFlag).mockResolvedValue({
    id: "c".repeat(24),
    reportId: pair.rightReport.id,
    reason: "duplicate_report",
    status: "pending",
    createdAt: "2026-09-28T01:00:00.000Z",
  });
});

afterEach(cleanup);

it("provides one moderation heading and three labelled work areas", () => {
  render(<AdminModerationClient />);
  expect(screen.getByRole("heading", { level: 1, name: "Report moderation" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "Flag queue" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "Report visibility" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "Possible duplicates" })).toBeTruthy();
  expect(screen.getByTestId("flag-queue")).toBeTruthy();
  expect(screen.getByTestId("report-list")).toBeTruthy();
  const backLink = screen.getByRole("link", {
    name: "Back to administrator overview",
  });
  const heading = screen.getByRole("heading", {
    level: 1,
    name: "Report moderation",
  });
  expect(backLink.getAttribute("href")).toBe("/admin");
  expect(
    backLink.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

it("scans without mutation and queues only after administrator confirmation", async () => {
  const user = userEvent.setup();
  render(<AdminModerationClient />);

  await user.click(screen.getByRole("button", { name: "Scan for possible duplicates" }));
  expect(await screen.findByText("AI-assisted duplicate candidates")).toBeTruthy();
  expect(screen.getByText("93% similar")).toBeTruthy();
  expect(submitBrowserReportFlag).not.toHaveBeenCalled();
  const rendersBeforeQueueing = flagQueue.mock.calls.length;

  await user.click(screen.getByRole("button", { name: "Send to moderation queue" }));
  expect(submitBrowserReportFlag).toHaveBeenCalledWith(
    pair.rightReport.id,
    {
      reason: "duplicate_report",
      details: `AI-assisted candidate paired with report ${pair.leftReport.id}`,
    },
    expect.any(AbortSignal),
  );
  expect(await screen.findByText("Candidate sent to the moderation queue.")).toBeTruthy();
  await waitFor(() => expect(flagQueue.mock.calls.length).toBeGreaterThan(rendersBeforeQueueing));
});

it("groups repeated targets while retaining all comparisons and report identities", async () => {
  const user = userEvent.setup();
  const sameTitle = "Black laptop charger";
  vi.mocked(scanBrowserDuplicateReports).mockResolvedValue({
    pairs: [
      pair,
      {
        ...pair,
        leftReport: { ...pair.leftReport, id: "c".repeat(24), title: sameTitle },
        similarity: 0.88,
        reasons: ["Shared colours: black"],
      },
      {
        ...pair,
        leftReport: { ...pair.leftReport, id: "d".repeat(24), title: sameTitle },
        similarity: 0.85,
      },
      {
        ...pair,
        leftReport: { ...pair.leftReport, id: "e".repeat(24) },
        rightReport: { ...pair.rightReport, id: "f".repeat(24) },
      },
    ],
  });
  render(<AdminModerationClient />);
  await user.click(screen.getByRole("button", { name: "Scan for possible duplicates" }));

  const targets = await screen.findByRole("list", { name: "Duplicate target reports" });
  expect(targets.children).toHaveLength(2);
  expect(screen.getByText("Report ID: bbbbbb")).toBeTruthy();
  expect(screen.getByText("Report ID: aaaaaa")).toBeTruthy();
  expect(screen.getAllByRole("link", { name: /Black laptop charger.*report ID/ })).toHaveLength(4);
  expect(screen.getByRole("link", { name: /Black laptop charger.*report ID cccccc/ }).getAttribute("href"))
    .toBe(`/reports/${"c".repeat(24)}`);
  expect(screen.getByText("Report ID: cccccc")).toBeTruthy();
  expect(screen.getAllByText("93% similar")).toHaveLength(2);
  await user.click(screen.getByText("2 other pairings"));
  expect(within(targets).getByText("88% similar")).toBeTruthy();
  expect(within(targets).getByText("Shared colours: black")).toBeTruthy();
});

it("marks every pairing for a queued target and preserves that state after rescanning", async () => {
  const user = userEvent.setup();
  vi.mocked(scanBrowserDuplicateReports).mockResolvedValue({
    pairs: [pair, { ...pair, leftReport: { ...pair.leftReport, id: "c".repeat(24) } }],
  });
  render(<AdminModerationClient />);
  await user.click(screen.getByRole("button", { name: "Scan for possible duplicates" }));
  await user.click(await screen.findByRole("button", { name: "Send to moderation queue" }));
  expect(await screen.findByRole("button", { name: "Already in moderation queue" })).toHaveProperty("disabled", true);
  await user.click(screen.getByRole("button", { name: "Scan for possible duplicates" }));
  expect(await screen.findByRole("button", { name: "Already in moderation queue" })).toHaveProperty("disabled", true);
  expect(submitBrowserReportFlag).toHaveBeenCalledTimes(1);
});

it("treats an existing pending flag as queued but leaves other failures retryable", async () => {
  const user = userEvent.setup();
  vi.mocked(submitBrowserReportFlag).mockRejectedValueOnce(new BrowserModerationError("REPORT_FLAG_ALREADY_PENDING"));
  render(<AdminModerationClient />);
  await user.click(screen.getByRole("button", { name: "Scan for possible duplicates" }));
  await user.click(await screen.findByRole("button", { name: "Send to moderation queue" }));
  expect(await screen.findByRole("button", { name: "Already in moderation queue" })).toHaveProperty("disabled", true);
  expect(screen.getByRole("status").textContent).toContain("already pending");

  vi.mocked(scanBrowserDuplicateReports).mockResolvedValue({ pairs: [{ ...pair, rightReport: { ...pair.rightReport, id: "d".repeat(24) } }] });
  await user.click(screen.getByRole("button", { name: "Scan for possible duplicates" }));
  vi.mocked(submitBrowserReportFlag).mockRejectedValueOnce(new Error("temporary"));
  await user.click(await screen.findByRole("button", { name: "Send to moderation queue" }));
  expect(await screen.findByRole("button", { name: "Send to moderation queue" })).toHaveProperty("disabled", false);
});

it.each(["AUTHENTICATION_REQUIRED", "ADMINISTRATOR_REQUIRED"] as const)(
  "clears old scan results on %s",
  async (code) => {
    const user = userEvent.setup();
    render(<AdminModerationClient />);
    await user.click(screen.getByRole("button", { name: "Scan for possible duplicates" }));
    expect(await screen.findByText("93% similar")).toBeTruthy();
    vi.mocked(scanBrowserDuplicateReports).mockRejectedValueOnce(new BrowserModerationError(code));
    await user.click(screen.getByRole("button", { name: "Scan for possible duplicates" }));
    await waitFor(() => expect(screen.queryByText("93% similar")).toBeNull());
    expect(refreshSession).toHaveBeenCalled();
    if (code === "AUTHENTICATION_REQUIRED") expect(replace).toHaveBeenCalledWith("/login");
  },
);

it("clears candidates when queue submission discovers an expired session", async () => {
  const user = userEvent.setup();
  vi.mocked(submitBrowserReportFlag).mockRejectedValueOnce(
    new BrowserModerationError("AUTHENTICATION_REQUIRED"),
  );
  render(<AdminModerationClient />);
  await user.click(screen.getByRole("button", { name: "Scan for possible duplicates" }));
  await user.click(await screen.findByRole("button", { name: "Send to moderation queue" }));
  await waitFor(() => expect(screen.queryByText("93% similar")).toBeNull());
  expect(refreshSession).toHaveBeenCalled();
  expect(replace).toHaveBeenCalledWith("/login");
});

it("labels old candidates as previous results when a rescan fails", async () => {
  const user = userEvent.setup();
  render(<AdminModerationClient />);
  await user.click(screen.getByRole("button", { name: "Scan for possible duplicates" }));
  expect(await screen.findByText("93% similar")).toBeTruthy();
  vi.mocked(scanBrowserDuplicateReports).mockRejectedValueOnce(new Error("temporary"));
  await user.click(screen.getByRole("button", { name: "Scan for possible duplicates" }));
  expect(await screen.findByRole("status")).toHaveProperty(
    "textContent",
    "Duplicate scan is temporarily unavailable. Previous results are still shown; try again.",
  );
  expect(screen.getByText("93% similar")).toBeTruthy();
});
