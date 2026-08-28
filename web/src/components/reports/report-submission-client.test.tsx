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
    uploadReportImage: vi.fn(),
  };
});
vi.mock("./report-form", async () => {
  const { useState } = await vi.importActual<typeof import("react")>("react");

  return {
    ReportForm: vi.fn(function MockReportForm({
      categories,
      onSuccess,
      onAuthenticationRequired,
      onPermissionLost,
      onReferenceUnavailable,
    }: {
      categories: Array<{ id: string; name: string }>;
      onSuccess: (submission: {
        report: typeof createdReport;
        images: Array<{ uploadKey: string; file: File }>;
      }) => void;
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
          <ul aria-label="Category options">
            {categories.map((category) => (
              <li key={category.id}>{category.name}</li>
            ))}
          </ul>
          <p>{privateFixture.distinguishingFeature}</p>
          <p>{privateFixture.exactLocation}</p>
          <p>{privateFixture.serialNumber}</p>
          <p>{privateFixture.question}</p>
          <p>{privateFixture.answer}</p>
          <p>{privateFixture.notes}</p>
          <button
            type="button"
            onClick={() => onSuccess({ report: createdReport, images: [] })}
          >
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
  uploadReportImage,
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
  moderationStatus: "visible",
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

const selectedImages = [
  {
    uploadKey: "550e8400-e29b-41d4-a716-446655440001",
    file: new File([Uint8Array.from([0xff, 0xd8, 0xff])], "one.jpg", {
      type: "image/jpeg",
    }),
  },
  {
    uploadKey: "550e8400-e29b-41d4-a716-446655440002",
    file: new File([Uint8Array.from([0x89, 0x50])], "two.png", {
      type: "image/png",
    }),
  },
  {
    uploadKey: "550e8400-e29b-41d4-a716-446655440003",
    file: new File([Uint8Array.from([0x52, 0x49])], "three.webp", {
      type: "image/webp",
    }),
  },
];

function completeReportWithImages(images = selectedImages) {
  const props = vi.mocked(ReportForm).mock.calls.at(-1)?.[0];
  act(() => props?.onSuccess({ report: createdReport, images }));
}

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
  vi.mocked(uploadReportImage).mockReset().mockResolvedValue({
    url: "/api/report-images/507f191e810c19729de86111",
    contentType: "image/jpeg",
    byteLength: 3,
  });
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

  it("announces a session check that becomes unavailable", () => {
    mockSession({ status: "loading", user: null });
    const { rerender } = render(<ReportSubmissionClient />);
    expect(screen.queryByRole("alert")).toBeNull();

    mockSession({ status: "unavailable", user: null });
    rerender(<ReportSubmissionClient />);

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].textContent).toContain("We could not check your account");
    expect(alerts[0].hasAttribute("aria-live")).toBe(false);
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

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Report options unavailable");
    expect(alert.textContent).not.toContain("private database detail");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(alert.hasAttribute("aria-live")).toBe(false);
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

  it.each([
    ["categories", [], campusLocations],
    ["campus locations", categories, []],
  ])(
    "removes stale form options when refreshed %s are empty",
    async (_label, nextCategories, nextLocations) => {
      const user = userEvent.setup();
      mockReadyStudent();
      render(<ReportSubmissionClient />);
      await screen.findByLabelText("Report form fixture");
      expect(screen.getByText("Electronics")).toBeTruthy();
      await user.type(screen.getByLabelText("Draft marker"), "Stale draft");
      vi.mocked(getReportCategories).mockResolvedValueOnce(nextCategories);
      vi.mocked(getReportCampusLocations).mockResolvedValueOnce(nextLocations);

      await user.click(
        screen.getByRole("button", { name: "Refresh references" }),
      );

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("Report options unavailable");
      expect(screen.queryByLabelText("Report form fixture")).toBeNull();
      expect(screen.queryByText("Electronics")).toBeNull();
      expect(document.body.textContent).not.toContain("Stale draft");
    },
  );

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

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].textContent).toContain("Report submission unavailable");
    expect(alerts[0].hasAttribute("aria-live")).toBe(false);
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
    expect(screen.getByText("No images were selected.")).toBeTruthy();
    expect(uploadReportImage).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "View submitted report" }).getAttribute(
        "href",
      ),
    ).toBe(`/reports/${createdReport.id}`);
  });

  it("uploads selected images sequentially and announces progress", async () => {
    const secondUpload = deferred<Awaited<ReturnType<typeof uploadReportImage>>>();
    vi.mocked(uploadReportImage)
      .mockResolvedValueOnce({
        url: "/api/report-images/507f191e810c19729de86111",
        contentType: "image/jpeg",
        byteLength: 3,
      })
      .mockReturnValueOnce(secondUpload.promise)
      .mockResolvedValueOnce({
        url: "/api/report-images/507f191e810c19729de86113",
        contentType: "image/webp",
        byteLength: 2,
      });
    mockReadyStudent();
    render(<ReportSubmissionClient />);
    await screen.findByLabelText("Report form fixture");

    completeReportWithImages();

    await waitFor(() => expect(uploadReportImage).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("status").textContent).toContain(
      "Uploading image 2 of 3",
    );
    expect(uploadReportImage).toHaveBeenNthCalledWith(
      1,
      createdReport.id,
      selectedImages[0].file,
      selectedImages[0].uploadKey,
    );
    expect(uploadReportImage).toHaveBeenNthCalledWith(
      2,
      createdReport.id,
      selectedImages[1].file,
      selectedImages[1].uploadKey,
    );
    expect(uploadReportImage).not.toHaveBeenCalledWith(
      createdReport.id,
      selectedImages[2].file,
      selectedImages[2].uploadKey,
    );

    await act(async () => {
      secondUpload.resolve({
        url: "/api/report-images/507f191e810c19729de86112",
        contentType: "image/png",
        byteLength: 2,
      });
    });

    await waitFor(() => expect(uploadReportImage).toHaveBeenCalledTimes(3));
    expect(await screen.findByText("3 of 3 images uploaded.")).toBeTruthy();
  });

  it("keeps a partial result and retries only the pending suffix", async () => {
    const user = userEvent.setup();
    vi.mocked(uploadReportImage)
      .mockResolvedValueOnce({
        url: "/api/report-images/507f191e810c19729de86111",
        contentType: "image/jpeg",
        byteLength: 3,
      })
      .mockResolvedValueOnce({
        url: "/api/report-images/507f191e810c19729de86112",
        contentType: "image/png",
        byteLength: 2,
      })
      .mockRejectedValueOnce(new Error("private storage detail"))
      .mockResolvedValueOnce({
        url: "/api/report-images/507f191e810c19729de86113",
        contentType: "image/webp",
        byteLength: 2,
      });
    mockReadyStudent();
    render(<ReportSubmissionClient />);
    await screen.findByLabelText("Report form fixture");

    completeReportWithImages();

    expect(await screen.findByText("2 of 3 images uploaded.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("private storage detail");
    await user.click(
      screen.getByRole("button", { name: "Retry remaining images" }),
    );

    await waitFor(() => expect(uploadReportImage).toHaveBeenCalledTimes(4));
    expect(uploadReportImage).toHaveBeenNthCalledWith(
      4,
      createdReport.id,
      selectedImages[2].file,
      selectedImages[2].uploadKey,
    );
    expect(await screen.findByText("3 of 3 images uploaded.")).toBeTruthy();
  });

  it("disables starting another report while an image is uploading", async () => {
    const firstUpload = deferred<Awaited<ReturnType<typeof uploadReportImage>>>();
    vi.mocked(uploadReportImage).mockReturnValueOnce(firstUpload.promise);
    mockReadyStudent();
    render(<ReportSubmissionClient />);
    await screen.findByLabelText("Report form fixture");

    completeReportWithImages([selectedImages[0]]);

    await waitFor(() => expect(uploadReportImage).toHaveBeenCalledOnce());
    expect(
      (
        screen.getByRole("button", { name: "Submit another report" }) as
          HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it.each([
    [
      new BrowserReportError({
        code: "AUTHENTICATION_REQUIRED",
        status: 401,
        message: "Sign in again",
      }),
      "authentication",
    ],
    [
      new BrowserReportError({
        code: "REPORT_IMAGE_FORBIDDEN",
        status: 403,
        message: "Not permitted",
      }),
      "permission",
    ],
  ])("routes an upload %s failure through the access boundary", async (error, kind) => {
    vi.mocked(uploadReportImage).mockRejectedValueOnce(error);
    mockReadyStudent();
    render(<ReportSubmissionClient />);
    await screen.findByLabelText("Report form fixture");

    completeReportWithImages([selectedImages[0]]);

    if (kind === "authentication") {
      await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    } else {
      expect(
        await screen.findByRole("heading", {
          name: "Report submission unavailable",
        }),
      ).toBeTruthy();
    }
  });

  it("does not display a success response for another reporter", async () => {
    mockReadyStudent();
    render(<ReportSubmissionClient />);
    await screen.findByLabelText("Report form fixture");
    const props = vi.mocked(ReportForm).mock.calls.at(-1)?.[0];

    act(() => {
      props?.onSuccess({
        report: { ...createdReport, reporterId: secondStudent.id },
        images: [],
      });
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
