// @vitest-environment jsdom

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
vi.mock("./report-form", () => ({
  ReportForm: vi.fn(
    ({
      onSuccess,
      onAuthenticationRequired,
      onPermissionLost,
      onReferenceUnavailable,
    }: {
      onSuccess: (report: typeof createdReport) => void;
      onAuthenticationRequired: () => void;
      onPermissionLost: () => void;
      onReferenceUnavailable: () => Promise<void>;
    }) => (
      <section aria-label="Report form fixture">
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
    ),
  ),
}));

import { useRouter } from "next/navigation";

import {
  type AuthSessionContextValue,
  useAuthSession,
} from "@/components/auth/auth-session-provider";
import {
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue({ replace } as never);
  vi.mocked(getReportCategories).mockResolvedValue(categories);
  vi.mocked(getReportCampusLocations).mockResolvedValue(campusLocations);
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

  it("reloads both reference lists when the form reports stale options", async () => {
    const user = userEvent.setup();
    mockReadyStudent();
    render(<ReportSubmissionClient />);
    await screen.findByLabelText("Report form fixture");

    await user.click(screen.getByRole("button", { name: "Refresh references" }));

    await waitFor(() => expect(getReportCategories).toHaveBeenCalledTimes(2));
    expect(getReportCampusLocations).toHaveBeenCalledTimes(2);
    expect(await screen.findByLabelText("Report form fixture")).toBeTruthy();
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
});
