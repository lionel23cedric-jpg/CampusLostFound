// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}));
vi.mock("@/components/auth/auth-session-provider", () => ({
  useAuthSession: vi.fn(),
}));
vi.mock("@/lib/reports/browser-client", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/reports/browser-client")
  >();
  return { ...actual, getOwnReports: vi.fn() };
});

import { useRouter, useSearchParams } from "next/navigation";
import {
  type AuthSessionContextValue,
  useAuthSession,
} from "@/components/auth/auth-session-provider";
import OwnReportsPage, {
  metadata as ownReportsMetadata,
} from "@/app/reports/mine/page";
import {
  BrowserReportError,
  getOwnReports,
  type OwnerReport,
  type OwnerReportHistoryPage,
} from "@/lib/reports/browser-client";

import { OwnerReportHistory } from "./owner-report-history";

const replace = vi.fn();
const push = vi.fn();
const refreshSession = vi.fn().mockResolvedValue(undefined);

const safeUser: NonNullable<AuthSessionContextValue["user"]> = {
  id: "64b64c6f2f4d9f1a2b3c4d51",
  email: "student@example.com",
  role: "student",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Student Name",
    preferredContactMethod: "in_app",
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
};

const internalPhoto = "/api/report-images/64b64c6f2f4d9f1a2b3c4d55";
const externalPhoto = "https://images.example.test/private.jpg";

const ownerReport: OwnerReport = {
  id: "64b64c6f2f4d9f1a2b3c4d54",
  reporterId: safeUser.id,
  reportType: "found",
  title: "Black laptop bag",
  publicDescription: "Black laptop bag with a shoulder strap.",
  categoryId: "64b64c6f2f4d9f1a2b3c4d52",
  campusLocationId: "64b64c6f2f4d9f1a2b3c4d53",
  occurredAt: "2026-08-15T02:05:00.000Z",
  colors: ["Black"],
  tags: ["laptop", "bag"],
  photoUrls: [internalPhoto, externalPhoto],
  status: "draft",
  moderationStatus: "hidden",
  privacySettings: {
    showPhoto: false,
    showEventDate: false,
    showCampusLocation: false,
  },
  resolvedAt: null,
  createdAt: "2026-08-16T02:05:00.000Z",
  updatedAt: "2026-08-16T02:05:00.000Z",
};

const ownerPage: OwnerReportHistoryPage = {
  reports: [ownerReport],
  pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
};

