// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}));
vi.mock("@/components/auth/auth-session-provider", () => ({
  useAuthSession: vi.fn(),
}));
vi.mock("@/lib/reports/browser-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/reports/browser-client")
  >("@/lib/reports/browser-client");
  return {
    ...actual,
    getReports: vi.fn(),
    getReportCategories: vi.fn(),
    getReportCampusLocations: vi.fn(),
  };
});
vi.mock("./report-card", () => ({
  ReportCard: vi.fn(
    ({
      report,
      categoryName,
      campusLocationName,
    }: {
      report: MemberReport;
      categoryName: string;
      campusLocationName: string;
    }) => (
      <article aria-label={`Report card ${report.title}`}>
        <span>{report.title}</span>
        <span>{categoryName}</span>
        <span>{campusLocationName}</span>
      </article>
    ),
  ),
}));

import { useRouter, useSearchParams } from "next/navigation";

import ReportsPage, { metadata } from "@/app/reports/page";
import {
  type AuthSessionContextValue,
  useAuthSession,
} from "@/components/auth/auth-session-provider";
import {
  BrowserReportError,
  getReportCampusLocations,
  getReportCategories,
  getReports,
  type MemberReport,
  type ReportPage,
} from "@/lib/reports/browser-client";

import { ReportBrowser } from "./report-browser";
import { ReportCard } from "./report-card";

const push = vi.fn();
const replace = vi.fn();
const refreshSession = vi.fn().mockResolvedValue(undefined);
let currentSearch = new URLSearchParams();

const safeUser: NonNullable<AuthSessionContextValue["user"]> = {
  id: "user-id",
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

const memberReport: MemberReport = {
  id: "64b64c6f2f4d9f1a2b3c4d54",
  reportType: "lost",
  title: "Black laptop bag",
  publicDescription: "Black laptop bag with a shoulder strap.",
  categoryId: "64b64c6f2f4d9f1a2b3c4d52",
  campusLocationId: null,
  occurredAt: null,
  colors: ["black"],
  tags: ["laptop", "bag"],
  photoUrls: [],
  status: "open",
  resolvedAt: null,
  createdAt: "2026-08-15T02:05:00.000Z",
  updatedAt: "2026-08-15T02:05:00.000Z",
  isOwner: false,
};

const categories = [
  { id: memberReport.categoryId, name: "Electronics", description: null },
];
const campusLocations = [
  {
    id: "64b64c6f2f4d9f1a2b3c4d53",
    campusName: "Auckland",
    locationName: "Library",
    description: null,
  },
];
const readyPage: ReportPage = {
  reports: [memberReport],
  pagination: { page: 1, pageSize: 12, total: 1, totalPages: 1 },
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

function mockAuthenticatedSession(
  user: NonNullable<AuthSessionContextValue["user"]> = safeUser,
) {
  mockSession({ status: "authenticated", user });
}

function mockReadyResponses(page: ReportPage = readyPage) {
  vi.mocked(getReports).mockResolvedValue(page);
  vi.mocked(getReportCategories).mockResolvedValue(categories);
  vi.mocked(getReportCampusLocations).mockResolvedValue(campusLocations);
}

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
  currentSearch = new URLSearchParams();
  vi.mocked(useRouter).mockReturnValue({ push, replace } as never);
  vi.mocked(useSearchParams).mockImplementation(() => currentSearch as never);
  mockAuthenticatedSession();
  mockReadyResponses();
});

afterEach(cleanup);

