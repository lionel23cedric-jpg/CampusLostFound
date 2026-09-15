import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/cookie", () => ({ readSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/reports/image-read-service", () => ({ readReportImage: vi.fn() }));

import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ReportImageError } from "@/lib/reports/image-errors";
import { readReportImage } from "@/lib/reports/image-read-service";

import * as route from "./route";

const imageId = "64b64c6f2f4d9f1a2b3c4d51";
const user = {
  id: "64b64c6f2f4d9f1a2b3c4d52",
  email: "student@example.test",
  role: "student" as const,
  status: "active" as const,
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Student",
    preferredContactMethod: "in_app" as const,
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
};
const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0x01]);

function context(id = imageId) {
  return { params: Promise.resolve({ imageId: id }) };
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  await expect(response.json()).resolves.toMatchObject({ error: { code } });
}

describe("report image read route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readSessionCookie).mockResolvedValue("session");
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(readReportImage).mockResolvedValue({
      contentType: "image/jpeg",
      byteLength: bytes.length,
      data: Buffer.from(bytes),
    });
  });

  it("exports only GET", () => {
    expect(Object.keys(route)).toEqual(["GET"]);
  });

  it("authenticates before reading the image ID", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const unreadContext = {
      params: {
        then() {
          throw new Error("image ID must not be read");
        },
      } as unknown as Promise<{ imageId: string }>,
    };

    const response = await route.GET(new Request("http://localhost"), unreadContext);
    await expectError(response, 401, "AUTHENTICATION_REQUIRED");
    expect(readReportImage).not.toHaveBeenCalled();
    expect(getCurrentUser).toHaveBeenCalledWith("session", { includeInactive: true });
  });

  it.each(["suspended", "deactivated"] as const)(
    "rejects a %s account",
    async (status) => {
      vi.mocked(getCurrentUser).mockResolvedValue({ ...user, status });
      const response = await route.GET(new Request("http://localhost"), context());
      await expectError(response, 403, "ACCOUNT_UNAVAILABLE");
      expect(readReportImage).not.toHaveBeenCalled();
    },
  );

  it("makes malformed and missing image IDs indistinguishable", async () => {
    const malformed = await route.GET(
      new Request("http://localhost"),
      context("not-an-id"),
    );
    await expectError(malformed, 404, "REPORT_IMAGE_NOT_FOUND");

    vi.mocked(readReportImage).mockRejectedValue(
      new ReportImageError("REPORT_IMAGE_NOT_FOUND"),
    );
    const missing = await route.GET(new Request("http://localhost"), context());
    await expectError(missing, 404, "REPORT_IMAGE_NOT_FOUND");
  });

  it("returns exact protected bytes and security headers", async () => {
    const response = await route.GET(
      new Request("http://localhost"),
      context(imageId.toUpperCase()),
    );

    expect(readReportImage).toHaveBeenCalledWith({
      imageId,
      actorId: user.id,
      actorRole: "student",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("content-length")).toBe("4");
    expect(response.headers.get("content-disposition")).toBe("inline");
    expect(response.headers.get("cache-control")).toBe(
      "private, max-age=300, no-transform",
    );
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).not.toContain("filename");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it("closes an unknown read failure", async () => {
    vi.mocked(readReportImage).mockRejectedValue(new Error("private db host"));
    await expectError(
      await route.GET(new Request("http://localhost"), context()),
      500,
      "IMAGE_REQUEST_FAILED",
    );
  });
});
