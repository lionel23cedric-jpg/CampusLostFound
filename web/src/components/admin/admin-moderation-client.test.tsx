// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const flagQueue = vi.fn(() => <div data-testid="flag-queue" />);

vi.mock("@/lib/moderation/browser-client", () => ({
  scanBrowserDuplicateReports: vi.fn(),
  submitBrowserReportFlag: vi.fn(),
}));

vi.mock("./admin-moderation-flag-queue", () => ({
  AdminModerationFlagQueue: () => flagQueue(),
}));
vi.mock("./admin-moderation-report-list", () => ({
  AdminModerationReportList: () => <div data-testid="report-list" />,
}));

import { AdminModerationClient } from "./admin-moderation-client";
import {
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

beforeEach(() => {
  vi.clearAllMocks();
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
