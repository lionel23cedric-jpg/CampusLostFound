// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/components/auth/auth-session-provider", () => ({
  useAuthSession: vi.fn(),
}));
vi.mock("@/lib/reports/browser-client", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/reports/browser-client")
  >("@/lib/reports/browser-client");
  return {
    ...actual,
    getReportById: vi.fn(),
    getReportCategories: vi.fn(),
    getReportCampusLocations: vi.fn(),
  };
});

import { useRouter } from "next/navigation";

import ReportDetailPage, { metadata } from "@/app/reports/[id]/page";
import {
  type AuthSessionContextValue,
  useAuthSession,
} from "@/components/auth/auth-session-provider";
import {
  BrowserReportError,
  getReportById,
  getReportCampusLocations,
  getReportCategories,
  type MemberReport,
} from "@/lib/reports/browser-client";

import { ReportDetailClient } from "./report-detail-client";

const replace = vi.fn();
const refreshSession = vi.fn().mockResolvedValue(undefined);

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
  moderationStatus: "visible",
  resolvedAt: null,
  createdAt: "2026-08-15T02:05:00.000Z",
  updatedAt: "2026-08-15T03:10:00.000Z",
  isOwner: true,
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

function mockReadyResponses(report: MemberReport = memberReport) {
  vi.mocked(getReportById).mockResolvedValue(report);
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
  vi.mocked(useRouter).mockReturnValue({ replace } as never);
  mockAuthenticatedSession();
  mockReadyResponses();
});

afterEach(cleanup);

