import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/moderation/access", () => ({
  getCurrentModerationAdministrator: vi.fn(),
}));
vi.mock("@/lib/moderation/admin-service", () => ({
  listAdminReportFlags: vi.fn(),
}));

import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { getCurrentModerationAdministrator } from "@/lib/moderation/access";
import { listAdminReportFlags } from "@/lib/moderation/admin-service";
import { ModerationError } from "@/lib/moderation/errors";

import * as route from "./route";

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

const flagPage = {
  flags: [],
  pagination: {
    page: 1,
    pageSize: 20 as const,
    totalItems: 0,
    totalPages: 0,
  },
};

async function expectError(
  response: Response,
  status: number,
  code: string,
  message: string,
) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  await expect(response.json()).resolves.toEqual({
    error: { code, message },
  });
}

describe("administrator report flag queue route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentModerationAdministrator).mockResolvedValue(
      administrator,
    );
    vi.mocked(listAdminReportFlags).mockResolvedValue(flagPage);
  });

  it("exports only GET", () => {
    expect(Object.keys(route).sort()).toEqual(["GET"]);
    expect(route).not.toHaveProperty("POST");
    expect(route).not.toHaveProperty("PATCH");
    expect(route).not.toHaveProperty("DELETE");
  });

  it("authorizes before reading the request URL", async () => {
    vi.mocked(getCurrentModerationAdministrator).mockRejectedValue(
      new AuthError("AUTHENTICATION_REQUIRED"),
    );
    const unreadRequest = {
      get url() {
        throw new Error("request URL must not be read");
      },
    } as unknown as Request;

    const response = await route.GET(unreadRequest);

    await expectError(
      response,
      401,
      "AUTHENTICATION_REQUIRED",
      "Authentication required",
    );
    expect(listAdminReportFlags).not.toHaveBeenCalled();
  });

  it.each([
    ["student", "active"],
    ["staff", "active"],
    ["administrator", "suspended"],
    ["administrator", "deactivated"],
  ] as const)("blocks a %s/%s principal before URL access", async () => {
    vi.mocked(getCurrentModerationAdministrator).mockRejectedValue(
      new ModerationError("ADMINISTRATOR_REQUIRED"),
    );
    const unreadRequest = {
      get url() {
        throw new Error("request URL must not be read");
      },
    } as unknown as Request;

    const response = await route.GET(unreadRequest);

    await expectError(
      response,
      403,
      "ADMINISTRATOR_REQUIRED",
      "Administrator access required",
    );
    expect(listAdminReportFlags).not.toHaveBeenCalled();
  });

  it("passes the exact default query", async () => {
    const response = await route.GET(
      new Request("http://localhost/api/admin/report-flags"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(listAdminReportFlags).toHaveBeenCalledWith(administrator, {
      page: 1,
    });
    await expect(response.json()).resolves.toEqual(flagPage);
  });

  it("normalizes the complete query", async () => {
    await route.GET(
      new Request(
        "http://localhost/api/admin/report-flags" +
          "?status=pending&reason=privacy_concern&page=3",
      ),
    );

    expect(listAdminReportFlags).toHaveBeenCalledWith(administrator, {
      status: "pending",
      reason: "privacy_concern",
      page: 3,
    });
  });

  it.each([
    "?ownerId=private",
    "?status=pending&status=actioned",
    "?reason=unknown",
    "?page=-1",
    "?page=01",
  ])("rejects query %s safely", async (query) => {
    const response = await route.GET(
      new Request(`http://localhost/api/admin/report-flags${query}`),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "Moderation request is invalid",
      },
    });
    expect(listAdminReportFlags).not.toHaveBeenCalled();
  });

  it("closes a request URL failure", async () => {
    const unreadable = {
      get url() {
        throw new Error("PRIVATE-URL-DETAIL");
      },
    } as unknown as Request;

    const response = await route.GET(unreadable);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(text)).toEqual({
      error: {
        code: "REPORT_MODERATION_FAILED",
        message: "Report moderation could not be completed",
      },
    });
    expect(text).not.toContain("PRIVATE-URL-DETAIL");
    expect(listAdminReportFlags).not.toHaveBeenCalled();
  });

  it("maps a domain failure exactly", async () => {
    vi.mocked(listAdminReportFlags).mockRejectedValue(
      new ModerationError("ADMINISTRATOR_REQUIRED"),
    );

    const response = await route.GET(
      new Request("http://localhost/api/admin/report-flags"),
    );

    await expectError(
      response,
      403,
      "ADMINISTRATOR_REQUIRED",
      "Administrator access required",
    );
  });

  it("redacts an unknown service failure", async () => {
    vi.mocked(listAdminReportFlags).mockRejectedValue(
      new Error("mongodb://private-host/secret"),
    );

    const response = await route.GET(
      new Request("http://localhost/api/admin/report-flags"),
    );
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(text)).toEqual({
      error: {
        code: "REPORT_MODERATION_FAILED",
        message: "Report moderation could not be completed",
      },
    });
    expect(text).not.toMatch(/private-host|secret/);
  });
});
