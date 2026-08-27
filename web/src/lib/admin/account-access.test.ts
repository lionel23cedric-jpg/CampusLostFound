import { describe, expect, it } from "vitest";

import type { PublicUser } from "@/lib/auth/public-user";

import { requireAccountAdministrator } from "./account-access";
import { AccountManagementError } from "./account-errors";

function user(
  role: PublicUser["role"],
  status: PublicUser["status"],
): PublicUser {
  return {
    id: "64b64c6f2f4d9f1a2b3c4d51",
    email: "admin@example.test",
    role,
    status,
    emailVerifiedAt: null,
    lastLoginAt: null,
    profile: {
      displayName: "Administrator",
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

describe("administrator account access", () => {
  it("allows an active administrator", () => {
    expect(() =>
      requireAccountAdministrator(user("administrator", "active")),
    ).not.toThrow();
  });

  it.each([
    ["student", "active"],
    ["staff", "active"],
    ["administrator", "suspended"],
    ["administrator", "deactivated"],
  ] as const)("rejects %s/%s", (role, status) => {
    expect(() => requireAccountAdministrator(user(role, status))).toThrow(
      new AccountManagementError("ADMINISTRATOR_REQUIRED"),
    );
  });
});
