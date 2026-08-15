// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/browser-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/browser-client")>(
    "@/lib/auth/browser-client",
  );

  return {
    ...actual,
    getCurrentAccount: vi.fn(),
    logoutAccount: vi.fn(),
  };
});

import {
  BrowserAuthError,
  getCurrentAccount,
  logoutAccount,
} from "@/lib/auth/browser-client";

import { AuthSessionProvider, useAuthSession } from "./auth-session-provider";

const safeUser = {
  id: "user-id",
  email: "student@example.com",
  role: "student" as const,
  status: "active" as const,
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Student Name",
    preferredContactMethod: "in_app" as const,
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
};

function Probe() {
  const session = useAuthSession();

  return (
    <div>
      <p>{session.status}</p>
      <p>{session.user?.profile.displayName ?? "no user"}</p>
      <button onClick={() => session.setAuthenticatedUser(safeUser)}>
        Set user
      </button>
      <button onClick={() => void session.refreshSession()}>Retry</button>
      <button
        onClick={() => {
          void session.logout().catch(() => undefined);
        }}
      >
        Logout
      </button>
    </div>
  );
}

afterEach(cleanup);

describe("AuthSessionProvider", () => {
  beforeEach(() => {
    vi.mocked(getCurrentAccount).mockResolvedValue(null);
    vi.mocked(logoutAccount).mockResolvedValue();
  });

  it("resolves an authenticated session", async () => {
    vi.mocked(getCurrentAccount).mockResolvedValue(safeUser);
    render(
      <AuthSessionProvider>
        <Probe />
      </AuthSessionProvider>,
    );

    expect(screen.getByText("loading")).toBeTruthy();
    await screen.findByText("authenticated");
    expect(screen.getByText("Student Name")).toBeTruthy();
  });

  it("resolves a missing session as unauthenticated", async () => {
    render(
      <AuthSessionProvider>
        <Probe />
      </AuthSessionProvider>,
    );

    await screen.findByText("unauthenticated");
  });

  it("marks resolution failures as retryable and retries", async () => {
    vi.mocked(getCurrentAccount)
      .mockRejectedValueOnce(new Error("hidden"))
      .mockResolvedValueOnce(safeUser);
    const user = userEvent.setup();
    render(
      <AuthSessionProvider>
        <Probe />
      </AuthSessionProvider>,
    );

    await screen.findByText("unavailable");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("authenticated");
  });

  it("accepts a safe user after login without refetching", async () => {
    const user = userEvent.setup();
    render(
      <AuthSessionProvider>
        <Probe />
      </AuthSessionProvider>,
    );
    await screen.findByText("unauthenticated");

    await user.click(screen.getByRole("button", { name: "Set user" }));

    expect(screen.getByText("authenticated")).toBeTruthy();
    expect(getCurrentAccount).toHaveBeenCalledOnce();
  });

  it("clears state after logout succeeds", async () => {
    vi.mocked(getCurrentAccount).mockResolvedValue(safeUser);
    const user = userEvent.setup();
    render(
      <AuthSessionProvider>
        <Probe />
      </AuthSessionProvider>,
    );
    await screen.findByText("authenticated");

    await user.click(screen.getByRole("button", { name: "Logout" }));

    await screen.findByText("unauthenticated");
    expect(logoutAccount).toHaveBeenCalledOnce();
  });

  it("retains the user when logout has a network failure", async () => {
    vi.mocked(getCurrentAccount).mockResolvedValue(safeUser);
    vi.mocked(logoutAccount).mockRejectedValue(
      new BrowserAuthError({
        code: "NETWORK_ERROR",
        status: 0,
        message: "We could not reach the service. Please try again.",
      }),
    );
    const user = userEvent.setup();
    render(
      <AuthSessionProvider>
        <Probe />
      </AuthSessionProvider>,
    );
    await screen.findByText("authenticated");

    await user.click(screen.getByRole("button", { name: "Logout" }));

    await waitFor(() => {
      expect(screen.getByText("authenticated")).toBeTruthy();
    });
  });

  it("confirms a cleared cookie after a known server response error", async () => {
    vi.mocked(getCurrentAccount)
      .mockResolvedValueOnce(safeUser)
      .mockResolvedValueOnce(null);
    vi.mocked(logoutAccount).mockRejectedValue(
      new BrowserAuthError({
        code: "AUTHENTICATION_FAILED",
        status: 500,
        message: "Unable to complete authentication request",
      }),
    );
    const user = userEvent.setup();
    render(
      <AuthSessionProvider>
        <Probe />
      </AuthSessionProvider>,
    );
    await screen.findByText("authenticated");

    await user.click(screen.getByRole("button", { name: "Logout" }));

    await screen.findByText("unauthenticated");
    expect(getCurrentAccount).toHaveBeenCalledTimes(2);
  });
});
