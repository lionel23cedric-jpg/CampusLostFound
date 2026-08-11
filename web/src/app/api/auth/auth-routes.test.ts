import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/service", () => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  logoutUser: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth/cookie", () => ({
  readSessionCookie: vi.fn(),
  setSessionCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
}));

import {
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
} from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import { loginUser, logoutUser, registerUser } from "@/lib/auth/service";

import { POST as loginPost } from "./login/route";
import { POST as logoutPost } from "./logout/route";
import { GET as meGet } from "./me/route";
import { POST as registerPost } from "./register/route";

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

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function malformedJsonRequest(url: string) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });
}

function expectNoSecrets(value: unknown) {
  expect(JSON.stringify(value)).not.toMatch(
    /passwordHash|tokenHash|raw-session-token/,
  );
}

describe("authentication routes", () => {
  beforeEach(() => {
    vi.mocked(registerUser).mockReset();
    vi.mocked(loginUser).mockReset();
    vi.mocked(logoutUser).mockReset();
    vi.mocked(getCurrentUser).mockReset();
    vi.mocked(readSessionCookie).mockReset();
    vi.mocked(setSessionCookie).mockReset();
    vi.mocked(clearSessionCookie).mockReset();

    vi.mocked(readSessionCookie).mockResolvedValue("raw-session-token");
    vi.mocked(setSessionCookie).mockResolvedValue(undefined);
    vi.mocked(clearSessionCookie).mockResolvedValue(undefined);
    vi.mocked(logoutUser).mockResolvedValue(undefined);
  });

  it("registers a student, sets the cookie and returns only safe user data", async () => {
    vi.mocked(registerUser).mockResolvedValue({
      user: safeUser,
      sessionToken: "raw-session-token",
    });

    const response = await registerPost(
      jsonRequest("http://localhost/api/auth/register", {
        email: "student@example.com",
        password: "a secure password",
        displayName: "Student Name",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(setSessionCookie).toHaveBeenCalledWith("raw-session-token");
    expect(body).toEqual({ user: safeUser });
    expectNoSecrets(body);
  });

  it("rejects privileged registration input before calling the service", async () => {
    const response = await registerPost(
      jsonRequest("http://localhost/api/auth/register", {
        email: "student@example.com",
        password: "a secure password",
        displayName: "Student Name",
        role: "administrator",
      }),
    );

    expect(response.status).toBe(400);
    expect(registerUser).not.toHaveBeenCalled();
  });

  it("returns HTTP 400 for malformed registration JSON", async () => {
    const response = await registerPost(
      malformedJsonRequest("http://localhost/api/auth/register"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request",
      },
    });
  });

  it("returns the approved conflict response for duplicate registration", async () => {
    vi.mocked(registerUser).mockRejectedValue(
      new AuthError("EMAIL_ALREADY_REGISTERED"),
    );

    const response = await registerPost(
      jsonRequest("http://localhost/api/auth/register", {
        email: "student@example.com",
        password: "a secure password",
        displayName: "Student Name",
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "EMAIL_ALREADY_REGISTERED",
        message: "Email is already registered",
      },
    });
  });

  it("hides unknown registration failures", async () => {
    vi.mocked(registerUser).mockRejectedValue(
      new Error("mongodb connection details"),
    );

    const response = await registerPost(
      jsonRequest("http://localhost/api/auth/register", {
        email: "student@example.com",
        password: "a secure password",
        displayName: "Student Name",
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "AUTHENTICATION_FAILED",
        message: "Unable to complete authentication request",
      },
    });
  });

  it("logs in, sets the cookie and returns only safe user data", async () => {
    vi.mocked(loginUser).mockResolvedValue({
      user: safeUser,
      sessionToken: "raw-session-token",
    });

    const response = await loginPost(
      jsonRequest("http://localhost/api/auth/login", {
        email: "student@example.com",
        password: "a secure password",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(setSessionCookie).toHaveBeenCalledWith("raw-session-token");
    expect(body).toEqual({ user: safeUser });
    expectNoSecrets(body);
  });

  it("maps invalid credentials exactly without exposing details", async () => {
    vi.mocked(loginUser).mockRejectedValue(
      new AuthError("INVALID_CREDENTIALS"),
    );

    const response = await loginPost(
      jsonRequest("http://localhost/api/auth/login", {
        email: "student@example.com",
        password: "wrong password",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
      },
    });
  });

  it("maps unavailable accounts exactly", async () => {
    vi.mocked(loginUser).mockRejectedValue(
      new AuthError("ACCOUNT_UNAVAILABLE"),
    );

    const response = await loginPost(
      jsonRequest("http://localhost/api/auth/login", {
        email: "student@example.com",
        password: "a secure password",
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "ACCOUNT_UNAVAILABLE",
        message: "Account is unavailable",
      },
    });
  });

  it.each([
    [
      "unknown login fields",
      jsonRequest("http://localhost/api/auth/login", {
        email: "student@example.com",
        password: "a secure password",
        rememberForever: true,
      }),
    ],
    [
      "malformed login JSON",
      malformedJsonRequest("http://localhost/api/auth/login"),
    ],
  ])("returns HTTP 400 for %s", async (_case, request) => {
    const response = await loginPost(request);

    expect(response.status).toBe(400);
    expect(loginUser).not.toHaveBeenCalled();
  });

  it("returns the current safe user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(safeUser);

    const response = await meGet();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(getCurrentUser).toHaveBeenCalledWith("raw-session-token");
    expect(body).toEqual({ user: safeUser });
    expectNoSecrets(body);
  });

  it("returns the approved 401 response when the cookie is missing", async () => {
    vi.mocked(readSessionCookie).mockResolvedValue(undefined);
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await meGet();

    expect(getCurrentUser).toHaveBeenCalledWith(undefined);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Authentication required",
      },
    });
  });

  it("hides unknown current-user failures", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(
      new Error("mongodb connection details"),
    );

    const response = await meGet();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "AUTHENTICATION_FAILED",
        message: "Unable to complete authentication request",
      },
    });
  });

  it("logs out, clears the cookie and returns no body", async () => {
    const response = await logoutPost();

    expect(readSessionCookie).toHaveBeenCalled();
    expect(clearSessionCookie).toHaveBeenCalled();
    expect(logoutUser).toHaveBeenCalledWith("raw-session-token");
    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe("");
  });

  it("logs out idempotently when no cookie exists", async () => {
    vi.mocked(readSessionCookie).mockResolvedValue(undefined);

    const response = await logoutPost();

    expect(clearSessionCookie).toHaveBeenCalled();
    expect(logoutUser).toHaveBeenCalledWith(undefined);
    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe("");
  });

  it("clears the browser cookie and hides details when deletion fails", async () => {
    vi.mocked(logoutUser).mockRejectedValue(new Error("database unavailable"));

    const response = await logoutPost();

    expect(clearSessionCookie).toHaveBeenCalled();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "AUTHENTICATION_FAILED",
        message: "Unable to complete authentication request",
      },
    });
  });
});
