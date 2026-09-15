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
  return { ...actual, listBrowserAdminReports: vi.fn(), moderateBrowserReport: vi.fn() };
});

import { useRouter } from "next/navigation";
import { useAuthSession } from "@/components/auth/auth-session-provider";
import {
  BrowserModerationError,
  listBrowserAdminReports,
  moderateBrowserReport,
} from "@/lib/moderation/browser-client";
import type {
  BrowserAdminReport,
  BrowserAdminReportPage,
} from "@/lib/moderation/browser-contract";

import { AdminModerationReportList } from "./admin-moderation-report-list";

const timestamp = "2026-08-29T01:00:00.000Z";
const report: BrowserAdminReport = {
  id: "a".repeat(24), reportType: "lost", title: "Black laptop charger",
  publicDescription: "A black laptop charger left near the library.",
  categoryId: "b".repeat(24), campusLocationId: "c".repeat(24),
  occurredAt: timestamp, colors: ["black"], tags: ["charger"], photoUrls: [],
  status: "open", moderationStatus: "visible",
  privacySettings: { showPhoto: true, showEventDate: true, showCampusLocation: true },
  resolvedAt: null, createdAt: timestamp, updatedAt: timestamp,
};
const page: BrowserAdminReportPage = {
  reports: [report],
  pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
};
const replace = vi.fn();
const refreshSession = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue({ replace } as never);
  vi.mocked(useAuthSession).mockReturnValue({ refreshSession } as never);
  vi.mocked(listBrowserAdminReports).mockResolvedValue(page);
  vi.mocked(moderateBrowserReport).mockResolvedValue({ ...report, moderationStatus: "hidden" });
});
afterEach(cleanup);

async function renderReady(current = page) {
  vi.mocked(listBrowserAdminReports).mockResolvedValue(current);
  render(<AdminModerationReportList />);
  await screen.findByRole("heading", { name: report.title });
}

describe("AdminModerationReportList", () => {
  it("searches on submission and applies controlled filters", async () => {
    const user = userEvent.setup();
    await renderReady();
    await user.type(screen.getByLabelText("Search reports"), "laptop charger");
    expect(listBrowserAdminReports).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(listBrowserAdminReports).toHaveBeenLastCalledWith(
      { q: "laptop charger", page: 1 }, expect.any(AbortSignal),
    ));
    await user.selectOptions(screen.getByLabelText("Visibility"), "hidden");
    await waitFor(() => expect(listBrowserAdminReports).toHaveBeenLastCalledWith(
      { q: "laptop charger", moderationStatus: "hidden", page: 1 }, expect.any(AbortSignal),
    ));
  });

  it("requires a direct hide reason and sends the exact timestamp", async () => {
    const user = userEvent.setup();
    await renderReady();
    await user.click(screen.getByRole("button", { name: "Hide report" }));
    await user.click(screen.getByRole("button", { name: "Confirm hiding" }));
    expect(screen.getByRole("alert").textContent).toContain("Choose a reason");
    expect(screen.getByLabelText("Hide reason").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("Hide reason").getAttribute("aria-describedby")).toBe(
      "report-hide-reason-error",
    );
    await user.selectOptions(screen.getByLabelText("Hide reason"), "administrative_review");
    await user.click(screen.getByRole("button", { name: "Confirm hiding" }));
    expect(moderateBrowserReport).toHaveBeenCalledWith(
      report.id,
      {
        moderationStatus: "hidden", reason: "administrative_review",
        expectedUpdatedAt: report.updatedAt, note: null,
      },
      expect.any(AbortSignal),
    );
  });

  it("restores a hidden report with the exact timestamp", async () => {
    const hidden = { ...report, moderationStatus: "hidden" as const };
    const hiddenPage = { ...page, reports: [hidden] };
    vi.mocked(moderateBrowserReport).mockResolvedValue({ ...report, moderationStatus: "visible" });
    const user = userEvent.setup();
    await renderReady(hiddenPage);
    await user.click(screen.getByRole("button", { name: "Restore report" }));
    await user.click(screen.getByRole("button", { name: "Confirm restoration" }));
    expect(moderateBrowserReport).toHaveBeenCalledWith(
      report.id,
      { moderationStatus: "visible", expectedUpdatedAt: report.updatedAt, note: null },
      expect.any(AbortSignal),
    );
  });

  it("offers reload after a moderation conflict", async () => {
    vi.mocked(moderateBrowserReport).mockRejectedValue(
      new BrowserModerationError("REPORT_MODERATION_CONFLICT", 409),
    );
    const user = userEvent.setup();
    await renderReady();
    await user.click(screen.getByRole("button", { name: "Hide report" }));
    await user.selectOptions(screen.getByLabelText("Hide reason"), "privacy_concern");
    await user.click(screen.getByRole("button", { name: "Confirm hiding" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Moderation data changed");
    await user.click(screen.getByRole("button", { name: "Reload moderation data" }));
    expect(listBrowserAdminReports).toHaveBeenCalledTimes(2);
  });

  it("renders retry and empty states", async () => {
    vi.mocked(listBrowserAdminReports)
      .mockRejectedValueOnce(new Error("private"))
      .mockResolvedValueOnce({
        reports: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
      });
    render(<AdminModerationReportList />);
    await userEvent.click(await screen.findByRole("button", { name: "Retry report list" }));
    expect(await screen.findByText("No reports match these filters.")).toBeTruthy();
  });

  it("refreshes and redirects when authentication expires", async () => {
    vi.mocked(listBrowserAdminReports).mockRejectedValue(
      new BrowserModerationError("AUTHENTICATION_REQUIRED", 401),
    );
    render(<AdminModerationReportList />);
    await waitFor(() => expect(refreshSession).toHaveBeenCalledOnce());
    expect(replace).toHaveBeenCalledWith("/login");
  });
});
