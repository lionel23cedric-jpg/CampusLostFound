import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/account-access", () => ({ requireAccountAdministrator: vi.fn() }));
vi.mock("@/lib/admin/account-role-service", () => ({ updateManagedAccountRole: vi.fn() }));
vi.mock("@/lib/auth/cookie", () => ({ readSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));

import { requireAccountAdministrator } from "@/lib/admin/account-access";
import { updateManagedAccountRole } from "@/lib/admin/account-role-service";
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { PublicUser } from "@/lib/auth/public-user";

import { PATCH } from "./route";

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
    notificationSettings: { possibleMatches: true, claimUpdates: true, statusChanges: true, handoverInstructions: true },
  },
} satisfies PublicUser;
const targetId = "64b64c6f2f4d9f1a2b3c4d52";
const body = { role: "staff", expectedUpdatedAt: "2026-09-22T00:00:00.000Z" };
const account = { id: targetId, role: "staff" };
const context = (userId: string) => ({ params: Promise.resolve({ userId }) });
const request = (value: unknown, type = "application/json") => new Request(`http://localhost/api/admin/accounts/${targetId}/role`, {
  method: "PATCH", headers: { "content-type": type }, body: JSON.stringify(value),
});

describe("administrator Staff role route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readSessionCookie).mockResolvedValue("token");
    vi.mocked(getCurrentUser).mockResolvedValue(administrator);
    vi.mocked(updateManagedAccountRole).mockResolvedValue(account as never);
  });

  it("requires the current administrator before validating input", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const response = await PATCH(request({ private: "x" }), context("bad"));
    expect(response.status).toBe(401);
    expect(updateManagedAccountRole).not.toHaveBeenCalled();
  });

  it("updates one role through a no-store JSON response", async () => {
    const response = await PATCH(request(body), context(targetId));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(requireAccountAdministrator).toHaveBeenCalledWith(administrator);
    expect(updateManagedAccountRole).toHaveBeenCalledWith(administrator, targetId, body);
    await expect(response.json()).resolves.toEqual({ account });
  });

  it.each([
    [{ ...body, role: "administrator" }, targetId],
    [{ ...body, actorId: administrator.id }, targetId],
    [{ ...body, expectedUpdatedAt: "yesterday" }, targetId],
    [body, "bad"],
  ])("rejects invalid role request %#", async (value, userId) => {
    const response = await PATCH(request(value), context(userId));
    expect(response.status).toBe(400);
    expect(updateManagedAccountRole).not.toHaveBeenCalled();
  });

  it("redacts unexpected service errors", async () => {
    vi.mocked(updateManagedAccountRole).mockRejectedValue(new Error("PRIVATE DATABASE DETAIL"));
    const response = await PATCH(request(body), context(targetId));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("PRIVATE");
  });
});