describe("ReportBrowser route and session boundary", () => {
  it("provides route metadata, main landmark, Suspense fallback and client", async () => {
    expect(metadata.title).toBe("Browse reports");
    const routeSource = readFileSync(resolve("src/app/reports/page.tsx"), "utf8");
    expect(routeSource).toContain('<main id="main-content">');
    expect(routeSource).toContain("<Suspense");
    expect(routeSource).toContain("Loading report search");

    const { container } = render(<ReportsPage />);
    expect(container.querySelector("main#main-content")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Find an item" })).toBeTruthy();
  });

  it("waits for the session without starting report requests", () => {
    mockSession({ status: "loading", user: null });
    render(<ReportBrowser />);

    expect(screen.getByRole("status").textContent).toContain("Checking your account");
    expect(getReports).not.toHaveBeenCalled();
    expect(getReportCategories).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated visitors before starting requests", async () => {
    mockSession({ status: "unauthenticated", user: null });
    render(<ReportBrowser />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(getReports).not.toHaveBeenCalled();
  });

  it("offers a retry when the session service is unavailable", async () => {
    const user = userEvent.setup();
    mockSession({ status: "unavailable", user: null });
    render(<ReportBrowser />);

    await user.click(screen.getByRole("button", { name: "Retry session check" }));
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(getReports).not.toHaveBeenCalled();
  });

  it.each(["student", "staff", "administrator"] as const)(
    "allows an active %s to browse",
    async (role) => {
      mockAuthenticatedSession({ ...safeUser, role });
      render(<ReportBrowser />);
      expect(await screen.findByText(memberReport.title)).toBeTruthy();
      expect(getReports).toHaveBeenCalledWith({});
    },
  );

  it("blocks an inactive account without starting requests", () => {
    mockAuthenticatedSession({ ...safeUser, status: "suspended" });
    render(<ReportBrowser />);
    expect(screen.getByRole("alert").textContent).toContain("Report browsing unavailable");
    expect(getReports).not.toHaveBeenCalled();
  });
});

describe("ReportBrowser loading and errors", () => {
  it("starts reports, categories and locations in parallel after authentication", async () => {
    const reports = deferred<ReportPage>();
    const categoryRequest = deferred<typeof categories>();
    const locationsRequest = deferred<typeof campusLocations>();
    vi.mocked(getReports).mockReturnValue(reports.promise);
    vi.mocked(getReportCategories).mockReturnValue(categoryRequest.promise);
    vi.mocked(getReportCampusLocations).mockReturnValue(locationsRequest.promise);

    render(<ReportBrowser />);
    await waitFor(() => {
      expect(getReports).toHaveBeenCalledOnce();
      expect(getReportCategories).toHaveBeenCalledOnce();
      expect(getReportCampusLocations).toHaveBeenCalledOnce();
    });
    expect(screen.getByRole("status").textContent).toContain("Loading reports");

    await act(async () => {
      reports.resolve(readyPage);
      categoryRequest.resolve(categories);
      locationsRequest.resolve(campusLocations);
    });
  });

  it("retries list and reference failures independently", async () => {
    const user = userEvent.setup();
    vi.mocked(getReports).mockRejectedValueOnce(new Error("list failed"));
    vi.mocked(getReportCategories).mockRejectedValueOnce(new Error("labels failed"));
    render(<ReportBrowser />);

    await screen.findByRole("button", { name: "Retry reports" });
    expect(screen.getByRole("button", { name: "Retry report labels" })).toBeTruthy();
    expect(screen.getByLabelText("Report type")).toBeTruthy();

    mockReadyResponses();
    await user.click(screen.getByRole("button", { name: "Retry reports" }));
    expect(await screen.findByText(memberReport.title)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry report labels" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Retry report labels" }));
    expect(await screen.findByRole("option", { name: "Electronics" })).toBeTruthy();
  });

  it("redirects on authentication loss and shows one account alert on forbidden access", async () => {
    vi.mocked(getReports).mockRejectedValueOnce(
      new BrowserReportError({ code: "AUTHENTICATION_REQUIRED", status: 401, message: "Sign in" }),
    );
    render(<ReportBrowser />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    cleanup();

    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({ push, replace } as never);
    vi.mocked(useSearchParams).mockImplementation(() => currentSearch as never);
    mockAuthenticatedSession();
    vi.mocked(getReports).mockReturnValue(deferred<ReportPage>().promise);
    vi.mocked(getReportCategories).mockRejectedValueOnce(
      new BrowserReportError({ code: "ACCOUNT_UNAVAILABLE", status: 403, message: "Unavailable" }),
    );
    vi.mocked(getReportCampusLocations).mockResolvedValue(campusLocations);
    render(<ReportBrowser />);

    const alerts = await screen.findAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].textContent).toContain("Report browsing unavailable");
  });
});