describe("ReportDetailClient route and session boundary", () => {
  it("provides route metadata, async params and a main landmark", async () => {
    expect(metadata.title).toBe("Report details");
    const routeSource = readFileSync(resolve("src/app/reports/[id]/page.tsx"), "utf8");
    expect(routeSource).toContain('<main id="main-content">');
    expect(routeSource).toContain("params: Promise<{ id: string }>");

    const route = await ReportDetailPage({
      params: Promise.resolve({ id: memberReport.id }),
    });
    const { container } = render(route);
    expect(container.querySelector("main#main-content")).toBeTruthy();
    expect(
      await screen.findByRole("heading", { name: memberReport.title }),
    ).toBeTruthy();
    expect(getReportById).toHaveBeenCalledWith(memberReport.id);
  });

  it("accepts only the notifications return source", async () => {
    const notificationRoute = await ReportDetailPage({
      params: Promise.resolve({ id: memberReport.id }),
      searchParams: Promise.resolve({ returnTo: "/notifications" }),
    });
    const notificationView = render(notificationRoute);
    expect(
      (
        await screen.findByRole("link", { name: "Back to notifications" })
      ).getAttribute("href"),
    ).toBe("/notifications");
    notificationView.unmount();

    const unsafeRoute = await ReportDetailPage({
      params: Promise.resolve({ id: memberReport.id }),
      searchParams: Promise.resolve({ returnTo: "https://example.com" }),
    });
    render(unsafeRoute);
    expect(
      (
        await screen.findByRole("link", { name: "Back to My reports" })
      ).getAttribute("href"),
    ).toBe("/reports/mine");
  });

  it("waits for the session and redirects unauthenticated visitors", async () => {
    mockSession({ status: "loading", user: null });
    const { rerender } = render(<ReportDetailClient reportId={memberReport.id} />);
    expect(screen.getByRole("status").textContent).toContain("Checking your account");
    expect(getReportById).not.toHaveBeenCalled();

    mockSession({ status: "unauthenticated", user: null });
    rerender(<ReportDetailClient reportId={memberReport.id} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(getReportById).not.toHaveBeenCalled();
  });

  it("offers session retry and blocks inactive accounts", async () => {
    const user = userEvent.setup();
    mockSession({ status: "unavailable", user: null });
    const { rerender } = render(<ReportDetailClient reportId={memberReport.id} />);
    await user.click(screen.getByRole("button", { name: "Retry session check" }));
    expect(refreshSession).toHaveBeenCalledOnce();

    mockAuthenticatedSession({ ...safeUser, status: "suspended" });
    rerender(<ReportDetailClient reportId={memberReport.id} />);
    expect(screen.getByRole("alert").textContent).toContain(
      "Report details unavailable",
    );
    expect(getReportById).not.toHaveBeenCalled();
  });

  it.each(["student", "staff", "administrator"] as const)(
    "allows an active %s to inspect a report",
    async (role) => {
      mockAuthenticatedSession({ ...safeUser, role });
      render(<ReportDetailClient reportId={memberReport.id} />);
      expect(
        await screen.findByRole("heading", { name: memberReport.title }),
      ).toBeTruthy();
    },
  );
});

describe("ReportDetailClient data and privacy", () => {
  it("shows report flagging only for a report owned by someone else", async () => {
    const view = render(<ReportDetailClient reportId={memberReport.id} />);
    await screen.findByRole("heading", { name: memberReport.title });
    expect(screen.queryByRole("button", { name: "Report this listing" })).toBeNull();

    mockReadyResponses({ ...memberReport, isOwner: false });
    view.unmount();
    render(<ReportDetailClient reportId={memberReport.id} />);
    await screen.findByRole("heading", { name: memberReport.title });
    expect(screen.getByRole("button", { name: "Report this listing" })).toBeTruthy();
  });

  it.each([
    ["open owner report", "open", true, true],
    ["open report owned by someone else", "open", false, false],
    ["closed owner report", "closed", true, false],
  ] as const)(
    "shows matching only for an %s",
    async (_case, status, isOwner, expected) => {
      mockReadyResponses({ ...memberReport, status, isOwner });
      render(<ReportDetailClient reportId={memberReport.id} />);
      await screen.findByRole("heading", { name: memberReport.title });

      expect(
        screen.queryByRole("heading", { name: "Possible matches" }) !== null,
      ).toBe(expected);
    },
  );

  it.each([
    ["found", "open", false, "student", true],
    ["lost", "open", false, "student", false],
    ["found", "claim_pending", false, "student", false],
    ["found", "open", true, "student", false],
    ["found", "open", false, "staff", false],
  ] as const)(
    "gates the claim entry for %s %s owner=%s role=%s",
    async (reportType, status, isOwner, role, expected) => {
      mockAuthenticatedSession({ ...safeUser, role });
      mockReadyResponses({
        ...memberReport,
        reportType,
        status,
        isOwner,
      });
      render(<ReportDetailClient reportId={memberReport.id} />);
      await screen.findByRole("heading", { name: memberReport.title });
      const link = screen.queryByRole("link", { name: "Claim this item" });
      expect(link !== null).toBe(expected);
      if (link) {
        expect(link.getAttribute("href")).toBe(
          `/reports/${memberReport.id}/claim`,
        );
      }
    },
  );

  it("starts detail and both reference requests in parallel", async () => {
    const reportRequest = deferred<MemberReport>();
    const categoryRequest = deferred<typeof categories>();
    const locationRequest = deferred<typeof campusLocations>();
    vi.mocked(getReportById).mockReturnValue(reportRequest.promise);
    vi.mocked(getReportCategories).mockReturnValue(categoryRequest.promise);
    vi.mocked(getReportCampusLocations).mockReturnValue(locationRequest.promise);

    render(<ReportDetailClient reportId={memberReport.id} />);
    await waitFor(() => {
      expect(getReportById).toHaveBeenCalledOnce();
      expect(getReportCategories).toHaveBeenCalledOnce();
      expect(getReportCampusLocations).toHaveBeenCalledOnce();
    });
    expect(screen.getByRole("status").textContent).toContain("Loading report details");

    await act(async () => {
      reportRequest.resolve(memberReport);
      categoryRequest.resolve(categories);
      locationRequest.resolve(campusLocations);
    });
  });

  it("renders only privacy-safe detail and safe hidden labels", async () => {
    render(<ReportDetailClient reportId={memberReport.id} />);

    expect(
      await screen.findByRole("heading", { name: memberReport.title }),
    ).toBeTruthy();
    expect(screen.getByText("Location hidden")).toBeTruthy();
    expect(screen.getByText("Date hidden")).toBeTruthy();
    expect(screen.getByText("Your report")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Back to My reports" }).getAttribute("href"),
    ).toBe("/reports/mine");
    expect(document.body.textContent).not.toMatch(
      /reporterId|privacySettings|serialNumber|expectedAnswer|privateNotes/i,
    );
  });

  it("returns notification-sourced reports to notifications", async () => {
    render(
      <ReportDetailClient reportId={memberReport.id} fromNotifications />,
    );

    expect(
      (
        await screen.findByRole("link", { name: "Back to notifications" })
      ).getAttribute("href"),
    ).toBe("/notifications");
  });

  it("returns reports owned by someone else to public reports", async () => {
    mockReadyResponses({ ...memberReport, isOwner: false });
    render(<ReportDetailClient reportId={memberReport.id} />);

    expect(
      (await screen.findByRole("link", { name: "Back to reports" })).getAttribute(
        "href",
      ),
    ).toBe("/reports");
  });

  it("resolves labels and formats every visible date in Pacific/Auckland", async () => {
    const visibleReport: MemberReport = {
      ...memberReport,
      campusLocationId: campusLocations[0].id,
      occurredAt: "2026-08-15T01:00:00.000Z",
      resolvedAt: "2026-08-16T00:00:00.000Z",
    };
    mockReadyResponses(visibleReport);
    render(<ReportDetailClient reportId={visibleReport.id} />);

    await screen.findByRole("heading", { name: visibleReport.title });
    expect(screen.getByText("Electronics")).toBeTruthy();
    expect(screen.getByText("Auckland · Library")).toBeTruthy();
    const formatter = new Intl.DateTimeFormat("en-NZ", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Pacific/Auckland",
    });
    for (const value of [
      visibleReport.occurredAt,
      visibleReport.createdAt,
      visibleReport.updatedAt,
      visibleReport.resolvedAt,
    ]) {
      expect(screen.getByText(formatter.format(new Date(value!)))).toBeTruthy();
    }
  });

  it("renders explicit HTTPS external photo links without loading images", async () => {
    mockReadyResponses({
      ...memberReport,
      photoUrls: ["https://photos.example/item-one.jpg", "https://photos.example/item-two.jpg"],
    });
    const { container } = render(<ReportDetailClient reportId={memberReport.id} />);

    const links = await screen.findAllByRole("link", {
      name: /View submitted photo \d \(external\)/,
    });
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute("href")).toBe(
      "https://photos.example/item-one.jpg",
    );
    expect(links[0].getAttribute("target")).toBe("_blank");
    expect(links[0].getAttribute("rel")).toBe("noreferrer");
    expect(document.body.textContent).not.toContain(
      "https://photos.example/item-one.jpg",
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('link[rel="preload"]')).toBeNull();
  });

  it("renders protected images and legacy links in their original positions", async () => {
    const firstImage = "/api/report-images/64b64c6f2f4d9f1a2b3c4d61";
    const legacyImage = "https://photos.example/legacy.jpg";
    const thirdImage = "/api/report-images/64b64c6f2f4d9f1a2b3c4d63";
    mockReadyResponses({
      ...memberReport,
      photoUrls: [firstImage, legacyImage, thirdImage],
    });
    render(<ReportDetailClient reportId={memberReport.id} />);

    const images = await screen.findAllByRole("img");
    expect(images.map((image) => image.getAttribute("alt"))).toEqual([
      "Submitted photo 1",
      "Submitted photo 3",
    ]);
    expect(images.map((image) => image.getAttribute("src"))).toEqual([
      firstImage,
      thirdImage,
    ]);
    const legacyLink = screen.getByRole("link", {
      name: "View submitted photo 2 (external)",
    });
    expect(legacyLink.getAttribute("href")).toBe(legacyImage);
    expect(legacyLink.getAttribute("target")).toBe("_blank");
    expect(legacyLink.getAttribute("rel")).toBe("noreferrer");
    expect(screen.queryByRole("link", { name: /photo (1|3)/i })).toBeNull();
    expect(images.some((image) => image.getAttribute("src") === legacyImage)).toBe(
      false,
    );
  });

  it("omits the photo section when photo references are redacted", async () => {
    mockReadyResponses({ ...memberReport, photoUrls: [] });
    render(<ReportDetailClient reportId={memberReport.id} />);

    await screen.findByRole("heading", { name: memberReport.title });
    expect(
      screen.queryByRole("heading", { name: "Submitted photos" }),
    ).toBeNull();
  });

  it("keeps detail links usable and facts stacked at narrow widths", () => {
    const css = readFileSync(
      resolve("src/components/reports/report-browsing.module.css"),
      "utf8",
    );
    const photoLinkRule = css.match(/\.photoLinks a\s*\{[^}]*\}/)?.[0] ?? "";
    expect(photoLinkRule).toMatch(/min-height:\s*44px/);
    expect(css).toMatch(/\.photoGallery\s*\{[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.photoImage\s*\{[^}]*max-width:\s*100%/);
    expect(css).toContain("@media (max-width: 20rem)");
    expect(css).toMatch(
      /@media \(max-width: 40rem\)[\s\S]*?\.detailFacts[\s\S]*?grid-template-columns:\s*1fr/,
    );
  });

  it("keeps loaded detail visible when labels fail and retries labels only", async () => {
    const user = userEvent.setup();
    vi.mocked(getReportCategories).mockRejectedValueOnce(new Error("labels failed"));
    render(<ReportDetailClient reportId={memberReport.id} />);

    expect(
      await screen.findByRole("heading", { name: memberReport.title }),
    ).toBeTruthy();
    expect(screen.getByText("Category unavailable")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry report labels" })).toBeTruthy();

    vi.mocked(getReportCategories).mockResolvedValue(categories);
    await user.click(screen.getByRole("button", { name: "Retry report labels" }));
    expect(await screen.findByText("Electronics")).toBeTruthy();
    expect(getReportById).toHaveBeenCalledOnce();
  });

  it("uses unavailable fallbacks for inactive historical references", async () => {
    mockReadyResponses({
      ...memberReport,
      campusLocationId: campusLocations[0].id,
    });
    vi.mocked(getReportCategories).mockResolvedValue([]);
    vi.mocked(getReportCampusLocations).mockResolvedValue([]);
    render(<ReportDetailClient reportId={memberReport.id} />);

    expect(await screen.findByText("Category unavailable")).toBeTruthy();
    expect(screen.getByText("Campus location unavailable")).toBeTruthy();
  });
});

describe("ReportDetailClient errors and stale requests", () => {
  it("renders exact not-found, retryable and permission states", async () => {
    vi.mocked(getReportById).mockRejectedValueOnce(
      new BrowserReportError({
        code: "REPORT_NOT_FOUND",
        status: 404,
        message: "Not found",
      }),
    );
    render(<ReportDetailClient reportId="missing" />);
    expect(await screen.findByRole("heading", { name: "Report not found" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    cleanup();

    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({ replace } as never);
    mockAuthenticatedSession();
    mockReadyResponses();
    vi.mocked(getReportById).mockRejectedValueOnce(new Error("failed"));
    render(<ReportDetailClient reportId={memberReport.id} />);
    expect(await screen.findByRole("button", { name: "Retry report details" })).toBeTruthy();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    cleanup();

    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({ replace } as never);
    mockAuthenticatedSession();
    mockReadyResponses();
    vi.mocked(getReportById).mockRejectedValueOnce(
      new BrowserReportError({
        code: "ACCOUNT_UNAVAILABLE",
        status: 403,
        message: "Unavailable",
      }),
    );
    render(<ReportDetailClient reportId={memberReport.id} />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Report details unavailable",
    );
  });

  it("retries a generic detail failure", async () => {
    const user = userEvent.setup();
    vi.mocked(getReportById)
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValueOnce(memberReport);
    render(<ReportDetailClient reportId={memberReport.id} />);
    await user.click(
      await screen.findByRole("button", { name: "Retry report details" }),
    );
    expect(
      await screen.findByRole("heading", { name: memberReport.title }),
    ).toBeTruthy();
  });

  it("redirects when detail or reference authentication expires", async () => {
    vi.mocked(getReportById).mockRejectedValueOnce(
      new BrowserReportError({
        code: "AUTHENTICATION_REQUIRED",
        status: 401,
        message: "Sign in",
      }),
    );
    render(<ReportDetailClient reportId={memberReport.id} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    cleanup();

    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue({ replace } as never);
    mockAuthenticatedSession();
    mockReadyResponses();
    vi.mocked(getReportCategories).mockRejectedValueOnce(
      new BrowserReportError({
        code: "AUTHENTICATION_REQUIRED",
        status: 401,
        message: "Sign in",
      }),
    );
    render(<ReportDetailClient reportId={memberReport.id} />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("prioritizes a later reference authentication error over an earlier generic failure", async () => {
    const locationRequest = deferred<typeof campusLocations>();
    vi.mocked(getReportCategories).mockRejectedValueOnce(
      new Error("category labels failed"),
    );
    vi.mocked(getReportCampusLocations).mockReturnValueOnce(
      locationRequest.promise,
    );
    render(<ReportDetailClient reportId={memberReport.id} />);

    expect(
      await screen.findByRole("heading", { name: memberReport.title }),
    ).toBeTruthy();
    await act(async () => Promise.resolve());
    await act(async () => {
      locationRequest.reject(
        new BrowserReportError({
          code: "AUTHENTICATION_REQUIRED",
          status: 401,
          message: "Sign in",
        }),
      );
    });

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("prioritizes a later reference permission error over an earlier generic failure", async () => {
    const locationRequest = deferred<typeof campusLocations>();
    vi.mocked(getReportCategories).mockRejectedValueOnce(
      new Error("category labels failed"),
    );
    vi.mocked(getReportCampusLocations).mockReturnValueOnce(
      locationRequest.promise,
    );
    render(<ReportDetailClient reportId={memberReport.id} />);

    expect(
      await screen.findByRole("heading", { name: memberReport.title }),
    ).toBeTruthy();
    await act(async () => Promise.resolve());
    await act(async () => {
      locationRequest.reject(
        new BrowserReportError({
          code: "ACCOUNT_UNAVAILABLE",
          status: 403,
          message: "Unavailable",
        }),
      );
    });

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "Report details unavailable",
      ),
    );
  });

  it("ignores an older report response after the report id changes", async () => {
    const firstRequest = deferred<MemberReport>();
    const secondReport = { ...memberReport, id: "second", title: "Second report" };
    vi.mocked(getReportById)
      .mockReturnValueOnce(firstRequest.promise)
      .mockResolvedValueOnce(secondReport);
    const { rerender } = render(<ReportDetailClient reportId="first" />);
    await waitFor(() => expect(getReportById).toHaveBeenCalledWith("first"));

    rerender(<ReportDetailClient reportId="second" />);
    expect(await screen.findByRole("heading", { name: "Second report" })).toBeTruthy();
    await act(async () => firstRequest.resolve({ ...memberReport, title: "Old report" }));
    expect(screen.queryByText("Old report")).toBeNull();
  });

  it("resets account-scoped state when the authenticated account changes", async () => {
    const firstRequest = deferred<MemberReport>();
    const secondReport = { ...memberReport, id: "second", title: "Second account report" };
    vi.mocked(getReportById)
      .mockReturnValueOnce(firstRequest.promise)
      .mockResolvedValueOnce(secondReport);
    const { rerender } = render(<ReportDetailClient reportId={memberReport.id} />);
    await waitFor(() => expect(getReportById).toHaveBeenCalledOnce());

    mockAuthenticatedSession({ ...safeUser, id: "second-user" });
    rerender(<ReportDetailClient reportId={memberReport.id} />);
    expect(
      await screen.findByRole("heading", { name: "Second account report" }),
    ).toBeTruthy();
    await act(async () => firstRequest.resolve({ ...memberReport, title: "Old account report" }));
    expect(screen.queryByText("Old account report")).toBeNull();
  });
});
