import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/cookie", () => ({ readSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/reports/image-validation", () => ({
  readAndValidateReportImageFile: vi.fn(),
}));
vi.mock("@/lib/reports/image-upload-service", () => ({
  uploadReportImage: vi.fn(),
}));

import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ReportImageError } from "@/lib/reports/image-errors";
import { uploadReportImage } from "@/lib/reports/image-upload-service";
import { readAndValidateReportImageFile } from "@/lib/reports/image-validation";

import * as route from "./route";

const reportId = "64b64c6f2f4d9f1a2b3c4d51";
const uploadKey = "550e8400-e29b-41d4-a716-446655440000";
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
const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x01]);
const validated = {
  contentType: "image/jpeg" as const,
  byteLength: bytes.length,
  data: bytes,
};
const receipt = {
  url: "/api/report-images/64b64c6f2f4d9f1a2b3c4d54",
  contentType: "image/jpeg" as const,
  byteLength: bytes.length,
};

function context(id = reportId) {
  return { params: Promise.resolve({ id }) };
}

function request(entries: Array<[string, string | File]> = []) {
  const body = new FormData();
  for (const [name, value] of entries) body.append(name, value);
  return new Request(`http://localhost/api/reports/${reportId}/images`, {
    method: "POST",
    body,
  });
}

function validRequest() {
  return request([
    ["image", new File([bytes], "private-name.jpg", { type: "image/jpeg" })],
    ["uploadKey", uploadKey],
  ]);
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  await expect(response.json()).resolves.toMatchObject({ error: { code } });
}

describe("report image upload route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readSessionCookie).mockResolvedValue("session");
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(readAndValidateReportImageFile).mockResolvedValue(validated);
    vi.mocked(uploadReportImage).mockResolvedValue({ image: receipt, created: true });
  });

  it("exports only POST", () => {
    expect(Object.keys(route)).toEqual(["POST"]);
  });

  it("authenticates before reading params or request metadata", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const unreadable = {
      get headers() {
        throw new Error("request metadata must not be read");
      },
    } as unknown as Request;
    const rejectedContext = {
      params: {
        then() {
          throw new Error("params must not be read");
        },
      } as unknown as Promise<{ id: string }>,
    };

    const response = await route.POST(unreadable, rejectedContext);

    await expectError(response, 401, "AUTHENTICATION_REQUIRED");
    expect(readAndValidateReportImageFile).not.toHaveBeenCalled();
  });

  it.each([
    ["staff", "active"],
    ["student", "suspended"],
    ["student", "deactivated"],
  ] as const)("rejects %s/%s before parsing", async (role, status) => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...user, role, status });
    const response = await route.POST(validRequest(), context());
    await expectError(response, 403, "ACCOUNT_UNAVAILABLE");
    expect(readAndValidateReportImageFile).not.toHaveBeenCalled();
  });

  it("rejects an invalid report ID after authentication", async () => {
    const response = await route.POST(validRequest(), context("not-an-id"));
    await expectError(response, 404, "REPORT_NOT_FOUND");
    expect(readAndValidateReportImageFile).not.toHaveBeenCalled();
  });

  it("rejects a non-multipart request", async () => {
    const response = await route.POST(
      new Request("http://localhost/api", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      context(),
    );
    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "IMAGE_CONTENT_INVALID" },
    });
  });

  it.each([
    ["missing image", [["uploadKey", uploadKey]]],
    ["missing key", [["image", new File([bytes], "x.jpg", { type: "image/jpeg" })]]],
    ["unknown field", [["image", new File([bytes], "x.jpg", { type: "image/jpeg" })], ["uploadKey", uploadKey], ["ownerId", user.id]]],
    ["duplicate key", [["image", new File([bytes], "x.jpg", { type: "image/jpeg" })], ["uploadKey", uploadKey], ["uploadKey", uploadKey]]],
  ] as Array<[string, Array<[string, string | File]>]>)(
    "rejects %s",
    async (_label, entries) => {
      const response = await route.POST(request(entries), context());
      expect(response.status).toBe(400);
      expect(readAndValidateReportImageFile).not.toHaveBeenCalled();
      expect(uploadReportImage).not.toHaveBeenCalled();
    },
  );

  it("rejects a non-UUID key before validating bytes", async () => {
    const response = await route.POST(
      request([
        ["image", new File([bytes], "x.jpg", { type: "image/jpeg" })],
        ["uploadKey", "not-a-uuid"],
      ]),
      context(),
    );
    expect(response.status).toBe(400);
    expect(readAndValidateReportImageFile).not.toHaveBeenCalled();
  });

  it.each([[true, 201], [false, 200]] as const)(
    "returns a strict receipt when created=%s",
    async (created, status) => {
      vi.mocked(uploadReportImage).mockResolvedValue({ image: receipt, created });
      const response = await route.POST(validRequest(), context(reportId.toUpperCase()));

      expect(readAndValidateReportImageFile).toHaveBeenCalledOnce();
      expect(uploadReportImage).toHaveBeenCalledWith({
        reportId,
        actorId: user.id,
        uploadKey,
        image: validated,
      });
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toEqual({ image: receipt });
    },
  );

  it("maps known and unknown failures safely", async () => {
    vi.mocked(uploadReportImage)
      .mockRejectedValueOnce(new ReportImageError("IMAGE_LIMIT_REACHED"))
      .mockRejectedValueOnce(new Error("private database host"));

    await expectError(
      await route.POST(validRequest(), context()),
      409,
      "IMAGE_LIMIT_REACHED",
    );
    await expectError(
      await route.POST(validRequest(), context()),
      500,
      "IMAGE_REQUEST_FAILED",
    );
  });
});