describe("ReportBrowser filters, results and pagination", () => {
  it("submits validated filters to a canonical URL and resets the page", async () => {
    const user = userEvent.setup();
    currentSearch = new URLSearchParams("page=3");
    render(<ReportBrowser />);
    await screen.findByText(memberReport.title);

    await user.type(screen.getByLabelText("Keyword"), "laptop bag");
    await user.selectOptions(screen.getByLabelText("Report type"), "lost");
    await user.click(screen.getByRole("button", { name: "Search reports" }));

    expect(push).toHaveBeenCalledWith("/reports?q=laptop+bag&reportType=lost");
  });

  it("keeps URL category and location filters selected while labels load and after they arrive", async () => {
    const user = userEvent.setup();
    const categoryRequest = deferred<typeof categories>();
    const locationsRequest = deferred<typeof campusLocations>();
    currentSearch = new URLSearchParams(
      `categoryId=${memberReport.categoryId}&campusLocationId=${campusLocations[0].id}`,
    );
    vi.mocked(getReportCategories).mockReturnValue(categoryRequest.promise);
    vi.mocked(getReportCampusLocations).mockReturnValue(locationsRequest.promise);
    render(<ReportBrowser />);
    await screen.findByText(memberReport.title);

    const categorySelect = screen.getByLabelText("Category") as HTMLSelectElement;
    const locationSelect = screen.getByLabelText("Campus location") as HTMLSelectElement;
    expect(categorySelect.value).toBe(memberReport.categoryId);
    expect(locationSelect.value).toBe(campusLocations[0].id);
    expect(screen.queryByText("Category unavailable")).toBeNull();
    expect(screen.queryByText("Campus location unavailable")).toBeNull();

    await act(async () => {
      categoryRequest.resolve(categories);
      locationsRequest.resolve(campusLocations);
    });
    expect(categorySelect.value).toBe(memberReport.categoryId);
    expect(locationSelect.value).toBe(campusLocations[0].id);

    await user.click(screen.getByRole("button", { name: "Search reports" }));
    expect(push).toHaveBeenCalledWith(
      `/reports?categoryId=${memberReport.categoryId}&campusLocationId=${campusLocations[0].id}`,
    );
  });

  it("exposes the filter heading as the search landmark name", async () => {
    render(<ReportBrowser />);
    expect(await screen.findByRole("search", { name: "Filter reports" })).toBeTruthy();
  });

  it("focuses a linked validation summary and does not navigate invalid values", async () => {
    const user = userEvent.setup();
    render(<ReportBrowser />);
    await screen.findByText(memberReport.title);
    await user.type(screen.getByLabelText("Keyword"), "x");
    await user.type(screen.getByLabelText("Occurred from"), "2026-08-20");
    await user.type(screen.getByLabelText("Occurred to"), "2026-08-19");
    await user.click(screen.getByRole("button", { name: "Search reports" }));

    const summary = screen.getByRole("heading", { name: "Check your search" });
    expect(document.activeElement).toBe(summary);
    expect(screen.getByLabelText("Keyword").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("Keyword").getAttribute("aria-describedby")).toBe("q-error");
    expect(push).not.toHaveBeenCalled();
  });

  it("ignores and announces invalid URL values without sending them to the API", async () => {
    currentSearch = new URLSearchParams("q=x&page=0&unknown=private");
    render(<ReportBrowser />);

    expect(await screen.findByText("Some invalid search filters were ignored.")).toBeTruthy();
    expect(getReports).toHaveBeenCalledWith({});
    expect(document.body.textContent).not.toContain("private");
  });

  it("distinguishes a truly empty noticeboard from filtered empty results", async () => {
    vi.mocked(getReports).mockResolvedValue({
      reports: [],
      pagination: { page: 1, pageSize: 12, total: 0, totalPages: 0 },
    });
    const { rerender } = render(<ReportBrowser />);
    expect(await screen.findByText("No reports have been shared yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Report an item" }).getAttribute("href")).toBe("/reports/new");

    currentSearch = new URLSearchParams("q=laptop");
    rerender(<ReportBrowser />);
    expect(await screen.findByText("No reports match these filters.")).toBeTruthy();
    expect(
      screen
        .getAllByRole("link", { name: "Clear filters" })
        .every((link) => link.getAttribute("href") === "/reports"),
    ).toBe(true);
  });

  it("maps every result to safe reference labels and fallbacks", async () => {
    const missingReferenceReport = {
      ...memberReport,
      id: "another-report",
      title: "Blue umbrella",
      categoryId: "missing-category",
      campusLocationId: "missing-location",
    };
    vi.mocked(getReports).mockResolvedValue({
      reports: [memberReport, missingReferenceReport],
      pagination: { page: 1, pageSize: 12, total: 2, totalPages: 1 },
    });
    render(<ReportBrowser />);

    expect(await screen.findByText("Blue umbrella")).toBeTruthy();
    expect(ReportCard).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText("Electronics")).toHaveLength(2);
    expect(screen.getByText("Category unavailable")).toBeTruthy();
    expect(screen.getByText("Campus location unavailable")).toBeTruthy();
    expect(document.body.textContent).not.toContain(memberReport.id);
  });

  it("preserves filters in previous and next links with a text page status", async () => {
    currentSearch = new URLSearchParams("q=laptop&page=2");
    vi.mocked(getReports).mockResolvedValue({
      reports: [memberReport],
      pagination: { page: 2, pageSize: 12, total: 30, totalPages: 3 },
    });
    render(<ReportBrowser />);

    expect(await screen.findByText("Page 2 of 3")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Previous" }).getAttribute("href")).toBe("/reports?q=laptop");
    expect(screen.getByRole("link", { name: "Next" }).getAttribute("href")).toBe("/reports?q=laptop&page=3");
  });

  it("replaces an out-of-range page once with the authoritative final page", async () => {
    currentSearch = new URLSearchParams("q=laptop&page=8");
    vi.mocked(getReports).mockResolvedValue({
      reports: [],
      pagination: { page: 8, pageSize: 12, total: 14, totalPages: 2 },
    });
    const { rerender } = render(<ReportBrowser />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/reports?q=laptop&page=2"));
    rerender(<ReportBrowser />);
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("corrects the same out-of-range URL again after navigating away and back", async () => {
    currentSearch = new URLSearchParams("q=laptop&page=8");
    vi.mocked(getReports).mockImplementation(async (request) =>
      request.page === 8
        ? {
            reports: [],
            pagination: { page: 8, pageSize: 12, total: 14, totalPages: 2 },
          }
        : readyPage,
    );
    const { rerender } = render(<ReportBrowser />);
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));

    currentSearch = new URLSearchParams("q=away");
    rerender(<ReportBrowser />);
    await waitFor(() => expect(getReports).toHaveBeenCalledWith({ q: "away" }));

    currentSearch = new URLSearchParams("q=laptop&page=8");
    rerender(<ReportBrowser />);
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(2));
    expect(replace).toHaveBeenLastCalledWith("/reports?q=laptop&page=2");
  });

  it("focuses results after user navigation but not initial load or retry", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ReportBrowser />);
    await screen.findByText(memberReport.title);
    const heading = screen.getByRole("heading", { name: "1 report" });
    expect(document.activeElement).not.toBe(heading);

    await user.type(screen.getByLabelText("Keyword"), "laptop");
    await user.click(screen.getByRole("button", { name: "Search reports" }));
    currentSearch = new URLSearchParams("q=laptop");
    rerender(<ReportBrowser />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "1 report" })));
  });

  it("prevents an old query response from overwriting the current result", async () => {
    const first = deferred<ReportPage>();
    const newReport = { ...memberReport, id: "new-report", title: "Current result" };
    vi.mocked(getReports)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({
        reports: [newReport],
        pagination: { page: 1, pageSize: 12, total: 1, totalPages: 1 },
      });
    const { rerender } = render(<ReportBrowser />);
    await waitFor(() => expect(getReports).toHaveBeenCalledOnce());

    currentSearch = new URLSearchParams("q=current");
    rerender(<ReportBrowser />);
    expect(await screen.findByText("Current result")).toBeTruthy();
    await act(async () => first.resolve(readyPage));
    expect(screen.queryByText(memberReport.title)).toBeNull();
  });

  it("invalidates the old request during query cleanup before the new timer starts", async () => {
    const first = deferred<ReportPage>();
    const second = deferred<ReportPage>();
    const newReport = { ...memberReport, id: "new-report", title: "Current result" };
    vi.mocked(getReports)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { rerender } = render(<ReportBrowser />);
    await waitFor(() => expect(getReports).toHaveBeenCalledOnce());

    currentSearch = new URLSearchParams("q=current");
    rerender(<ReportBrowser />);
    await act(async () => first.resolve(readyPage));
    expect(screen.queryByText(memberReport.title)).toBeNull();

    await waitFor(() => expect(getReports).toHaveBeenCalledTimes(2));
    await act(async () =>
      second.resolve({
        reports: [newReport],
        pagination: { page: 1, pageSize: 12, total: 1, totalPages: 1 },
      }),
    );
    expect(await screen.findByText("Current result")).toBeTruthy();
  });

  it("prevents a previous account response from entering the next account", async () => {
    const first = deferred<ReportPage>();
    const secondReport = { ...memberReport, id: "staff-report", title: "Staff result" };
    vi.mocked(getReports)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({
        reports: [secondReport],
        pagination: { page: 1, pageSize: 12, total: 1, totalPages: 1 },
      });
    const { rerender } = render(<ReportBrowser />);
    await waitFor(() => expect(getReports).toHaveBeenCalledOnce());

    mockAuthenticatedSession({ ...safeUser, id: "staff-id", role: "staff" });
    rerender(<ReportBrowser />);
    expect(await screen.findByText("Staff result")).toBeTruthy();
    await act(async () => first.resolve(readyPage));
    expect(screen.queryByText(memberReport.title)).toBeNull();
  });

  it("keeps the 44-pixel controls and 320-pixel stacked layout contract", () => {
    const css = readFileSync(resolve("src/components/reports/report-browsing.module.css"), "utf8");
    expect(css).toMatch(/\.workspace\s*\{[^}]*grid-template-columns:\s*minmax\(14rem, 18rem\) minmax\(0, 1fr\)/);
    expect(css.slice(css.indexOf("@media (max-width: 48rem)"))).toMatch(/\.workspace\s*\{[^}]*grid-template-columns:\s*1fr/);
    expect(css).toMatch(/\.filters\s+(?:input|select)[^{]*\{[^}]*min-height:\s*44px/);
    expect(css).toContain("@media (max-width: 20rem)");
    expect(css).not.toMatch(/gradient\(/i);
  });
});
