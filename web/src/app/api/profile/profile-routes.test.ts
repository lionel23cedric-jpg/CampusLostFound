import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/cookie", () => ({ readSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/profile/service", () => ({
  getOwnProfile: vi.fn(),
  updateOwnProfile: vi.fn(),
}));

import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { PublicUser } from "@/lib/auth/public-user";
import { InvalidProfileError, ProfileError } from "@/lib/profile/errors";
import { getOwnProfile, updateOwnProfile } from "@/lib/profile/service";

import { GET, PATCH } from "./route";

const user = {
  id: "507f191e810c19729de860ec",
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
} satisfies PublicUser;

const profile = {
  ...user.profile,
  updatedAt: "2026-08-25T02:30:00.000Z",
};

const validUpdate = {
  displayName: "Updated Student",
  preferredContactMethod: "email" as const,
  preferredCampusLocationIds: ["507f191e810c19729de860ea"],
  notificationSettings: {
    possibleMatches: true,
    claimUpdates: false,
    statusChanges: true,
    handoverInstructions: false,
  },
  expectedUpdatedAt: profile.updatedAt,
};

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function malformedPatchRequest() {
  return new Request("http://localhost/api/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: "{",
  });
}

function expectNoSecrets(value: unknown) {
  expect(JSON.stringify(value)).not.toMatch(
    /password|token|mongodb|userId|__v|PRIVATE_SECRET|raw-session-token/i,
  );
}

describe("Profile routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readSessionCookie).mockResolvedValue("raw-session-token");
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(getOwnProfile).mockResolvedValue(profile);
    vi.mocked(updateOwnProfile).mockResolvedValue({
      user: { ...user, profile: { ...validUpdate, expectedUpdatedAt: undefined } },
      profileUpdatedAt: "2026-08-25T03:30:00.000Z",
    } as never);
  });

  it.each(["student", "staff", "administrator"] as const)(
    "returns the active %s account's editable Profile",
    async (role) => {
      vi.mocked(getCurrentUser).mockResolvedValue({ ...user, role });

      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(readSessionCookie).toHaveBeenCalledOnce();
      expect(getCurrentUser).toHaveBeenCalledWith("raw-session-token");
      expect(getOwnProfile).toHaveBeenCalledWith(user.id);
      expect(body).toEqual({ profile });
      expectNoSecrets(body);
    },
  );

  it.each([
    ["GET", () => GET()],
    ["PATCH", () => PATCH(malformedPatchRequest())],
  ])("requires authentication before %s work", async (_method, handler) => {
    vi.mocked(readSessionCookie).mockResolvedValue(undefined);
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await handler();

    expect(response.status).toBe(401);
    expect(getOwnProfile).not.toHaveBeenCalled();
    expect(updateOwnProfile).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Authentication required",
      },
    });
  });

  it("updates only a strict validated Profile body", async () => {
    const updated = {
      user: {
        ...user,
        profile: {
          displayName: validUpdate.displayName,
          preferredContactMethod: validUpdate.preferredContactMethod,
          preferredCampusLocationIds: validUpdate.preferredCampusLocationIds,
          notificationSettings: validUpdate.notificationSettings,
        },
      },
      profileUpdatedAt: "2026-08-25T03:30:00.000Z",
    };
    vi.mocked(updateOwnProfile).mockResolvedValue(updated);

    const response = await PATCH(patchRequest(validUpdate));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(updateOwnProfile).toHaveBeenCalledWith(user, validUpdate);
    expect(body).toEqual(updated);
    expectNoSecrets(body);
  });

  it("returns the exact malformed-JSON response", async () => {
    const response = await PATCH(malformedPatchRequest());

    expect(response.status).toBe(400);
    expect(updateOwnProfile).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid profile settings",
      },
    });
  });

  it.each([
    ["unknown account fields", { ...validUpdate, role: "administrator" }],
    ["invalid display name", { ...validUpdate, displayName: "x" }],
  ])("rejects %s before the service", async (_case, body) => {
    const response = await PATCH(patchRequest(body));

    expect(response.status).toBe(400);
    expect(updateOwnProfile).not.toHaveBeenCalled();
    const responseBody = await response.json();
    expect(responseBody.error.code).toBe("VALIDATION_ERROR");
    expectNoSecrets(responseBody);
  });

  it("returns safe service field validation", async () => {
    vi.mocked(updateOwnProfile).mockRejectedValue(
      new InvalidProfileError({
        preferredCampusLocationIds: ["Choose active campus locations"],
      }),
    );

    const response = await PATCH(patchRequest(validUpdate));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid profile settings",
        fields: {
          preferredCampusLocationIds: ["Choose active campus locations"],
        },
      },
    });
  });

  it("returns the exact concurrency response", async () => {
    vi.mocked(updateOwnProfile).mockRejectedValue(
      new ProfileError("PROFILE_CHANGED"),
    );

    const response = await PATCH(patchRequest(validUpdate));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "PROFILE_CHANGED",
        message: "Profile settings changed in another session",
      },
    });
  });

  it.each([
    ["GET service", () => GET(), getOwnProfile],
    ["PATCH service SyntaxError", () => PATCH(patchRequest(validUpdate)), updateOwnProfile],
    ["forged domain error", () => GET(), getOwnProfile],
  ])("hides %s details", async (caseName, handler, dependency) => {
    vi.mocked(dependency).mockRejectedValue(
      caseName === "forged domain error"
        ? { code: "PROFILE_CHANGED", message: "forged", status: 409 }
        : caseName.includes("SyntaxError")
          ? new SyntaxError("internal parser detail")
          : new Error("mongodb private detail"),
    );

    const response = await handler();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: {
        code: "PROFILE_FAILED",
        message: "Unable to manage profile settings",
      },
    });
    expectNoSecrets(body);
  });
});
