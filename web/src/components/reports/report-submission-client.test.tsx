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
    getReportCategories: vi.fn(),
    getReportCampusLocations: vi.fn(),
  };
});
vi.mock("./report-form", async () => {
  const { useState } = await vi.importActual<typeof import("react")>("react");

  return {
    ReportForm: vi.fn(function MockReportForm({
      onSuccess,
      onAuthenticationRequired,
      onPermissionLost,
      onReferenceUnavailable,
    }: {
      onSuccess: (report: typeof createdReport) => void;
      onAuthenticationRequired: () => void;
      onPermissionLost: () => void;
      onReferenceUnavailable: () => Promise<void>;
    }) {
      const [draftMarker, setDraftMarker] = useState("");

      return (
        <section aria-label="Report form fixture">
          <label>
            Draft marker
            <input
              value={draftMarker}
              onChange={(event) => setDraftMarker(event.target.value)}
            />
          </label>
          <p>{privateFixture.distinguishingFeature}</p>
          <p>{privateFixture.exactLocation}</p>
          <p>{privateFixture.serialNumber}</p>
          <p>{privateFixture.question}</p>
          <p>{privateFixture.answer}</p>
          <p>{privateFixture.notes}</p>
          <button type="button" onClick={() => onSuccess(createdReport)}>
            Complete report
          </button>
          <button type="button" onClick={onAuthenticationRequired}>
            Expire authentication
          </button>
          <button type="button" onClick={onPermissionLost}>
            Remove permission
          </button>
          <button
            type="button"
            onClick={() => void onReferenceUnavailable()}
          >
            Refresh references
          </button>
        </section>
      );
    }),
  };
});

import { useRouter } from "next/navigation";

import {
  type AuthSessionContextValue,
  useAuthSession,
} from "@/components/auth/auth-session-provider";
import {
  BrowserReportError,
  getReportCampusLocations,
  getReportCategories,
  type CreatedReport,
} from "@/lib/reports/browser-client";

import { ReportForm } from "./report-form";
import { ReportSubmissionClient } from "./report-submission-client";

const replace = vi.fn();
const refreshSession = vi.fn().mockResolvedValue(undefined);

