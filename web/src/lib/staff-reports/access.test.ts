import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/cookie", () => ({ readSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));

import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { PublicUser } from "@/lib/auth/public-user";
import { getCurrentStaffReportUser, requireStaffReportUser } from "./access";

const user: PublicUser = {
  id: "64f0123456789abcdef01238",
  email: "staff@example.test",
  role: "staff",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Staff Member",
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

describe("staff report access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readSessionCookie).mockResolvedValue("session-token");
    vi.mocked(getCurrentUser).mockResolvedValue(user);
  });

  it.each(["staff", "administrator"] as const)("allows an active %s", (role) => {
    expect(() => requireStaffReportUser({ ...user, role })).not.toThrow();
  });

  it.each([
    { ...user, role: "student" as const },
    { ...user, status: "suspended" as const },
    { ...user, role: "administrator" as const, status: "deactivated" as const },
  ])("rejects a non-authorised account", (account) => {
    expect(() => requireStaffReportUser(account)).toThrow(
      expect.objectContaining({ code: "STAFF_REPORT_FORBIDDEN", status: 403 }),
    );
  });

  it("resolves the session before checking staff authority", async () => {
    await expect(getCurrentStaffReportUser()).resolves.toBe(user);
    expect(readSessionCookie).toHaveBeenCalledOnce();
    expect(getCurrentUser).toHaveBeenCalledWith("session-token", { includeInactive: true });
  });

  it("treats a missing session user as authentication required", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(getCurrentStaffReportUser()).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
    });
  });

  it("returns forbidden for an inactive authenticated user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...user, status: "suspended" });
    await expect(getCurrentStaffReportUser()).rejects.toMatchObject({
      code: "STAFF_REPORT_FORBIDDEN",
    });
  });
});
