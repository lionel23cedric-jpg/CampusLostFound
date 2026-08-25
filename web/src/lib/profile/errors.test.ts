import { describe, expect, it } from "vitest";

import { AuthError } from "@/lib/auth/errors";

import {
  InvalidProfileError,
  ProfileError,
  invalidProfileResponse,
  profileErrorResponse,
} from "./errors";
import { updateProfileSchema } from "./validation";

describe("profile errors", () => {
  it.each([
    [
      "PROFILE_CHANGED",
      409,
      "Profile settings changed in another session",
    ],
    ["PROFILE_FAILED", 500, "Unable to manage profile settings"],
  ] as const)("maps the known Profile error %s", async (code, status, message) => {
    const response = profileErrorResponse(new ProfileError(code));

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({
      error: { code, message },
    });
  });

  it("returns only approved field details for service validation", async () => {
    const response = profileErrorResponse(
      new InvalidProfileError({
        preferredCampusLocationIds: ["Choose active campus locations"],
        userId: ["internal identifier"],
      }),
    );

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

  it("returns schema validation fields without internal details", async () => {
    const parsed = updateProfileSchema.safeParse({});
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("Expected invalid profile settings");

    const response = invalidProfileResponse(parsed.error);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid profile settings",
        fields: {
          displayName: expect.any(Array),
          preferredContactMethod: expect.any(Array),
          preferredCampusLocationIds: expect.any(Array),
          notificationSettings: expect.any(Array),
          expectedUpdatedAt: expect.any(Array),
        },
      },
    });
  });

  it("omits field details when none are available", async () => {
    const response = invalidProfileResponse();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid profile settings",
      },
    });
  });

  it("preserves only authentication-required errors", async () => {
    const response = profileErrorResponse(
      new AuthError("AUTHENTICATION_REQUIRED"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Authentication required",
      },
    });
  });

  it.each([
    ["a disallowed authentication error", new AuthError("ACCOUNT_UNAVAILABLE")],
    ["an arbitrary internal error", new Error("mongodb connection text")],
    [
      "a forged Profile-like object",
      { code: "PROFILE_CHANGED", status: 409, message: "forged" },
    ],
  ])("hides %s", async (_case, error) => {
    const response = profileErrorResponse(error);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "PROFILE_FAILED",
        message: "Unable to manage profile settings",
      },
    });
  });
});
