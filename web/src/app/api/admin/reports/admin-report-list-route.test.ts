import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/moderation/access", () => ({
  getCurrentModerationAdministrator: vi.fn(),
}));
vi.mock("@/lib/moderation/admin-service", () => ({
  listAdminReports: vi.fn(),
}));

import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { getCurrentModerationAdministrator } from "@/lib/moderation/access";
import { listAdminReports } from "@/lib/moderation/admin-service";
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

const reportPage = {
  reports: [],
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

describe("administrator report queue route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentModerationAdministrator).mockResolvedValue(
      administrator,
    );
    vi.mocked(listAdminReports).mockResolvedValue(reportPage);
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
    expect(listAdminReports).not.toHaveBeenCalled();
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
    expect(listAdminReports).not.toHaveBeenCalled();
  });

  it("passes the exact default query", async () => {
    const response = await route.GET(
      new Request("http://localhost/api/admin/reports"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(listAdminReports).toHaveBeenCalledWith(administrator, { page: 1 });
    await expect(response.json()).resolves.toEqual(reportPage);
  });

  it("normalizes the complete query", async () => {
    await route.GET(
      new Request(
        "http://localhost/api/admin/reports" +
          "?q=%EF%BC%ACaptop++bag&reportType=lost&reportStatus=open" +
          "&moderationStatus=hidden&page=2",
      ),
    );

    expect(listAdminReports).toHaveBeenCalledWith(administrator, {
      q: "Laptop bag",
      reportType: "lost",
      reportStatus: "open",
      moderationStatus: "hidden",
      page: 2,
    });
  });

  it.each([
    "?unknown=value",
    "?q=a&q=b",
    "?page=01",
    "?page=0",
    "?reportStatus=draft",
    "?moderationStatus=removed",
  ])("rejects query %s safely", async (query) => {
    const response = await route.GET(
      new Request(`http://localhost/api/admin/reports${query}`),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "Moderation request is invalid",
      },
    });
    expect(listAdminReports).not.toHaveBeenCalled();
  });

  it("closes a request URL failure", async () => {
    const unreadable = {
      get url() {
        throw new Error("PRIVATE-URL-DETAIL");
      },
    } as unknown as Request;

    const response = await route.GET(unreadable);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: {
        code: "REPORT_MODERATION_FAILED",
        message: "Report moderation could not be completed",
      },
    });
    expect(JSON.stringify(body)).not.toContain("PRIVATE-URL-DETAIL");
    expect(listAdminReports).not.toHaveBeenCalled();
  });

  it("maps a domain failure exactly", async () => {
    vi.mocked(listAdminReports).mockRejectedValue(
      new ModerationError("ADMINISTRATOR_REQUIRED"),
    );

    const response = await route.GET(
      new Request("http://localhost/api/admin/reports"),
    );

    await expectError(
      response,
      403,
      "ADMINISTRATOR_REQUIRED",
      "Administrator access required",
    );
  });

  it("redacts an unknown service failure", async () => {
    vi.mocked(listAdminReports).mockRejectedValue(
      new Error("mongodb://private-host/secret"),
    );

    const response = await route.GET(
      new Request("http://localhost/api/admin/reports"),
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
