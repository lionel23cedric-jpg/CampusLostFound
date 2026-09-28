import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/moderation/access", () => ({
  getCurrentModerationAdministrator: vi.fn(),
}));
vi.mock("@/lib/ai/duplicate-detection", () => ({
  scanDuplicateReports: vi.fn(),
}));

import { scanDuplicateReports } from "@/lib/ai/duplicate-detection";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { getCurrentModerationAdministrator } from "@/lib/moderation/access";
import { ModerationError } from "@/lib/moderation/errors";

import * as route from "./route";

const administrator = {
  id: "1".repeat(24),
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

async function expectError(response: Response, status: number, code: string, message: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  await expect(response.json()).resolves.toEqual({ error: { code, message } });
}

describe("administrator duplicate scan route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentModerationAdministrator).mockResolvedValue(administrator);
    vi.mocked(scanDuplicateReports).mockResolvedValue({ pairs: [] });
  });

  it("exports only GET and returns a validated no-store response", async () => {
    expect(Object.keys(route).sort()).toEqual(["GET"]);
    const response = await route.GET(new Request("http://localhost/api/admin/ai/duplicates"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(scanDuplicateReports).toHaveBeenCalledWith(administrator);
    await expect(response.json()).resolves.toEqual({ pairs: [] });
  });

  it("requires authentication before reading query input", async () => {
    vi.mocked(getCurrentModerationAdministrator).mockRejectedValue(
      new AuthError("AUTHENTICATION_REQUIRED"),
    );
    const response = await route.GET({
      get url() { throw new Error("must not read"); },
    } as unknown as Request);
    await expectError(response, 401, "AUTHENTICATION_REQUIRED", "Authentication required");
    expect(scanDuplicateReports).not.toHaveBeenCalled();
  });

  it.each(["student", "staff", "inactive administrator"])(
    "rejects a %s",
    async () => {
      vi.mocked(getCurrentModerationAdministrator).mockRejectedValue(
        new ModerationError("ADMINISTRATOR_REQUIRED"),
      );
      const response = await route.GET(new Request("http://localhost/api/admin/ai/duplicates"));
      await expectError(response, 403, "ADMINISTRATOR_REQUIRED", "Administrator access required");
      expect(scanDuplicateReports).not.toHaveBeenCalled();
    },
  );

  it("strictly rejects every query parameter", async () => {
    const response = await route.GET(
      new Request("http://localhost/api/admin/ai/duplicates?limit=500"),
    );
    await expectError(response, 400, "VALIDATION_ERROR", "Moderation request is invalid");
    expect(scanDuplicateReports).not.toHaveBeenCalled();
  });

  it("redacts service failures", async () => {
    vi.mocked(scanDuplicateReports).mockRejectedValue(new Error("PRIVATE-DB"));
    const response = await route.GET(new Request("http://localhost/api/admin/ai/duplicates"));
    await expectError(
      response,
      500,
      "REPORT_MODERATION_FAILED",
      "Report moderation could not be completed",
    );
  });
});
