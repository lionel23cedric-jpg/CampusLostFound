// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/components/auth/auth-session-provider", () => ({ useAuthSession: vi.fn() }));
vi.mock("@/lib/moderation/browser-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/moderation/browser-client")>(
    "@/lib/moderation/browser-client",
  );
  return {
    ...actual,
    listBrowserAdminReportFlags: vi.fn(),
    decideBrowserReportFlag: vi.fn(),
  };
});

import { useRouter } from "next/navigation";
import { useAuthSession } from "@/components/auth/auth-session-provider";
import {
  BrowserModerationError,
  decideBrowserReportFlag,
  listBrowserAdminReportFlags,
} from "@/lib/moderation/browser-client";
import type { BrowserAdminReportFlagPage } from "@/lib/moderation/browser-contract";

import { AdminModerationFlagQueue } from "./admin-moderation-flag-queue";

const timestamp = "2026-08-29T01:00:00.000Z";
const report = {
  id: "a".repeat(24), reportType: "lost", title: "Black laptop charger",
  publicDescription: "A black laptop charger left near the library.",
  categoryId: "b".repeat(24), campusLocationId: "c".repeat(24),
  occurredAt: timestamp, colors: ["black"], tags: ["charger"], photoUrls: [],
  status: "open", moderationStatus: "visible",
  privacySettings: { showPhoto: true, showEventDate: true, showCampusLocation: true },
  resolvedAt: null, createdAt: timestamp, updatedAt: timestamp,
} as const;
const flag = {
  id: "d".repeat(24), reason: "privacy_concern", details: "Contains a phone number.",
  status: "pending", reviewedAt: null, resolutionNote: null,
  createdAt: timestamp, updatedAt: timestamp, report,
} as const;
const page: BrowserAdminReportFlagPage = {
  flags: [flag],
  pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
};
const replace = vi.fn();
const refreshSession = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue({ replace } as never);
  vi.mocked(useAuthSession).mockReturnValue({ refreshSession } as never);
  vi.mocked(listBrowserAdminReportFlags).mockResolvedValue(page);
  vi.mocked(decideBrowserReportFlag).mockResolvedValue({ flag, report });
});
afterEach(cleanup);

async function renderReady() {
  render(<AdminModerationFlagQueue />);
  await screen.findByRole("heading", { name: report.title });
}

describe("AdminModerationFlagQueue", () => {
  it("loads pending flags and applies controlled filters", async () => {
    const user = userEvent.setup();
    await renderReady();
    expect(listBrowserAdminReportFlags).toHaveBeenLastCalledWith(
      { status: "pending", page: 1 }, expect.any(AbortSignal),
    );
    await user.selectOptions(screen.getByLabelText("Flag reason"), "duplicate_report");
    await waitFor(() => expect(listBrowserAdminReportFlags).toHaveBeenLastCalledWith(
      { status: "pending", reason: "duplicate_report", page: 1 }, expect.any(AbortSignal),
    ));
  });

  it("dismisses with the exact current flag timestamp", async () => {
    const user = userEvent.setup();
    await renderReady();
    await user.click(screen.getByRole("button", { name: "Dismiss concern" }));
    await user.click(screen.getByRole("button", { name: "Confirm dismissal" }));
    expect(decideBrowserReportFlag).toHaveBeenCalledWith(
      flag.id,
      { decision: "dismiss", expectedFlagUpdatedAt: flag.updatedAt, note: null },
      expect.any(AbortSignal),
    );
  });

  it("hides from a flag with both exact timestamps", async () => {
    const user = userEvent.setup();
    await renderReady();
    await user.click(screen.getByRole("button", { name: "Hide report" }));
    await user.type(screen.getByLabelText("Internal note (optional)"), "Pending review");
    await user.click(screen.getByRole("button", { name: "Confirm hiding" }));
    expect(decideBrowserReportFlag).toHaveBeenCalledWith(
      flag.id,
      {
        decision: "hide_report", expectedFlagUpdatedAt: flag.updatedAt,
        expectedReportUpdatedAt: report.updatedAt, note: "Pending review",
      },
      expect.any(AbortSignal),
    );
  });

  it("announces stale data and offers a reload", async () => {
    vi.mocked(decideBrowserReportFlag).mockRejectedValue(
      new BrowserModerationError("REPORT_FLAG_STATE_CONFLICT", 409),
    );
    const user = userEvent.setup();
    await renderReady();
    await user.click(screen.getByRole("button", { name: "Dismiss concern" }));
    await user.click(screen.getByRole("button", { name: "Confirm dismissal" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Moderation data changed",
    );
    const reload = screen.getByRole("button", { name: "Reload moderation data" });
    await user.click(reload);
    expect(listBrowserAdminReportFlags).toHaveBeenCalledTimes(2);
  });

  it("renders empty and retryable load states", async () => {
    vi.mocked(listBrowserAdminReportFlags)
      .mockRejectedValueOnce(new Error("private"))
      .mockResolvedValueOnce({
        flags: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
      });
    render(<AdminModerationFlagQueue />);
    const retry = await screen.findByRole("button", { name: "Retry flag queue" });
    await userEvent.click(retry);
    expect(await screen.findByText("No flags match these filters.")).toBeTruthy();
  });

  it("refreshes and redirects when authentication expires", async () => {
    vi.mocked(listBrowserAdminReportFlags).mockRejectedValue(
      new BrowserModerationError("AUTHENTICATION_REQUIRED", 401),
    );
    render(<AdminModerationFlagQueue />);
    await waitFor(() => expect(refreshSession).toHaveBeenCalledOnce());
    expect(replace).toHaveBeenCalledWith("/login");
  });
});
