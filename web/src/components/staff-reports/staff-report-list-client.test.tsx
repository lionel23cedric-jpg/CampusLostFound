// @vitest-environment jsdom

import fs from "node:fs";
import path from "node:path";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}));
vi.mock("@/lib/staff-reports/browser-client", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/staff-reports/browser-client")
  >();
  return { ...actual, getStaffReports: vi.fn() };
});

import { useRouter, useSearchParams } from "next/navigation";
import {
  StaffReportBrowserError,
  getStaffReports,
  type StaffReportPage,
} from "@/lib/staff-reports/browser-client";

import { StaffReportListClient } from "./staff-report-list-client";

const push = vi.fn();
const replace = vi.fn();
const report = {
  id: "64f0123456789abcdef01234",
  reportType: "found" as const,
  title: "Found campus card",
  photoUrls: [
    "/api/report-images/64f0123456789abcdef01239",
    "https://example.test/external.jpg",
  ],
  status: "open" as const,
  moderationStatus: "visible" as const,
  occurredAt: "2026-08-28T01:00:00.000Z",
  createdAt: "2026-08-28T02:00:00.000Z",
  updatedAt: "2026-08-29T03:00:00.000Z",
  handling: {
    verificationStatus: "pending" as const,
    custodyStatus: "not_held" as const,
    verifiedAt: null,
    storedAt: null,
    releasedAt: null,
  },
};
const page: StaffReportPage = {
  reports: [report],
  pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function setSearch(query = "") {
  vi.mocked(useSearchParams).mockReturnValue(
    new URLSearchParams(query) as never,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue({ push, replace } as never);
  setSearch();
  vi.mocked(getStaffReports).mockResolvedValue(page);
});
afterEach(cleanup);

describe("staff report handling queue", () => {
  it("loads the active pending queue and renders safe semantic rows", async () => {
    render(<StaffReportListClient />);
    expect(screen.getByRole("heading", { name: "Report handling" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/loading/i);

    await screen.findByRole("list");
    expect(getStaffReports).toHaveBeenCalledWith(
      { verificationStatus: "pending" },
      expect.any(AbortSignal),
    );
    expect(screen.getAllByRole("combobox")).toHaveLength(4);
    expect(screen.getByRole("link", { name: /open found campus card/i }).getAttribute("href")).toBe(
      `/staff/reports/${report.id}`,
    );
    expect(screen.getByText("Lifecycle: Open")).toBeTruthy();
    expect(screen.getByText("Verification: Pending")).toBeTruthy();
    expect(screen.getByText("Custody: Not held")).toBeTruthy();
    const image = screen.getByRole("img", { name: "Found campus card" });
    expect(image.getAttribute("src")).toContain("/api/report-images/");
    expect(document.body.textContent).not.toContain("example.test");
    expect(document.body.textContent).not.toMatch(/storageLocation|verifiedBy|updatedBy/);
  });

  it("applies four filters at page one and clears to the canonical URL", async () => {
    const user = userEvent.setup();
    setSearch("page=4");
    vi.mocked(getStaffReports).mockResolvedValue({
      reports: [report],
      pagination: { page: 4, pageSize: 10, total: 31, totalPages: 4 },
    });
    render(<StaffReportListClient />);
    await screen.findByRole("list");

    await user.selectOptions(screen.getByLabelText("Report type"), "found");
    await user.selectOptions(screen.getByLabelText("Lifecycle"), "resolved");
    await user.selectOptions(screen.getByLabelText("Verification"), "verified");
    await user.selectOptions(screen.getByLabelText("Custody"), "stored");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(push).toHaveBeenCalledWith(
      "/staff/reports?reportType=found&reportStatus=resolved&verificationStatus=verified&custodyStatus=stored",
    );

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(push).toHaveBeenCalledWith("/staff/reports");
  });

  it("announces and canonicalises invalid URL values", async () => {
    setSearch("reportType=bad&page=2&unknown=value");
    render(<StaffReportListClient />);
    expect(await screen.findByText(/invalid report filters were ignored/i)).toBeTruthy();
    expect(replace).toHaveBeenCalledWith("/staff/reports?page=2");
  });

  it("does not render stale rows while a replacement request is loading", async () => {
    const second = deferred<StaffReportPage>();
    vi.mocked(getStaffReports)
      .mockResolvedValueOnce(page)
      .mockReturnValueOnce(second.promise);
    const view = render(<StaffReportListClient />);
    await screen.findByRole("list");

    setSearch("verificationStatus=verified");
    view.rerender(<StaffReportListClient />);
    await waitFor(() => expect(getStaffReports).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(report.title)).toBeNull();
    await act(async () => second.resolve({ ...page, reports: [] }));
  });

  it("redirects expired sessions and shows a safe forbidden state", async () => {
    vi.mocked(getStaffReports).mockRejectedValueOnce(
      new StaffReportBrowserError("AUTHENTICATION_REQUIRED", 401, "safe"),
    );
    const view = render(<StaffReportListClient />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));

    vi.mocked(getStaffReports).mockRejectedValueOnce(
      new StaffReportBrowserError("STAFF_REPORT_FORBIDDEN", 403, "safe"),
    );
    setSearch("page=2");
    view.rerender(<StaffReportListClient />);
    expect(
      await screen.findByRole("heading", { name: "Report handling access unavailable" }),
    ).toBeTruthy();
  });

  it("supports retry, empty copy and bounded pagination", async () => {
    const user = userEvent.setup();
    vi.mocked(getStaffReports)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        reports: [],
        pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
      });
    render(<StaffReportListClient />);
    await user.click(await screen.findByRole("button", { name: "Retry reports" }));
    expect(await screen.findByText("No reports are waiting for verification")).toBeTruthy();

    cleanup();
    setSearch("verificationStatus=verified&page=2");
    vi.mocked(getStaffReports).mockResolvedValue({
      reports: [report],
      pagination: { page: 2, pageSize: 10, total: 21, totalPages: 3 },
    });
    render(<StaffReportListClient />);
    expect(await screen.findByRole("link", { name: "Previous page" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Next page" })).toBeTruthy();
  });

  it("keeps the 320-pixel layout and controls accessible", () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), "src/components/staff-reports/staff-report-handling.module.css"),
      "utf8",
    );
    expect(css).toMatch(/min-height:\s*44px/);
    expect(css).toMatch(/min-width:\s*0/);
    expect(css).toMatch(/@media\s*\(max-width:\s*20rem\)/);
    expect(css).toMatch(/aspect-ratio:/);
    expect(css).toMatch(/focus-visible/);
    expect(css).not.toMatch(/overflow-x:\s*auto/);
  });
});
