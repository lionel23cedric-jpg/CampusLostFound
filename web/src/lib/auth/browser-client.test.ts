import { afterEach, describe, expect, it, vi } from "vitest";

import type { PublicUser } from "./public-user";

import {
  BrowserAuthError,
  getCurrentAccount,
  getProfileSettings,
  loginAccount,
  logoutAccount,
  registerAccount,
  updateProfileSettings,
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

const editableProfile = {
  ...publicUser.profile,
  updatedAt: "2026-08-25T02:30:00.000Z",
};

const profileUpdate = {
  displayName: "Updated Student",
  preferredContactMethod: "email" as const,
  preferredCampusLocationIds: ["507f191e810c19729de860ea"],
  notificationSettings: {
    possibleMatches: true,
    claimUpdates: false,
    statusChanges: true,
    handoverInstructions: false,
  },
  expectedUpdatedAt: editableProfile.updatedAt,
};

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

describe("browser Profile client", () => {
  it("gets Profile settings with exact same-origin options", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ profile: editableProfile }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getProfileSettings()).resolves.toEqual(editableProfile);
    expect(fetchMock).toHaveBeenCalledWith("/api/profile", {
      method: "GET",
      credentials: "same-origin",
    });
  });

  it("patches the exact Profile update and validates the returned session user", async () => {
    const result = {
      user: { ...publicUser, profile: { ...profileUpdate, expectedUpdatedAt: undefined } },
      profileUpdatedAt: "2026-08-25T03:30:00.000Z",
    };
    const safeResult = {
      user: {
        ...publicUser,
        profile: {
          displayName: profileUpdate.displayName,
          preferredContactMethod: profileUpdate.preferredContactMethod,
          preferredCampusLocationIds: profileUpdate.preferredCampusLocationIds,
          notificationSettings: profileUpdate.notificationSettings,
        },
      },
      profileUpdatedAt: result.profileUpdatedAt,
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(safeResult));
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateProfileSettings(profileUpdate)).resolves.toEqual(safeResult);
    expect(fetchMock).toHaveBeenCalledWith("/api/profile", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(profileUpdate),
    });
  });

  it.each([
    ["a missing Profile field", { profile: { updatedAt: editableProfile.updatedAt } }],
    ["an extra Profile field", { profile: { ...editableProfile, userId: "secret" } }],
    ["an invalid timestamp", { profile: { ...editableProfile, updatedAt: "yesterday" } }],
    ["an unknown response field", { profile: editableProfile, PRIVATE_SECRET: true }],
  ])("rejects a successful GET response containing %s", async (_case, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));

    await expect(getProfileSettings()).rejects.toMatchObject({
      code: "REQUEST_FAILED",
      message: "We could not complete that request. Please try again.",
    });
  });

  it.each([
    ["an invalid PublicUser", { user: { passwordHash: "secret" }, profileUpdatedAt: editableProfile.updatedAt }],
    ["a missing update timestamp", { user: publicUser }],
    ["an extra internal field", { user: publicUser, profileUpdatedAt: editableProfile.updatedAt, __v: 1 }],
  ])("rejects a successful PATCH response containing %s", async (_case, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));

    await expect(updateProfileSettings(profileUpdate)).rejects.toMatchObject({
      code: "REQUEST_FAILED",
      message: "We could not complete that request. Please try again.",
    });
  });

  it.each([
    [
      401,
      {
        error: {
          code: "AUTHENTICATION_REQUIRED",
          message: "Authentication required",
        },
      },
    ],
    [
      400,
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid profile settings",
          fields: { displayName: ["Display name is too short"] },
        },
      },
    ],
    [
      409,
      {
        error: {
          code: "PROFILE_CHANGED",
          message: "Profile settings changed in another session",
        },
      },
    ],
    [
      500,
      {
        error: {
          code: "PROFILE_FAILED",
          message: "Unable to manage profile settings",
        },
      },
    ],
  ])("preserves a validated Profile error with HTTP %i", async (status, body) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json(body, { status })),
    );

    await expect(updateProfileSettings(profileUpdate)).rejects.toMatchObject({
      code: body.error.code,
      status,
      message: body.error.message,
      ...("fields" in body.error ? { fields: body.error.fields } : {}),
    });
  });

  it.each([
    ["a non-JSON response", vi.fn().mockResolvedValue(new Response("database trace", { status: 500 }))],
    ["a network exception", vi.fn().mockRejectedValue(new Error("private network detail"))],
  ])("does not leak details from %s", async (_case, fetchMock) => {
    vi.stubGlobal("fetch", fetchMock);

    await expect(getProfileSettings()).rejects.toEqual(
      expect.objectContaining<Partial<BrowserAuthError>>({
        message: expect.not.stringMatching(/database|private network/i),
      }),
    );
  });
});
