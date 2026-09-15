// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/lib/staff-reports/browser-client", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/staff-reports/browser-client")
  >();
  return {
    ...actual,
    getStaffReport: vi.fn(),
    verifyStaffReport: vi.fn(),
    storeStaffReport: vi.fn(),
  };
});

import { useRouter } from "next/navigation";
import {
  StaffReportBrowserError,
  getStaffReport,
  storeStaffReport,
  verifyStaffReport,
  type StaffReportDetail,
} from "@/lib/staff-reports/browser-client";

import { StaffReportDetailClient } from "./staff-report-detail-client";

const replace = vi.fn();
const reportId = "64f0123456789abcdef01234";
const actorId = "64f0123456789abcdef01235";
const pendingFound: StaffReportDetail = {
  id: reportId,
  reportType: "found",
  title: "Found campus card",
  photoUrls: [
    "/api/report-images/64f0123456789abcdef01239",
    "https://example.test/private.jpg",
  ],
  status: "open",
  moderationStatus: "visible",
  publicDescription: "Blue campus card found near the library.",
  categoryId: "64f0123456789abcdef01236",
  campusLocationId: "64f0123456789abcdef01237",
  colors: ["Blue"],
  tags: ["card"],
  occurredAt: "2026-08-28T01:00:00.000Z",
  createdAt: "2026-08-28T02:00:00.000Z",
  updatedAt: "2026-08-29T03:00:00.000Z",
  resolvedAt: null,
  handling: {
    verificationStatus: "pending",
    custodyStatus: "not_held",
    verifiedAt: null,
    storedAt: null,
    releasedAt: null,
    verifiedBy: null,
    storageLocation: null,
    updatedBy: null,
  },
};

function verifiedFound(overrides: Partial<StaffReportDetail> = {}): StaffReportDetail {
  return {
    ...pendingFound,
    ...overrides,
    handling: {
      ...pendingFound.handling,
      verificationStatus: "verified",
      verifiedAt: "2026-08-29T04:00:00.000Z",
      verifiedBy: actorId,
      updatedBy: actorId,
      ...(overrides.handling ?? {}),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue({ replace } as never);
  vi.mocked(getStaffReport).mockResolvedValue(pendingFound);
});
afterEach(cleanup);

describe("staff report detail", () => {
  it("renders controlled report and handling fields without unsafe data", async () => {
    render(<StaffReportDetailClient reportId={reportId} />);
    expect(await screen.findByRole("heading", { name: "Staff report" })).toBeTruthy();
    expect(screen.getByText(pendingFound.publicDescription)).toBeTruthy();
    expect(screen.getByText("Campus location reference")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("src")).toContain("/api/report-images/");
    expect(document.body.textContent).not.toContain("example.test");
    expect(document.body.textContent).not.toContain(actorId);
  });

  it("rejects malformed identifiers locally", async () => {
    render(<StaffReportDetailClient reportId="not-an-id" />);
    expect(await screen.findByRole("heading", { name: "Report not found" })).toBeTruthy();
    expect(getStaffReport).not.toHaveBeenCalled();
  });

  it("redirects expired sessions and presents safe access states", async () => {
    vi.mocked(getStaffReport).mockRejectedValueOnce(
      new StaffReportBrowserError("AUTHENTICATION_REQUIRED", 401, "safe"),
    );
    const view = render(<StaffReportDetailClient reportId={reportId} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));

    vi.mocked(getStaffReport).mockRejectedValueOnce(
      new StaffReportBrowserError("STAFF_REPORT_FORBIDDEN", 403, "safe"),
    );
    view.rerender(<StaffReportDetailClient reportId={`${reportId.slice(0, -1)}5`} />);
    expect(await screen.findByRole("heading", { name: "Report handling access unavailable" })).toBeTruthy();
  });

  it("renders only the action allowed by the handling state", async () => {
    render(<StaffReportDetailClient reportId={reportId} />);
    expect(await screen.findByRole("button", { name: "Verify report" })).toBeTruthy();
    expect(screen.queryByLabelText("Storage location")).toBeNull();

    cleanup();
    vi.mocked(getStaffReport).mockResolvedValue(verifiedFound());
    render(<StaffReportDetailClient reportId={reportId} />);
    expect(await screen.findByRole("button", { name: "Record item storage" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Verify report" })).toBeNull();

    cleanup();
    vi.mocked(getStaffReport).mockResolvedValue(
      verifiedFound({
        status: "resolved",
        resolvedAt: "2026-08-29T06:00:00.000Z",
      }),
    );
    render(<StaffReportDetailClient reportId={reportId} />);
    expect(await screen.findByText(/read-only/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /verify|storage/i })).toBeNull();
  });

  it("submits one verification with the current version", async () => {
    let resolve!: (report: StaffReportDetail) => void;
    vi.mocked(verifyStaffReport).mockReturnValue(
      new Promise((done) => { resolve = done; }),
    );
    const user = userEvent.setup();
    render(<StaffReportDetailClient reportId={reportId} />);
    const button = await screen.findByRole("button", { name: "Verify report" });
    await user.dblClick(button);
    expect(verifyStaffReport).toHaveBeenCalledTimes(1);
    expect(verifyStaffReport).toHaveBeenCalledWith(reportId, {
      expectedUpdatedAt: pendingFound.updatedAt,
    });
    await act(async () => resolve(verifiedFound()));
    expect(await screen.findByText("Report verification recorded.")).toBeTruthy();
  });

  it("normalises and stores a staff-only location", async () => {
    const initial = verifiedFound();
    const stored = verifiedFound({
      updatedAt: "2026-08-29T05:00:00.000Z",
      handling: {
        ...initial.handling,
        custodyStatus: "stored",
        storedAt: "2026-08-29T05:00:00.000Z",
        storageLocation: "Security desk locker 4",
      },
    });
    vi.mocked(getStaffReport).mockResolvedValue(initial);
    vi.mocked(storeStaffReport).mockResolvedValue(stored);
    const user = userEvent.setup();
    render(<StaffReportDetailClient reportId={reportId} />);
    await user.type(await screen.findByLabelText("Storage location"), "  Security   desk locker 4  ");
    await user.click(screen.getByRole("button", { name: "Record item storage" }));
    expect(storeStaffReport).toHaveBeenCalledWith(reportId, {
      expectedUpdatedAt: initial.updatedAt,
      storageLocation: "Security desk locker 4",
    });
    expect(await screen.findByText("Item storage recorded.")).toBeTruthy();
  });

  it("refreshes a changed report after a conflict and removes stale input", async () => {
    const initial = verifiedFound();
    const latest = verifiedFound({
      updatedAt: "2026-08-29T07:00:00.000Z",
      handling: {
        ...initial.handling,
        custodyStatus: "stored",
        storedAt: "2026-08-29T07:00:00.000Z",
        storageLocation: "Reception locker 2",
      },
    });
    vi.mocked(getStaffReport)
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(latest);
    vi.mocked(storeStaffReport).mockRejectedValue(
      new StaffReportBrowserError("STAFF_REPORT_STATE_CONFLICT", 409, "safe"),
    );
    const user = userEvent.setup();
    render(<StaffReportDetailClient reportId={reportId} />);
    await user.type(await screen.findByLabelText("Storage location"), "Old locker");
    await user.click(screen.getByRole("button", { name: "Record item storage" }));
    const heading = await screen.findByRole("heading", { name: "Report update needs attention" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect((screen.getByLabelText("Storage location") as HTMLInputElement).value).toBe("Reception locker 2");
    expect(getStaffReport).toHaveBeenCalledTimes(2);
  });
});