function mockSession(overrides: Partial<AuthSessionContextValue>) {
  vi.mocked(useAuthSession).mockReturnValue({
    status: "loading",
    user: null,
    setAuthenticatedUser: vi.fn(),
    refreshSession,
    logout: vi.fn(),
    ...overrides,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("owner report history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({ replace, push } as never);
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as never);
    mockSession({ status: "authenticated", user: safeUser });
    vi.mocked(getOwnReports).mockResolvedValue(ownerPage);
  });

  afterEach(cleanup);

  it("renders the page landmark and metadata", () => {
    const { container } = render(<OwnReportsPage />);

    expect(ownReportsMetadata.title).toBe("My reports");
    expect(container.querySelector("main#main-content")).toBeTruthy();
  });

  it("shows a stable session loading state without report data", () => {
    mockSession({ status: "loading", user: null });
    render(<OwnerReportHistory />);

    expect(screen.getByRole("status").textContent).toContain(
      "Checking your account",
    );
    expect(getOwnReports).not.toHaveBeenCalled();
    expect(screen.queryByText(ownerReport.title)).toBeNull();
  });

  it("redirects an unauthenticated visitor without loading history", async () => {
    mockSession({ status: "unauthenticated", user: null });
    render(<OwnerReportHistory />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(getOwnReports).not.toHaveBeenCalled();
  });

  it("retries an unavailable session without exposing history", async () => {
    const user = userEvent.setup();
    mockSession({ status: "unavailable", user: null });
    render(<OwnerReportHistory />);

    await user.click(screen.getByRole("button", { name: "Retry session check" }));
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(getOwnReports).not.toHaveBeenCalled();
  });

  it.each(["suspended", "deactivated"] as const)(
    "keeps history unavailable to a %s account",
    (status) => {
      mockSession({
        status: "authenticated",
        user: { ...safeUser, status },
      });
      render(<OwnerReportHistory />);

      expect(
        screen.getByRole("heading", { name: "Report history unavailable" }),
      ).toBeTruthy();
      expect(getOwnReports).not.toHaveBeenCalled();
    },
  );

  it.each(["student", "staff", "administrator"] as const)(
    "loads history for an active %s",
    async (role) => {
      mockSession({
        status: "authenticated",
        user: { ...safeUser, role },
      });
      render(<OwnerReportHistory />);

      expect(
        await screen.findByRole("heading", { name: "Your report history" }),
      ).toBeTruthy();
      expect(getOwnReports).toHaveBeenCalledWith({}, expect.any(AbortSignal));
    },
  );

  it("loads URL filters and renders safe report details", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("reportType=found&status=draft&page=1") as never,
    );
    const { container } = render(<OwnerReportHistory />);

    const link = await screen.findByRole("link", { name: ownerReport.title });
    expect(getOwnReports).toHaveBeenCalledWith(
      { reportType: "found", status: "draft" },
      expect.any(AbortSignal),
    );
    expect(link.getAttribute("href")).toBe(`/reports/${ownerReport.id}`);
    const card = link.closest("article");
    expect(card).toBeTruthy();
    expect(within(card!).getByText("Found")).toBeTruthy();
    expect(within(card!).getByText("Draft")).toBeTruthy();
    expect(within(card!).getByText("Hidden by moderation")).toBeTruthy();
    expect(within(card!).getByText("2 photos")).toBeTruthy();
    expect(within(card!).getByText("15 Aug 2026")).toBeTruthy();
    expect(within(card!).getByText("16 Aug 2026")).toBeTruthy();
    expect(container.textContent).not.toContain(ownerReport.reporterId);
    expect(container.textContent).not.toMatch(
      /showPhoto|showEventDate|showCampusLocation|expectedAnswer|serialNumber/,
    );
  });

  it("embeds only a same-origin photo and reserves descriptive alt text", async () => {
    const { container } = render(<OwnerReportHistory />);

    const image = await screen.findByRole("img", {
      name: `Submitted item photo for ${ownerReport.title}`,
    });
    expect(image.getAttribute("src")).toBe(internalPhoto);
    expect(image.getAttribute("width")).toBe("160");
    expect(image.getAttribute("height")).toBe("120");
    expect(
      [...container.querySelectorAll("img")].some(
        (element) => element.getAttribute("src") === externalPhoto,
      ),
    ).toBe(false);
  });

  it("reports invalid URL state while keeping valid siblings", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("reportType=found&status=other&page=2") as never,
    );
    render(<OwnerReportHistory />);

    expect(
      await screen.findByText("Some invalid report-history filters were ignored."),
    ).toBeTruthy();
    expect(getOwnReports).toHaveBeenCalledWith(
      { reportType: "found", page: 2 },
      expect.any(AbortSignal),
    );
    expect(
      screen.getByRole("link", { name: "Use valid filters" }).getAttribute("href"),
    ).toBe("/reports/mine?reportType=found&page=2");
  });

  it("applies native filters and resets pagination", async () => {
    const user = userEvent.setup();
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("page=3") as never,
    );
    render(<OwnerReportHistory />);
    await screen.findByText(ownerReport.title);

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Report type" }),
      "lost",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Status" }),
      "closed",
    );
    await user.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(push).toHaveBeenCalledWith(
      "/reports/mine?reportType=lost&status=closed",
    );
  });

  it("shows filtered and unfiltered empty states without false deletion copy", async () => {
    vi.mocked(getOwnReports).mockResolvedValue({
      reports: [],
      pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
    });
    const { rerender } = render(<OwnerReportHistory />);

    expect(await screen.findByText("You have not submitted any reports yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Report an item" })).toBeTruthy();

    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("status=closed") as never,
    );
    rerender(<OwnerReportHistory />);

    expect(await screen.findByText("No reports match these filters.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Clear filters" }).getAttribute("href"))
      .toBe("/reports/mine");
    expect(screen.queryByText(/deleted/i)).toBeNull();
  });

  it("does not offer report creation to an empty staff history", async () => {
    mockSession({
      status: "authenticated",
      user: { ...safeUser, role: "staff" },
    });
    vi.mocked(getOwnReports).mockResolvedValue({
      reports: [],
      pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
    });
    render(<OwnerReportHistory />);

    await screen.findByText("You have not submitted any reports yet.");
    expect(screen.queryByRole("link", { name: "Report an item" })).toBeNull();
  });

  it("renders canonical previous and next pagination", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("status=open&page=2") as never,
    );
    vi.mocked(getOwnReports).mockResolvedValue({
      reports: [ownerReport],
      pagination: { page: 2, pageSize: 10, total: 25, totalPages: 3 },
    });
    render(<OwnerReportHistory />);

    await screen.findByText("Page 2 of 3");
    expect(screen.getByRole("link", { name: "Previous page" }).getAttribute("href"))
      .toBe("/reports/mine?status=open");
    expect(screen.getByRole("link", { name: "Next page" }).getAttribute("href"))
      .toBe("/reports/mine?status=open&page=3");
  });

  it("redirects safely when history authentication expires", async () => {
    vi.mocked(getOwnReports).mockRejectedValue(
      new BrowserReportError({
        code: "AUTHENTICATION_REQUIRED",
        status: 401,
        message: "Authentication required",
      }),
    );
    render(<OwnerReportHistory />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("Authentication required")).toBeNull();
  });

  it("offers a generic retry and keeps private failures hidden", async () => {
    const user = userEvent.setup();
    vi.mocked(getOwnReports)
      .mockRejectedValueOnce(new Error("private database detail"))
      .mockResolvedValueOnce(ownerPage);
    render(<OwnerReportHistory />);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "We could not load your report history.",
    );
    expect(screen.queryByText("private database detail")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Retry history" }));
    expect(await screen.findByText(ownerReport.title)).toBeTruthy();
    expect(getOwnReports).toHaveBeenCalledTimes(2);
  });

  it("ignores stale responses and aborts superseded requests", async () => {
    const first = deferred<OwnerReportHistoryPage>();
    const secondReport = { ...ownerReport, id: "second-report", title: "Blue umbrella" };
    const secondPage = { ...ownerPage, reports: [secondReport] };
    vi.mocked(getOwnReports)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(secondPage);
    const { rerender } = render(<OwnerReportHistory />);
    const firstSignal = vi.mocked(getOwnReports).mock.calls[0][1];

    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("status=open") as never,
    );
    rerender(<OwnerReportHistory />);

    expect(await screen.findByText("Blue umbrella")).toBeTruthy();
    expect(firstSignal?.aborted).toBe(true);
    first.resolve(ownerPage);
    await Promise.resolve();
    expect(screen.queryByText(ownerReport.title)).toBeNull();
  });

  it("aborts the active request on unmount", () => {
    const pending = deferred<OwnerReportHistoryPage>();
    vi.mocked(getOwnReports).mockReturnValue(pending.promise);
    const { unmount } = render(<OwnerReportHistory />);
    const signal = vi.mocked(getOwnReports).mock.calls[0][1];

    unmount();

    expect(signal?.aborted).toBe(true);
  });

  it("keeps controls touch accessible and the 320-pixel layout bounded", () => {
    const css = readFileSync(
      resolve("src/components/reports/owner-report-history.module.css"),
      "utf8",
    );

    expect(css).toMatch(/min-height:\s*44px/);
    expect(css).toMatch(/:focus-visible/);
    expect(css).toMatch(/width:\s*160px/);
    expect(css).toMatch(/height:\s*120px/);
    expect(css).toMatch(/@media\s*\(max-width:\s*20rem\)/);
    expect(css).toMatch(/min-width:\s*0/);
    expect(css).not.toMatch(/overflow-x:\s*(?:auto|scroll)/);
  });
});
