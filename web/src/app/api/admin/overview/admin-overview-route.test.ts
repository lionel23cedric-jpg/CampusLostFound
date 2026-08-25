import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/cookie", () => ({ readSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/admin/overview-service", () => ({
  requireAdministrator: vi.fn(),
  getAdministratorOverview: vi.fn(),
}));

import { AdminOverviewError } from "@/lib/admin/errors";
import type { AdministratorOverview } from "@/lib/admin/overview-contract";
import {
  getAdministratorOverview,
  requireAdministrator,
} from "@/lib/admin/overview-service";
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { PublicUser } from "@/lib/auth/public-user";

import { GET } from "./route";

const administrator = {
  id: "64b64c6f2f4d9f1a2b3c4d50",
  email: "admin@example.test",
  role: "administrator",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Admin User",
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

const overview = {
  generatedAt: "2026-08-25T03:30:00.000Z",
  reports: {
    submittedLost: 4,
    submittedFound: 3,
    submittedTotal: 7,
    unresolved: 2,
    recovered: 1,
    matched: 2,
  },
  claims: {
    pending: 2,
    approved: 1,
    rejected: 3,
    withdrawn: 1,
    completed: 2,
    total: 9,
  },
  accounts: { active: 8, suspended: 1, deactivated: 2, total: 11 },
} satisfies AdministratorOverview;

describe("GET /api/admin/overview", () => {
  beforeEach(() => {
    vi.mocked(readSessionCookie).mockReset();
    vi.mocked(getCurrentUser).mockReset();
    vi.mocked(requireAdministrator).mockReset();
    vi.mocked(getAdministratorOverview).mockReset();

    vi.mocked(readSessionCookie).mockResolvedValue("raw-session-token");
    vi.mocked(getCurrentUser).mockResolvedValue(administrator);
    vi.mocked(getAdministratorOverview).mockResolvedValue(overview);
  });

  it("returns the exact overview without browser caching", async () => {
    const response = await GET(
      new Request("http://localhost/api/admin/overview"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(overview);
    expect(readSessionCookie).toHaveBeenCalledOnce();
    expect(getCurrentUser).toHaveBeenCalledWith("raw-session-token");
    expect(requireAdministrator).toHaveBeenCalledWith(administrator);
    expect(getAdministratorOverview).toHaveBeenCalledWith(administrator);
  });

  it("returns a response containing only aggregate fields", async () => {
    const response = await GET(
      new Request("http://localhost/api/admin/overview"),
    );
    const body = await response.json();

    expect(body).toEqual(overview);
    expect(JSON.stringify(body)).not.toMatch(
      /password|token|email|userId|reportId|claimId|verification|__v|raw-session-token/i,
    );
  });

  it("authenticates before rejecting a query", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/admin/overview?metric=reports"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Authentication required",
      },
    });
    expect(requireAdministrator).not.toHaveBeenCalled();
    expect(getAdministratorOverview).not.toHaveBeenCalled();
  });

  it.each([
    ["student", "active"],
    ["staff", "active"],
    ["administrator", "suspended"],
    ["administrator", "deactivated"],
  ] as const)(
    "authorises %s/%s before rejecting a query",
    async (role, status) => {
      const user = { ...administrator, role, status } satisfies PublicUser;
      vi.mocked(getCurrentUser).mockResolvedValue(user);
      vi.mocked(requireAdministrator).mockImplementation(() => {
        throw new AdminOverviewError("ADMINISTRATOR_REQUIRED");
      });

      const response = await GET(
        new Request("http://localhost/api/admin/overview?metric=reports"),
      );

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: {
          code: "ADMINISTRATOR_REQUIRED",
          message: "Administrator access required",
        },
      });
      expect(requireAdministrator).toHaveBeenCalledWith(user);
      expect(getAdministratorOverview).not.toHaveBeenCalled();
    },
  );

  it.each(["?metric=", "?metric=reports", "?metric=reports&metric=claims"])(
    "rejects query %s after authorisation",
    async (query) => {
      const response = await GET(
        new Request(`http://localhost/api/admin/overview${query}`),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: {
          code: "ADMIN_OVERVIEW_INVALID_QUERY",
          message: "Overview query is invalid",
        },
      });
      expect(requireAdministrator).toHaveBeenCalledWith(administrator);
      expect(getAdministratorOverview).not.toHaveBeenCalled();
    },
  );

  it("redacts service failures", async () => {
    vi.mocked(getAdministratorOverview).mockRejectedValue(
      new Error("mongodb://private-host/database?password=PRIVATE-SECRET"),
    );

    const response = await GET(
      new Request("http://localhost/api/admin/overview"),
    );
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({
      error: {
        code: "ADMIN_OVERVIEW_UNAVAILABLE",
        message: "Administrator overview is temporarily unavailable",
      },
    });
    expect(text).not.toMatch(/mongodb|private-host|password|PRIVATE-SECRET|stack/i);
  });

  it.each([
    ["cookie", readSessionCookie],
    ["current user", getCurrentUser],
  ] as const)("redacts unexpected %s failures", async (_label, dependency) => {
    vi.mocked(dependency).mockRejectedValueOnce(
      new Error("PRIVATE-AUTH-FAILURE"),
    );

    const response = await GET(
      new Request("http://localhost/api/admin/overview"),
    );
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toContain("PRIVATE-AUTH-FAILURE");
    expect(getAdministratorOverview).not.toHaveBeenCalled();
  });
});
