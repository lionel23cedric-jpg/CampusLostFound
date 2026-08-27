import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/cookie", () => ({ readSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));

import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { PublicUser } from "@/lib/auth/public-user";

import {
  getCurrentReferenceDataAdministrator,
  requireReferenceDataAdministrator,
} from "./reference-data-access";

const administrator = {
  id: "64b64c6f2f4d9f1a2b3c4d50",
  email: "admin@example.test",
  role: "administrator",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Admin User",
    preferredContactMethod: "email",
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
} satisfies PublicUser;

describe("reference data administrator access", () => {
  beforeEach(() => {
    vi.mocked(readSessionCookie).mockResolvedValue("session-token");
    vi.mocked(getCurrentUser).mockResolvedValue(administrator);
  });

  it("returns the active administrator from the current session", async () => {
    await expect(getCurrentReferenceDataAdministrator()).resolves.toBe(
      administrator,
    );
    expect(getCurrentUser).toHaveBeenCalledWith("session-token", {
      includeInactive: true,
    });
  });

  it.each([
    [{ ...administrator, role: "student" as const }, "student"],
    [{ ...administrator, role: "staff" as const }, "staff"],
    [{ ...administrator, status: "suspended" as const }, "suspended"],
    [{ ...administrator, status: "deactivated" as const }, "deactivated"],
  ])("rejects the %s account", (...[user]) => {
    expect(() => requireReferenceDataAdministrator(user)).toThrow(
      expect.objectContaining({ code: "ADMINISTRATOR_REQUIRED" }),
    );
  });

  it("rejects a missing current user as authentication required", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(getCurrentReferenceDataAdministrator()).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
    });
  });

  it.each(["suspended", "deactivated"] as const)(
    "rejects a %s administrator from the current session",
    async (status) => {
      vi.mocked(getCurrentUser).mockResolvedValue({
        ...administrator,
        status,
      });

      await expect(getCurrentReferenceDataAdministrator()).rejects.toMatchObject(
        { code: "ADMINISTRATOR_REQUIRED" },
      );
      expect(getCurrentUser).toHaveBeenCalledWith("session-token", {
        includeInactive: true,
      });
    },
  );
});
