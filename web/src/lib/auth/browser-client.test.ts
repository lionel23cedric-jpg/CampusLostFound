import { afterEach, describe, expect, it, vi } from "vitest";

import type { PublicUser } from "./public-user";

import {
  BrowserAuthError,
  getCurrentAccount,
  loginAccount,
  logoutAccount,
  registerAccount,
} from "./browser-client";

const publicUser = {
  id: "64b64c6f2f4d9f1a2b3c4d51",
  email: "student@example.com",
  role: "student",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: "2026-08-15T02:05:00.000Z",
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
} satisfies PublicUser;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browser authentication client", () => {
  it("posts the exact login payload with same-origin credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ user: publicUser }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      loginAccount({ email: "student@example.com", password: " pass word " }),
    ).resolves.toEqual(publicUser);

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "student@example.com",
        password: " pass word ",
      }),
    });
  });

  it("posts registration without a password confirmation field", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ user: publicUser }, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await registerAccount({
      displayName: "Student Name",
      email: "student@example.com",
      password: "secure pass",
    });

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(requestInit.body))).toEqual({
      displayName: "Student Name",
      email: "student@example.com",
      password: "secure pass",
    });
  });

  it("returns null for an unauthenticated current-user response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: "AUTHENTICATION_REQUIRED",
              message: "Authentication required",
            },
          },
          { status: 401 },
        ),
      ),
    );

    await expect(getCurrentAccount()).resolves.toBeNull();
  });

  it("accepts an empty HTTP 204 logout response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(logoutAccount()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
  });

  it("preserves only a validated public API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: {
              code: "INVALID_CREDENTIALS",
              message: "Invalid email or password",
            },
          },
          { status: 401 },
        ),
      ),
    );

    await expect(
      loginAccount({ email: "student@example.com", password: "wrong pass" }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: "INVALID_CREDENTIALS",
        status: 401,
        message: "Invalid email or password",
      }),
    );
  });

  it.each([
    ["malformed success", Response.json({ user: { passwordHash: "secret" } })],
    ["non-JSON failure", new Response("database trace", { status: 500 })],
  ])("hides %s responses", async (_case, response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    await expect(getCurrentAccount()).rejects.toEqual(
      expect.objectContaining<Partial<BrowserAuthError>>({
        code: "REQUEST_FAILED",
        message: "We could not complete that request. Please try again.",
      }),
    );
  });

  it("hides network exception details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("private network detail")),
    );

    await expect(getCurrentAccount()).rejects.toEqual(
      expect.objectContaining<Partial<BrowserAuthError>>({
        code: "NETWORK_ERROR",
        message: "We could not reach the service. Please try again.",
      }),
    );
  });
});
