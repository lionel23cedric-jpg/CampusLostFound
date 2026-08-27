import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/account-access", () => ({
  requireAccountAdministrator: vi.fn(),
}));
vi.mock("@/lib/admin/account-list-service", () => ({
  listManagedAccounts: vi.fn(),
}));
vi.mock("@/lib/auth/cookie", () => ({ readSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));

import { requireAccountAdministrator } from "@/lib/admin/account-access";
import { AccountManagementError } from "@/lib/admin/account-errors";
import { listManagedAccounts } from "@/lib/admin/account-list-service";
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { PublicUser } from "@/lib/auth/public-user";

import { GET } from "./route";

const administrator = {
  id: "64b64c6f2f4d9f1a2b3c4d51",
  email: "admin@example.test",
  role: "administrator",
  status: "active",
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
} satisfies PublicUser;
const page = {
  accounts: [
    {
      id: "64b64c6f2f4d9f1a2b3c4d52",
      email: "student@example.test",
      displayName: "Example Student",
      role: "student" as const,
      status: "active" as const,
      createdAt: "2026-08-20T01:00:00.000Z",
      lastLoginAt: null,
      updatedAt: "2026-08-27T01:00:00.000Z",
    },
  ],
  pagination: {
    page: 2,
    pageSize: 20 as const,
    totalItems: 21,
    totalPages: 2,
  },
};

describe("administrator account list route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readSessionCookie).mockResolvedValue("raw-session-token");
    vi.mocked(getCurrentUser).mockResolvedValue(administrator);
    vi.mocked(listManagedAccounts).mockResolvedValue(page);
  });

  it("authenticates and authorises before query validation", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const response = await GET(
      new Request("http://localhost/api/admin/accounts?page=0&owner=private"),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(requireAccountAdministrator).not.toHaveBeenCalled();
    expect(listManagedAccounts).not.toHaveBeenCalled();
  });

  it("returns a strict no-store account page", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/admin/accounts?q=Student&role=student&status=active&page=2",
      ),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(requireAccountAdministrator).toHaveBeenCalledWith(administrator);
    expect(listManagedAccounts).toHaveBeenCalledWith(administrator, {
      q: "Student",
      role: "student",
      status: "active",
      page: 2,
    });
    await expect(response.json()).resolves.toEqual(page);
  });

  it.each([
    "?page=0",
    "?page=501",
    "?page=01",
    "?role=administrator",
    "?status=unknown",
    "?q=",
    "?q=a&q=b",
    "?owner=private",
  ])("rejects invalid query %s", async (query) => {
    const response = await GET(
      new Request(`http://localhost/api/admin/accounts${query}`),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: { code: "VALIDATION_ERROR", message: "Request is invalid" },
    });
    expect(listManagedAccounts).not.toHaveBeenCalled();
  });

  it("returns the safe administrator denial", async () => {
    vi.mocked(requireAccountAdministrator).mockImplementationOnce(() => {
      throw new AccountManagementError("ADMINISTRATOR_REQUIRED");
    });
    const response = await GET(
      new Request("http://localhost/api/admin/accounts"),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(listManagedAccounts).not.toHaveBeenCalled();
  });

  it("redacts service failures and private account fields", async () => {
    vi.mocked(listManagedAccounts).mockRejectedValueOnce(
      new Error(
        "mongodb PRIVATE passwordHash tokenHash emailVerifiedAt notificationSettings",
      ),
    );
    const response = await GET(
      new Request("http://localhost/api/admin/accounts"),
    );
    const text = await response.text();
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(text)).toEqual({
      error: {
        code: "ACCOUNT_OPERATION_FAILED",
        message: "Account operation could not be completed",
      },
    });
    expect(text).not.toMatch(
      /mongodb|private|passwordHash|tokenHash|emailVerifiedAt|notificationSettings/,
    );
  });
});
