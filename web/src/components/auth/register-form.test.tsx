// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));
vi.mock("@/lib/auth/browser-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/browser-client")>(
    "@/lib/auth/browser-client",
  );
  return { ...actual, registerAccount: vi.fn() };
});
vi.mock("./auth-session-provider", () => ({ useAuthSession: vi.fn() }));

import { useRouter } from "next/navigation";
import { BrowserAuthError, registerAccount } from "@/lib/auth/browser-client";

import { useAuthSession } from "./auth-session-provider";
import { RegisterForm } from "./register-form";

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

async function fillForm(values: {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
}) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Display name"), values.displayName);
  await user.type(screen.getByLabelText("Email address"), values.email);
  await user.type(screen.getByLabelText("Password"), values.password);
  await user.type(screen.getByLabelText("Confirm password"), values.confirmPassword);
}

async function fillValidIdentityAndPassword(confirmPassword: string) {
  await fillForm({
    displayName: "Student Name",
    email: "student@example.com",
    password: "secure pass",
    confirmPassword,
  });
}

async function fillAndSubmitValidRegistration() {
  await fillValidIdentityAndPassword("secure pass");
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));
}

it("reports boundary errors and focuses the first invalid control", async () => {
  render(<RegisterForm />);
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));

  expect(registerAccount).not.toHaveBeenCalled();
  expect(screen.getByText("Display name must contain at least 2 characters")).toBeTruthy();
  expect(screen.getByText("Email must be valid")).toBeTruthy();
  expect(screen.getByText("Password must contain at least 10 characters")).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByLabelText("Display name"));
});

it("reports a mismatched confirmation and does not submit", async () => {
  render(<RegisterForm />);
  await fillValidIdentityAndPassword("different pass");
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));

  expect(registerAccount).not.toHaveBeenCalled();
  expect(screen.getByText("Passwords must match")).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByLabelText("Confirm password"));
});

it("sends no confirmation field and preserves password whitespace", async () => {
  vi.mocked(registerAccount).mockResolvedValue(safeUser);
  render(<RegisterForm />);
  await fillForm({
    displayName: " Student Name ",
    email: " STUDENT@EXAMPLE.COM ",
    password: " pass word ",
    confirmPassword: " pass word ",
  });
  await userEvent.click(screen.getByRole("button", { name: "Create account" }));

  await waitFor(() =>
    expect(registerAccount).toHaveBeenCalledWith({
      displayName: "Student Name",
      email: "student@example.com",
      password: " pass word ",
    }),
  );
  expect(JSON.stringify(vi.mocked(registerAccount).mock.calls[0][0])).not.toContain(
    "confirmPassword",
  );
  expect(setAuthenticatedUser).toHaveBeenCalledWith(safeUser);
  expect(replace).toHaveBeenCalledWith("/dashboard");
});

it("shows the safe duplicate-email response and associates it with email", async () => {
  vi.mocked(registerAccount).mockRejectedValue(
    new BrowserAuthError({
      code: "EMAIL_ALREADY_REGISTERED",
      status: 409,
      message: "Email is already registered",
    }),
  );
  render(<RegisterForm />);

  await fillAndSubmitValidRegistration();
  expect((await screen.findByRole("alert")).textContent).toBe("Email is already registered");
  expect(screen.getByLabelText("Email address").getAttribute("aria-invalid")).toBe("true");
});

it("prevents duplicate registration while pending", async () => {
  let resolveRegistration!: (user: typeof safeUser) => void;
  vi.mocked(registerAccount).mockReturnValue(
    new Promise((resolve) => {
      resolveRegistration = resolve;
    }),
  );
  render(<RegisterForm />);

  await fillAndSubmitValidRegistration();
  const button = screen.getByRole("button", { name: /Creating account/ });
  expect(button.hasAttribute("disabled")).toBe(true);
  await userEvent.click(button);
  expect(registerAccount).toHaveBeenCalledOnce();

  resolveRegistration(safeUser);
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
});

it("hides unknown error details", async () => {
  vi.mocked(registerAccount).mockRejectedValue(new Error("private database detail"));
  render(<RegisterForm />);

  await fillAndSubmitValidRegistration();
  expect((await screen.findByRole("alert")).textContent).toBe(
    "We could not complete that request. Please try again.",
  );
});

it("redirects an authenticated session without submitting", async () => {
  mockSession("authenticated");
  render(<RegisterForm />);

  await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"));
  expect(registerAccount).not.toHaveBeenCalled();
});

it("marks both password controls for new-password autofill", () => {
  render(<RegisterForm />);

  expect(screen.getByLabelText("Password").getAttribute("autocomplete")).toBe("new-password");
  expect(screen.getByLabelText("Confirm password").getAttribute("autocomplete")).toBe(
    "new-password",
  );
});
