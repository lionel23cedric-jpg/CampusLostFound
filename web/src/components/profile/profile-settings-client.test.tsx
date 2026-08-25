// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/components/auth/auth-session-provider", () => ({
  useAuthSession: vi.fn(),
}));
vi.mock("@/lib/auth/browser-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/browser-client")>(
    "@/lib/auth/browser-client",
  );
  return {
    ...actual,
    getProfileSettings: vi.fn(),
    updateProfileSettings: vi.fn(),
  };
});
vi.mock("@/lib/reports/browser-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/reports/browser-client")>(
    "@/lib/reports/browser-client",
  );
  return { ...actual, getReportCampusLocations: vi.fn() };
});

import { useRouter } from "next/navigation";

import { useAuthSession } from "@/components/auth/auth-session-provider";
import {
  BrowserAuthError,
  getProfileSettings,
  updateProfileSettings,
} from "@/lib/auth/browser-client";
import type { PublicUser } from "@/lib/auth/public-user";
import {
  BrowserReportError,
  getReportCampusLocations,
} from "@/lib/reports/browser-client";
import ProfilePage, { metadata } from "@/app/profile/page";

import { ProfileSettingsClient } from "./profile-settings-client";

const locationIds = Array.from({ length: 6 }, (_value, index) =>
  (index + 1).toString(16).padStart(24, "0"),
);
const locations = locationIds.map((id, index) => ({
  id,
  campusName: index < 3 ? "Auckland" : "Manawatū",
  locationName: `Location ${index + 1}`,
  description: null,
}));

const baseUser = {
  id: "507f191e810c19729de860ec",
  email: "student@example.com",
  role: "student",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Student Name",
    preferredContactMethod: "in_app",
    preferredCampusLocationIds: [locationIds[0]],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: false,
      handoverInstructions: true,
    },
  },
} satisfies PublicUser;

const profile = {
  ...baseUser.profile,
  updatedAt: "2026-08-25T02:30:00.000Z",
};

const replace = vi.fn();
const setAuthenticatedUser = vi.fn();
const refreshSession = vi.fn().mockResolvedValue(undefined);

