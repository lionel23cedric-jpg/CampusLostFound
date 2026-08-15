// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/lib/auth/browser-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/browser-client")>(
    "@/lib/auth/browser-client",
  );
  return { ...actual, loginAccount: vi.fn() };
});
vi.mock("./auth-session-provider", () => ({ useAuthSession: vi.fn() }));

import { useRouter } from "next/navigation";
import { BrowserAuthError, loginAccount } from "@/lib/auth/browser-client";

import { useAuthSession } from "./auth-session-provider";
import { LoginForm } from "./login-form";

const replace = vi.fn();
const setAuthenticatedUser = vi.fn();
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

function mockSession(status: "unauthenticated" | "authenticated" = "unauthenticated") {
  vi.mocked(useAuthSession).mockReturnValue({
    status,
    user: status === "authenticated" ? safeUser : null,
    setAuthenticatedUser,
    refreshSession: vi.fn(),
    logout: vi.fn(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRouter).mockReturnValue({ replace } as never);
  mockSession();
});

afterEach(cleanup);

async function submitValidLogin() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email address"), "student@example.com");
  await user.type(screen.getByLabelText("Password"), "secure pass");
  await user.click(screen.getByRole("button", { name: "Sign in securely" }));
}

it("validates empty fields and focuses the first invalid control", async () => {
  render(<LoginForm />);
  await userEvent.click(screen.getByRole("button", { name: "Sign in securely" }));

  expect(loginAccount).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Email address").getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(screen.getByLabelText("Email address"));
});

it("submits transformed email and untouched password once", async () => {
  vi.mocked(loginAccount).mockResolvedValue(safeUser);
  const user = userEvent.setup();
  render(<LoginForm />);

  await user.type(screen.getByLabelText("Email address"), " STUDENT@EXAMPLE.COM ");
  await user.type(screen.getByLabelText("Password"), " pass word ");
  await user.click(screen.getByRole("button", { name: "Sign in securely" }));

  await waitFor(() =>
    expect(loginAccount).toHaveBeenCalledWith({
      email: "student@example.com",
      password: " pass word ",
    }),
  );
  expect(setAuthenticatedUser).toHaveBeenCalledWith(safeUser);
  expect(replace).toHaveBeenCalledWith("/dashboard");
});

it("shows only the safe invalid-credentials message", async () => {
  vi.mocked(loginAccount).mockRejectedValue(
    new BrowserAuthError({
      code: "INVALID_CREDENTIALS",
      status: 401,
      message: "Invalid email or password",
    }),
  );
  render(<LoginForm />);

  await submitValidLogin();
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Invalid email or password",
  );
});

it("disables a pending submission and prevents duplicate requests", async () => {
  let resolveLogin!: (user: typeof safeUser) => void;
  vi.mocked(loginAccount).mockReturnValue(
    new Promise((resolve) => {
      resolveLogin = resolve;
    }),
  );
  render(<LoginForm />);

  await submitValidLogin();
  const button = screen.getByRole("button", { name: /Signing in/ });
  expect(button.hasAttribute("disabled")).toBe(true);
  await userEvent.click(button);
  expect(loginAccount).toHaveBeenCalledOnce();

  resolveLogin(safeUser);
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
});

it.each([
  ["network", new BrowserAuthError({ code: "NETWORK_ERROR", status: 0, message: "private" })],
  ["unknown", new Error("private server trace")],
])("hides %s error details", async (_case, error) => {
  vi.mocked(loginAccount).mockRejectedValue(error);
  render(<LoginForm />);

  await submitValidLogin();
  expect((await screen.findByRole("alert")).textContent).toBe(
    "We could not complete that request. Please try again.",
  );
});

it("redirects an authenticated session without submitting", async () => {
  mockSession("authenticated");
  render(<LoginForm />);

  await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
  expect(loginAccount).not.toHaveBeenCalled();
});

it("provides browser autofill metadata", () => {
  render(<LoginForm />);

  expect(screen.getByLabelText("Email address").getAttribute("autocomplete")).toBe("email");
  expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe(
    "current-password",
  );
});
