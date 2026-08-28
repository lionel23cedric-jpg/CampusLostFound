import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/cookie", () => ({ readSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));

import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { PublicUser } from "@/lib/auth/public-user";

import {
  getCurrentModerationAdministrator,
  getCurrentModerationMember,
  requireModerationAdministrator,
  requireModerationMember,
} from "./access";

function user(
  role: PublicUser["role"],
  status: PublicUser["status"],
): PublicUser {
  return {
    id: "64b64c6f2f4d9f1a2b3c4d51",
    email: "member@example.test",
    role,
    status,
    emailVerifiedAt: null,
    lastLoginAt: null,
    profile: {
      displayName: "Example Member",
      preferredContactMethod: "in_app",
      preferredCampusLocationIds: [],
      notificationSettings: {
        possibleMatches: true,
        claimUpdates: true,
        statusChanges: true,
        handoverInstructions: true,
      },
    },
  };
}

describe("moderation access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readSessionCookie).mockResolvedValue("raw-session-token");
    vi.mocked(getCurrentUser).mockResolvedValue(
      user("administrator", "active"),
    );
  });

  it.each(["student", "staff", "administrator"] as const)(
    "allows active %s member flagging",
    (role) => {
      expect(() => requireModerationMember(user(role, "active"))).not.toThrow();
    },
  );

  it.each(["suspended", "deactivated"] as const)(
    "rejects %s members",
    (status) => {
      expect(() =>
        requireModerationMember(user("student", status)),
      ).toThrow(expect.objectContaining({ code: "ACTIVE_ACCOUNT_REQUIRED" }));
    },
  );

  it("allows only an active administrator", () => {
    expect(() =>
      requireModerationAdministrator(user("administrator", "active")),
    ).not.toThrow();
  });

  it.each([
    ["student", "active"],
    ["staff", "active"],
    ["administrator", "suspended"],
    ["administrator", "deactivated"],
  ] as const)("rejects administrator access for %s/%s", (role, status) => {
    expect(() => requireModerationAdministrator(user(role, status))).toThrow(
      expect.objectContaining({ code: "ADMINISTRATOR_REQUIRED" }),
    );
  });

  it("loads and returns the current active member", async () => {
    const member = user("staff", "active");
    vi.mocked(getCurrentUser).mockResolvedValue(member);

    await expect(getCurrentModerationMember()).resolves.toBe(member);
    expect(readSessionCookie).toHaveBeenCalledOnce();
    expect(getCurrentUser).toHaveBeenCalledWith("raw-session-token", {
      includeInactive: true,
    });
  });

  it("loads and returns the current active administrator", async () => {
    const administrator = user("administrator", "active");
    vi.mocked(getCurrentUser).mockResolvedValue(administrator);

    await expect(getCurrentModerationAdministrator()).resolves.toBe(
      administrator,
    );
    expect(getCurrentUser).toHaveBeenCalledWith("raw-session-token", {
      includeInactive: true,
    });
  });

  it("loads inactive sessions before returning a member role error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(
      user("student", "suspended"),
    );

    await expect(getCurrentModerationMember()).rejects.toMatchObject({
      code: "ACTIVE_ACCOUNT_REQUIRED",
    });
    expect(getCurrentUser).toHaveBeenCalledWith("raw-session-token", {
      includeInactive: true,
    });
  });

  it("loads inactive sessions before returning the administrator role error", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(
      user("administrator", "deactivated"),
    );

    await expect(getCurrentModerationAdministrator()).rejects.toMatchObject({
      code: "ADMINISTRATOR_REQUIRED",
    });
    expect(getCurrentUser).toHaveBeenCalledWith("raw-session-token", {
      includeInactive: true,
    });
  });

  it.each([
    ["member", getCurrentModerationMember],
    ["administrator", getCurrentModerationAdministrator],
  ] as const)("requires authentication for a missing %s", async (_label, load) => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    await expect(load()).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
    });
  });

  it("preserves unknown session failures for the closed route boundary", async () => {
    const failure = new Error("private cookie failure");
    vi.mocked(readSessionCookie).mockRejectedValue(failure);

    await expect(getCurrentModerationMember()).rejects.toBe(failure);
    expect(getCurrentUser).not.toHaveBeenCalled();
  });
});