function session(overrides: Record<string, unknown> = {}) {
  return {
    status: "authenticated",
    user: baseUser,
    setAuthenticatedUser,
    refreshSession,
    logout: vi.fn(),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

async function renderReady() {
  const view = render(<ProfileSettingsClient />);
  await screen.findByRole("heading", { name: "Profile settings" });
  await screen.findByRole("button", { name: "Save profile settings" });
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue({ replace } as never);
  vi.mocked(useAuthSession).mockReturnValue(session() as never);
  vi.mocked(getProfileSettings).mockResolvedValue(profile);
  vi.mocked(getReportCampusLocations).mockResolvedValue(locations);
  vi.mocked(updateProfileSettings).mockResolvedValue({
    user: baseUser,
    profileUpdatedAt: "2026-08-25T03:30:00.000Z",
  });
});

afterEach(cleanup);

describe("ProfileSettingsClient access and loading", () => {
  it("provides route metadata and a main landmark", () => {
    render(<ProfilePage />);

    expect(metadata.title).toBe("Profile settings");
    expect(screen.getByRole("main").id).toBe("main-content");
  });

  it("starts Profile and campus-location requests together", async () => {
    const profileRequest = deferred<typeof profile>();
    const locationRequest = deferred<typeof locations>();
    vi.mocked(getProfileSettings).mockReturnValue(profileRequest.promise);
    vi.mocked(getReportCampusLocations).mockReturnValue(locationRequest.promise);

    render(<ProfileSettingsClient />);

    expect(screen.getByRole("status").textContent).toContain("Loading profile settings");
    await waitFor(() => {
      expect(getProfileSettings).toHaveBeenCalledOnce();
      expect(getReportCampusLocations).toHaveBeenCalledOnce();
    });
  });

  it("redirects missing sessions and exposes a session retry", async () => {
    vi.mocked(useAuthSession).mockReturnValue(
      session({ status: "unauthenticated", user: null }) as never,
    );
    const view = render(<ProfileSettingsClient />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(getProfileSettings).not.toHaveBeenCalled();
    view.unmount();

    vi.mocked(useAuthSession).mockReturnValue(
      session({ status: "unavailable", user: null }) as never,
    );
    render(<ProfileSettingsClient />);
    await userEvent.click(screen.getByRole("button", { name: "Retry session check" }));
    expect(refreshSession).toHaveBeenCalledOnce();
  });

  it("does not expose editing controls for an inactive in-memory account", () => {
    vi.mocked(useAuthSession).mockReturnValue(
      session({ user: { ...baseUser, status: "suspended" } }) as never,
    );

    render(<ProfileSettingsClient />);

    expect(screen.getByRole("heading", { name: "Profile settings unavailable" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save profile settings" })).toBeNull();
    expect(getProfileSettings).not.toHaveBeenCalled();
  });

  it.each(["student", "staff", "administrator"] as const)(
    "allows an active %s account and keeps account fields read-only",
    async (role) => {
      vi.mocked(useAuthSession).mockReturnValue(
        session({ user: { ...baseUser, role } }) as never,
      );

      await renderReady();

      expect(screen.getByText("student@example.com")).toBeTruthy();
      expect(screen.getByText(role === "administrator" ? "Administrator" : role[0].toUpperCase() + role.slice(1))).toBeTruthy();
      expect(screen.getByText("Active")).toBeTruthy();
      expect(screen.queryByRole("textbox", { name: "Email" })).toBeNull();
      expect(screen.queryByRole("textbox", { name: "Role" })).toBeNull();
      expect(screen.queryByRole("textbox", { name: "Status" })).toBeNull();
    },
  );

  it("retries only a failed Profile request", async () => {
    vi.mocked(getProfileSettings).mockRejectedValueOnce(new Error("hidden"));
    render(<ProfileSettingsClient />);

    const retry = await screen.findByRole("button", { name: "Retry profile" });
    expect(getReportCampusLocations).toHaveBeenCalledOnce();
    vi.mocked(getProfileSettings).mockResolvedValue(profile);
    await userEvent.click(retry);

    expect(await screen.findByRole("button", { name: "Save profile settings" })).toBeTruthy();
    expect(getProfileSettings).toHaveBeenCalledTimes(2);
    expect(getReportCampusLocations).toHaveBeenCalledOnce();
  });
});

describe("ProfileSettingsClient form", () => {
  it("renders initial values in labelled native controls", async () => {
    await renderReady();

    expect((screen.getByLabelText("Display name") as HTMLInputElement).value).toBe("Student Name");
    expect((screen.getByRole("radio", { name: "In-app messages" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Auckland — Location 1" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Possible match suggestions" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Report status changes" }) as HTMLInputElement).checked).toBe(false);
  });

  it("keeps the form usable and saved IDs unchanged when locations fail", async () => {
    vi.mocked(getReportCampusLocations).mockRejectedValue(
      new BrowserReportError({ code: "REFERENCE_DATA_FAILED", status: 500, message: "hidden" }),
    );
    await renderReady();

    expect(screen.getByText("Campus locations are temporarily unavailable.")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Campus preferences" }).hasAttribute("disabled")).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Save profile settings" }));

    await waitFor(() => expect(updateProfileSettings).toHaveBeenCalledOnce());
    expect(vi.mocked(updateProfileSettings).mock.calls[0]?.[0].preferredCampusLocationIds).toEqual([locationIds[0]]);

    vi.mocked(getReportCampusLocations).mockResolvedValue(locations);
    await userEvent.click(screen.getByRole("button", { name: "Retry campus locations" }));
    expect(await screen.findByRole("checkbox", { name: "Auckland — Location 1" })).toBeTruthy();
  });

  it("prevents a sixth campus selection and announces the limit", async () => {
    await renderReady();
    const user = userEvent.setup();

    for (let index = 1; index < 6; index += 1) {
      await user.click(screen.getByRole("checkbox", { name: new RegExp(`Location ${index + 1}$`) }));
    }

    expect(screen.getByRole("status").textContent).toContain("Choose up to 5 campus locations");
    expect((screen.getByRole("checkbox", { name: "Manawatū — Location 6" }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText("5 of 5 selected")).toBeTruthy();
  });

  it("normalises the exact PATCH body and saves only once", async () => {
    const updateRequest = deferred<Awaited<ReturnType<typeof updateProfileSettings>>>();
    vi.mocked(updateProfileSettings).mockReturnValue(updateRequest.promise);
    await renderReady();
    const user = userEvent.setup();
    const displayName = screen.getByLabelText("Display name");
    await user.clear(displayName);
    await user.type(displayName, "  Updated   Student  ");
    await user.click(screen.getByRole("radio", { name: "Email" }));
    const save = screen.getByRole("button", { name: "Save profile settings" });
    await user.click(save);
    fireEvent.click(save);

    expect(updateProfileSettings).toHaveBeenCalledOnce();
    expect(updateProfileSettings).toHaveBeenCalledWith({
      displayName: "Updated Student",
      preferredContactMethod: "email",
      preferredCampusLocationIds: [locationIds[0]],
      notificationSettings: profile.notificationSettings,
      expectedUpdatedAt: profile.updatedAt,
    });

    const nextUser = { ...baseUser, profile: { ...baseUser.profile, displayName: "Updated Student", preferredContactMethod: "email" as const } };
    updateRequest.resolve({ user: nextUser, profileUpdatedAt: "2026-08-25T03:30:00.000Z" });
    expect(await screen.findByText("Profile settings saved")).toBeTruthy();
    expect(setAuthenticatedUser).toHaveBeenCalledWith(nextUser);
  });

  it("focuses the first invalid field and preserves input after a field error", async () => {
    await renderReady();
    const user = userEvent.setup();
    const displayName = screen.getByLabelText("Display name");
    await user.clear(displayName);
    await user.type(displayName, "x");
    await user.click(screen.getByRole("button", { name: "Save profile settings" }));
    await waitFor(() => expect(document.activeElement).toBe(displayName));
    expect(updateProfileSettings).not.toHaveBeenCalled();

    await user.clear(displayName);
    await user.type(displayName, "Unsaved Student");
    vi.mocked(updateProfileSettings).mockRejectedValue(
      new BrowserAuthError({
        code: "VALIDATION_ERROR",
        status: 400,
        message: "Invalid profile settings",
        fields: { displayName: ["Display name is unavailable"] },
      }),
    );
    await user.click(screen.getByRole("button", { name: "Save profile settings" }));

    expect(await screen.findByText("Display name is unavailable")).toBeTruthy();
    expect((displayName as HTMLInputElement).value).toBe("Unsaved Student");
  });

  it("offers an explicit reload after a conflict and redirects expired sessions", async () => {
    await renderReady();
    vi.mocked(updateProfileSettings).mockRejectedValueOnce(
      new BrowserAuthError({ code: "PROFILE_CHANGED", status: 409, message: "changed" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save profile settings" }));
    expect(await screen.findByRole("button", { name: "Reload latest profile" })).toBeTruthy();

    const latest = { ...profile, displayName: "Latest Name", updatedAt: "2026-08-25T04:30:00.000Z" };
    vi.mocked(getProfileSettings).mockResolvedValue(latest);
    await userEvent.click(screen.getByRole("button", { name: "Reload latest profile" }));
    await waitFor(() => expect((screen.getByLabelText("Display name") as HTMLInputElement).value).toBe("Latest Name"));

    vi.mocked(updateProfileSettings).mockRejectedValueOnce(
      new BrowserAuthError({ code: "AUTHENTICATION_REQUIRED", status: 401, message: "hidden" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Save profile settings" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("ignores a save response after the authenticated account changes", async () => {
    const updateRequest = deferred<Awaited<ReturnType<typeof updateProfileSettings>>>();
    vi.mocked(updateProfileSettings).mockReturnValue(updateRequest.promise);
    const view = await renderReady();

    await userEvent.click(screen.getByRole("button", { name: "Save profile settings" }));
    const nextUser = { ...baseUser, id: "507f191e810c19729de860ed", email: "other@example.com" };
    vi.mocked(useAuthSession).mockReturnValue(session({ user: nextUser }) as never);
    vi.mocked(getProfileSettings).mockResolvedValue({ ...profile, displayName: "Other User" });
    view.rerender(<ProfileSettingsClient />);

    updateRequest.resolve({ user: baseUser, profileUpdatedAt: "2026-08-25T03:30:00.000Z" });
    await waitFor(() => expect(getProfileSettings).toHaveBeenCalledTimes(2));
    expect(setAuthenticatedUser).not.toHaveBeenCalled();
  });
});