const student: NonNullable<AuthSessionContextValue["user"]> = {
  id: "student-id",
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

const secondStudent: NonNullable<AuthSessionContextValue["user"]> = {
  ...student,
  id: "second-student-id",
  email: "second.student@example.com",
  profile: { ...student.profile, displayName: "Second Student" },
};

const categories = [
  {
    id: "507f1f77bcf86cd799439011",
    name: "Electronics",
    description: "Phones, laptops and chargers",
  },
];

const campusLocations = [
  {
    id: "507f191e810c19729de860ea",
    campusName: "Auckland",
    locationName: "Library",
    description: null,
  },
];

const createdReport: CreatedReport = {
  id: "507f191e810c19729de860ff",
  reporterId: "student-id",
  reportType: "lost",
  title: "Black laptop charger",
  publicDescription: "A black laptop charger in a soft case.",
  categoryId: categories[0].id,
  campusLocationId: campusLocations[0].id,
  occurredAt: "2026-08-14T03:30:00.000Z",
  colors: ["black"],
  tags: ["charger"],
  photoUrls: [],
  status: "open",
  privacySettings: {
    showPhoto: true,
    showEventDate: true,
    showCampusLocation: true,
  },
  resolvedAt: null,
  createdAt: "2026-08-15T01:00:00.000Z",
  updatedAt: "2026-08-15T01:00:00.000Z",
};

const privateFixture = {
  distinguishingFeature: "Scratch beneath the plug",
  exactLocation: "Third quiet-study booth",
  serialNumber: "PRIVATE-12345",
  question: "What sticker is attached?",
  answer: "A silver fern",
  notes: "Call after the lecture",
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

function mockReadyStudent() {
  mockSession({ status: "authenticated", user: student });
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

function relativeLuminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(foreground: string, background: string) {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  return (lighter + 0.05) / (darker + 0.05);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue({ replace } as never);
  vi.mocked(getReportCategories).mockReset().mockResolvedValue(categories);
  vi.mocked(getReportCampusLocations)
    .mockReset()
    .mockResolvedValue(campusLocations);
});

afterEach(cleanup);

describe("ReportSubmissionClient", () => {
  it("waits politely for the session without loading reference data", () => {
    mockSession({ status: "loading", user: null });
    render(<ReportSubmissionClient />);

    expect(screen.getByRole("status").textContent).toContain(
      "Checking your account",
    );
    expect(getReportCategories).not.toHaveBeenCalled();
    expect(getReportCampusLocations).not.toHaveBeenCalled();
  });

  it("redirects an unauthenticated visitor without loading reference data", async () => {
    mockSession({ status: "unauthenticated", user: null });
    render(<ReportSubmissionClient />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(getReportCategories).not.toHaveBeenCalled();
    expect(getReportCampusLocations).not.toHaveBeenCalled();
  });

  it("offers a session retry when the account check is unavailable", async () => {
    const user = userEvent.setup();
    mockSession({ status: "unavailable", user: null });
    render(<ReportSubmissionClient />);

    await user.click(screen.getByRole("button", { name: "Retry session check" }));

    expect(refreshSession).toHaveBeenCalledOnce();
    expect(getReportCategories).not.toHaveBeenCalled();
    expect(getReportCampusLocations).not.toHaveBeenCalled();
  });

  it.each(["staff", "administrator"] as const)(
    "denies an authenticated %s without loading reference data",
    (role) => {
      mockSession({
        status: "authenticated",
        user: { ...student, role },
      });
      render(<ReportSubmissionClient />);

      expect(
        screen.getByRole("heading", { name: "Report submission unavailable" }),
      ).toBeTruthy();
      expect(getReportCategories).not.toHaveBeenCalled();
      expect(getReportCampusLocations).not.toHaveBeenCalled();
    },
  );

  it("denies an inactive student without loading reference data", () => {
    mockSession({
      status: "authenticated",
      user: { ...student, status: "suspended" },
    });
    render(<ReportSubmissionClient />);

    expect(
      screen.getByRole("heading", { name: "Report submission unavailable" }),
    ).toBeTruthy();
    expect(getReportCategories).not.toHaveBeenCalled();
    expect(getReportCampusLocations).not.toHaveBeenCalled();
  });

  it("loads both reference lists in parallel once for an active student", async () => {
    const categoriesRequest = deferred<typeof categories>();
    const locationsRequest = deferred<typeof campusLocations>();
    mockSession({ status: "authenticated", user: student });
    vi.mocked(getReportCategories).mockReturnValue(categoriesRequest.promise);
    vi.mocked(getReportCampusLocations).mockReturnValue(locationsRequest.promise);
    render(<ReportSubmissionClient />);

    await waitFor(() => {
      expect(getReportCategories).toHaveBeenCalledOnce();
      expect(getReportCampusLocations).toHaveBeenCalledOnce();
    });
    expect(screen.getByRole("status").textContent).toContain(
      "Loading report options",
    );

    await act(async () => {
      categoriesRequest.resolve(categories);
      locationsRequest.resolve(campusLocations);
    });

    expect(await screen.findByLabelText("Report form fixture")).toBeTruthy();
    expect(getReportCategories).toHaveBeenCalledOnce();
    expect(getReportCampusLocations).toHaveBeenCalledOnce();
  });

  it("ignores reference data that resolves after access changes", async () => {
    const categoriesRequest = deferred<typeof categories>();
    const locationsRequest = deferred<typeof campusLocations>();
    mockSession({ status: "authenticated", user: student });
    vi.mocked(getReportCategories).mockReturnValue(categoriesRequest.promise);
    vi.mocked(getReportCampusLocations).mockReturnValue(locationsRequest.promise);
    const { rerender } = render(<ReportSubmissionClient />);
    await waitFor(() => expect(getReportCategories).toHaveBeenCalledOnce());

    mockSession({
      status: "authenticated",
      user: { ...student, role: "staff" },
    });
    rerender(<ReportSubmissionClient />);
    await act(async () => {
      categoriesRequest.resolve(categories);
      locationsRequest.resolve(campusLocations);
    });

    expect(
      screen.getByRole("heading", { name: "Report submission unavailable" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Report form fixture")).toBeNull();
  });

  it.each([
    ["empty categories", [], campusLocations],
    ["empty campus locations", categories, []],
  ])("treats %s as unavailable", async (_label, nextCategories, nextLocations) => {
    mockSession({ status: "authenticated", user: student });
    vi.mocked(getReportCategories).mockResolvedValue(nextCategories);
    vi.mocked(getReportCampusLocations).mockResolvedValue(nextLocations);
    render(<ReportSubmissionClient />);

    expect(
      await screen.findByRole("heading", { name: "Report options unavailable" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Report form fixture")).toBeNull();
  });

  it("shows a safe retry state when reference loading fails", async () => {
    mockSession({ status: "authenticated", user: student });
    vi.mocked(getReportCategories).mockRejectedValue(
      new Error("private database detail"),
    );
    render(<ReportSubmissionClient />);

    const state = await screen.findByRole("heading", {
      name: "Report options unavailable",
    });
    expect(state.parentElement?.textContent).not.toContain(
      "private database detail",
    );
    expect(screen.queryByLabelText("Report form fixture")).toBeNull();
  });

  it("redirects when initial reference loading reports expired authentication", async () => {
    mockSession({ status: "authenticated", user: student });
    vi.mocked(getReportCategories).mockRejectedValue(
      new BrowserReportError({
        code: "AUTHENTICATION_REQUIRED",
        status: 401,
        message: "Authentication required",
      }),
    );
    render(<ReportSubmissionClient />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(
      screen.queryByRole("heading", { name: "Report options unavailable" }),
    ).toBeNull();
  });

  it("enters the permission state when initial reference loading is forbidden", async () => {
    mockSession({ status: "authenticated", user: student });
    vi.mocked(getReportCategories).mockRejectedValue(
      new BrowserReportError({
        code: "ACCOUNT_UNAVAILABLE",
        status: 403,
        message: "Account is unavailable",
      }),
    );
    render(<ReportSubmissionClient />);

    expect(
      await screen.findByRole("heading", {
        name: "Report submission unavailable",
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Report options unavailable" }),
    ).toBeNull();
  });

  it("retries both reference requests and restores the form", async () => {
    const user = userEvent.setup();
    mockSession({ status: "authenticated", user: student });
    vi.mocked(getReportCategories)
      .mockRejectedValueOnce(new Error("hidden"))
      .mockResolvedValueOnce(categories);
    render(<ReportSubmissionClient />);

    await screen.findByRole("heading", { name: "Report options unavailable" });
    await user.click(
      screen.getByRole("button", { name: "Retry report options" }),
    );

    expect(await screen.findByLabelText("Report form fixture")).toBeTruthy();
    expect(getReportCategories).toHaveBeenCalledTimes(2);
    expect(getReportCampusLocations).toHaveBeenCalledTimes(2);
  });

  it("passes exact reference options and state callbacks to the form", async () => {
    mockReadyStudent();
    render(<ReportSubmissionClient />);

    await screen.findByLabelText("Report form fixture");
    const props = vi.mocked(ReportForm).mock.calls.at(-1)?.[0];

    expect(props?.categories).toEqual(categories);
    expect(props?.campusLocations).toEqual(campusLocations);
    expect(props?.onSuccess).toEqual(expect.any(Function));
    expect(props?.onAuthenticationRequired).toEqual(expect.any(Function));
    expect(props?.onPermissionLost).toEqual(expect.any(Function));
    expect(props?.onReferenceUnavailable).toEqual(expect.any(Function));
  });

  it("refreshes stale options without losing the mounted form state", async () => {
    const user = userEvent.setup();
    mockReadyStudent();
    render(<ReportSubmissionClient />);
    await screen.findByLabelText("Report form fixture");
    await user.type(screen.getByLabelText("Draft marker"), "Keep this draft");

    const categoriesRequest = deferred<typeof categories>();
    const locationsRequest = deferred<typeof campusLocations>();
    vi.mocked(getReportCategories).mockReturnValueOnce(categoriesRequest.promise);
    vi.mocked(getReportCampusLocations).mockReturnValueOnce(
      locationsRequest.promise,
    );

    await user.click(screen.getByRole("button", { name: "Refresh references" }));

    await waitFor(() => expect(getReportCategories).toHaveBeenCalledTimes(2));
    expect(getReportCampusLocations).toHaveBeenCalledTimes(2);
    expect((screen.getByLabelText("Draft marker") as HTMLInputElement).value).toBe(
      "Keep this draft",
    );

    await act(async () => {
      categoriesRequest.resolve([
        ...categories,
        {
          id: "507f1f77bcf86cd799439012",
          name: "Books",
          description: "Books and textbooks",
        },
      ]);
      locationsRequest.resolve(campusLocations);
    });

    expect((screen.getByLabelText("Draft marker") as HTMLInputElement).value).toBe(
      "Keep this draft",
    );
    await waitFor(() =>
      expect(
        vi.mocked(ReportForm).mock.calls.at(-1)?.[0].categories,
      ).toHaveLength(2),
    );
  });

  it("keeps the form and local input when a background refresh fails", async () => {
    const user = userEvent.setup();
    mockReadyStudent();
    render(<ReportSubmissionClient />);
    await screen.findByLabelText("Report form fixture");
    await user.type(screen.getByLabelText("Draft marker"), "Still here");
    vi.mocked(getReportCategories).mockRejectedValueOnce(new Error("hidden"));

    await user.click(screen.getByRole("button", { name: "Refresh references" }));

    await waitFor(() => expect(getReportCategories).toHaveBeenCalledTimes(2));
    expect(getReportCampusLocations).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Report form fixture")).toBeTruthy();
    expect((screen.getByLabelText("Draft marker") as HTMLInputElement).value).toBe(
      "Still here",
    );
  });

  it("redirects when a background reference refresh reports expired authentication", async () => {
    const user = userEvent.setup();
    mockReadyStudent();
    render(<ReportSubmissionClient />);
    await screen.findByLabelText("Report form fixture");
    vi.mocked(getReportCategories).mockRejectedValueOnce(
      new BrowserReportError({
        code: "AUTHENTICATION_REQUIRED",
        status: 401,
        message: "Authentication required",
      }),
    );

    await user.click(screen.getByRole("button", { name: "Refresh references" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.getByLabelText("Report form fixture")).toBeTruthy();
  });

  it("enters the permission state when a background reference refresh is forbidden", async () => {
    const user = userEvent.setup();
    mockReadyStudent();
    render(<ReportSubmissionClient />);
    await screen.findByLabelText("Report form fixture");
    vi.mocked(getReportCategories).mockRejectedValueOnce(
      new BrowserReportError({
        code: "REPORT_CREATION_FORBIDDEN",
        status: 403,
        message: "Only active student accounts can create reports",
      }),
    );

    await user.click(screen.getByRole("button", { name: "Refresh references" }));

    expect(
      await screen.findByRole("heading", {
        name: "Report submission unavailable",
      }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Report form fixture")).toBeNull();
  });

  it("redirects when authentication is lost", async () => {
    const user = userEvent.setup();
    mockReadyStudent();
    render(<ReportSubmissionClient />);
    await screen.findByLabelText("Report form fixture");

    await user.click(
      screen.getByRole("button", { name: "Expire authentication" }),
    );

    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("replaces the form when submission permission is lost", async () => {
    const user = userEvent.setup();
    mockReadyStudent();
    render(<ReportSubmissionClient />);
    await screen.findByLabelText("Report form fixture");

    await user.click(screen.getByRole("button", { name: "Remove permission" }));

    expect(
      screen.getByRole("heading", { name: "Report submission unavailable" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Report form fixture")).toBeNull();
  });

  it("shows only owner-safe confirmation details after creation", async () => {
    const user = userEvent.setup();
    mockReadyStudent();
    const { container } = render(<ReportSubmissionClient />);
    await screen.findByLabelText("Report form fixture");

    await user.click(screen.getByRole("button", { name: "Complete report" }));

    expect(
      screen.getByRole("heading", { name: "Report submitted" }),
    ).toBeTruthy();
    expect(screen.getByText("Lost item")).toBeTruthy();
    expect(screen.getByText("Black laptop charger")).toBeTruthy();
    expect(screen.getByText("Open")).toBeTruthy();
    expect(screen.getByText(createdReport.id)).toBeTruthy();
    for (const privateValue of Object.values(privateFixture)) {
      expect(container.textContent).not.toContain(privateValue);
    }
  });

  it("does not display a success response for another reporter", async () => {
    mockReadyStudent();
    render(<ReportSubmissionClient />);
    await screen.findByLabelText("Report form fixture");
    const props = vi.mocked(ReportForm).mock.calls.at(-1)?.[0];

    act(() => {
      props?.onSuccess({ ...createdReport, reporterId: secondStudent.id });
    });

    expect(screen.queryByRole("heading", { name: "Report submitted" })).toBeNull();
    expect(screen.getByLabelText("Report form fixture")).toBeTruthy();
  });

  it("mounts an empty account-scoped form when the active student changes", async () => {
    const user = userEvent.setup();
    mockReadyStudent();
    const { rerender } = render(<ReportSubmissionClient />);
    await screen.findByLabelText("Report form fixture");
    await user.type(screen.getByLabelText("Draft marker"), "First account draft");

    const categoriesRequest = deferred<typeof categories>();
    const locationsRequest = deferred<typeof campusLocations>();
    vi.mocked(getReportCategories).mockReturnValueOnce(categoriesRequest.promise);
    vi.mocked(getReportCampusLocations).mockReturnValueOnce(
      locationsRequest.promise,
    );
    mockSession({ status: "authenticated", user: secondStudent });
    rerender(<ReportSubmissionClient />);

    expect(screen.queryByLabelText("Report form fixture")).toBeNull();
    expect(document.body.textContent).not.toContain("First account draft");
    await waitFor(() => expect(getReportCategories).toHaveBeenCalledTimes(2));
    await act(async () => {
      categoriesRequest.resolve(categories);
      locationsRequest.resolve(campusLocations);
    });

    expect((await screen.findByLabelText("Draft marker") as HTMLInputElement).value).toBe(
      "",
    );
  });

  it("hides the previous account success state during an identity change", async () => {
    const user = userEvent.setup();
    mockReadyStudent();
    const { rerender } = render(<ReportSubmissionClient />);
    await screen.findByLabelText("Report form fixture");
    await user.click(screen.getByRole("button", { name: "Complete report" }));
    screen.getByRole("heading", { name: "Report submitted" });

    const categoriesRequest = deferred<typeof categories>();
    const locationsRequest = deferred<typeof campusLocations>();
    vi.mocked(getReportCategories).mockReturnValueOnce(categoriesRequest.promise);
    vi.mocked(getReportCampusLocations).mockReturnValueOnce(
      locationsRequest.promise,
    );
    mockSession({ status: "authenticated", user: secondStudent });
    rerender(<ReportSubmissionClient />);

    expect(screen.queryByRole("heading", { name: "Report submitted" })).toBeNull();
    expect(document.body.textContent).not.toContain(createdReport.title);
    await act(async () => {
      categoriesRequest.resolve(categories);
      locationsRequest.resolve(campusLocations);
    });
    expect(await screen.findByLabelText("Report form fixture")).toBeTruthy();
  });

  it("does not carry a lost-permission state into a new student account", async () => {
    const user = userEvent.setup();
    mockReadyStudent();
    const { rerender } = render(<ReportSubmissionClient />);
    await screen.findByLabelText("Report form fixture");
    await user.click(screen.getByRole("button", { name: "Remove permission" }));
    screen.getByRole("heading", { name: "Report submission unavailable" });

    mockSession({ status: "authenticated", user: secondStudent });
    rerender(<ReportSubmissionClient />);

    expect(
      screen.queryByRole("heading", { name: "Report submission unavailable" }),
    ).toBeNull();
    expect(await screen.findByLabelText("Report form fixture")).toBeTruthy();
  });

  it("links to the dashboard and mounts a fresh form on request", async () => {
    const user = userEvent.setup();
    mockReadyStudent();
    render(<ReportSubmissionClient />);
    await screen.findByLabelText("Report form fixture");

    await user.click(screen.getByRole("button", { name: "Complete report" }));

    expect(
      screen.getByRole("link", { name: "Back to dashboard" }).getAttribute("href"),
    ).toBe("/dashboard");
    expect(screen.queryByLabelText("Report form fixture")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Submit another report" }),
    );

    expect(screen.getByLabelText("Report form fixture")).toBeTruthy();
    expect(ReportForm).toHaveBeenCalledTimes(2);
  });

  it("keeps the kicker colour above WCAG AA contrast on both page surfaces", () => {
    const submissionCss = readFileSync(
      resolve("src/components/reports/report-submission.module.css"),
      "utf8",
    );
    const globalCss = readFileSync(
      resolve("src/app/globals.css"),
      "utf8",
    );

    expect(submissionCss).toMatch(
      /\.kicker\s*\{[^}]*color:\s*var\(--campus-green-dark\)/,
    );
    expect(globalCss).toMatch(/--campus-green-dark:\s*#174c3d/);
    expect(contrastRatio("#174c3d", "#f4efe4")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#174c3d", "#fffdf8")).toBeGreaterThanOrEqual(4.5);
  });
});
