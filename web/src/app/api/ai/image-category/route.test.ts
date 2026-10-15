import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/cookie", () => ({ readSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/reports/reference-data", () => ({
  listActiveCategories: vi.fn(),
}));
vi.mock("@/lib/ai/image-classifier", () => ({
  suggestImageCategories: vi.fn(),
}));

import { suggestImageCategories } from "@/lib/ai/image-classifier";
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listActiveCategories } from "@/lib/reports/reference-data";
import { consumeRateLimit, rateLimitPolicies, resetRateLimitsForTests } from "@/lib/rate-limit";
import { REPORT_IMAGE_REQUEST_MAX_BYTES } from "@/lib/reports/photo-reference";

import * as route from "./route";

const user = {
  id: "64b64c6f2f4d9f1a2b3c4d51",
  email: "student@example.com",
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
const categories = [
  {
    id: "0123456789abcdef01234567",
    name: "Electronics",
    description: null,
  },
  { id: "abcdef0123456789abcdef01", name: "Bags", description: null },
];
const result = {
  method: "model_assisted" as const,
  suggestions: [
    {
      categoryId: categories[0].id,
      categoryName: categories[0].name,
      confidence: 0.92,
    },
  ],
};

let png: Uint8Array<ArrayBuffer>;
beforeAll(async () => {
  png = new Uint8Array(await sharp({ create: {
    width: 3, height: 2, channels: 3, background: "#1f6a52",
  } }).png().toBuffer());
});

function imageFile(
  type = "image/png",
  contents: BlobPart[] = [png],
) {
  return new File(contents, "campus-item.png", { type });
}

function request(entries: Array<[string, string | File]>) {
  const form = new FormData();
  for (const [key, value] of entries) form.append(key, value);
  return new Request("http://localhost/api/ai/image-category", {
    method: "POST",
    body: form,
  });
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  await expect(response.json()).resolves.toMatchObject({ error: { code } });
}

describe("image category suggestion route", () => {
  beforeEach(() => {
    resetRateLimitsForTests();
    vi.clearAllMocks();
    vi.mocked(readSessionCookie).mockResolvedValue("session-token");
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(listActiveCategories).mockResolvedValue(categories);
    vi.mocked(suggestImageCategories).mockResolvedValue(result);
  });

  it("exports only POST", () => {
    expect(Object.keys(route)).toEqual(["POST"]);
  });

  it("authenticates before reading the multipart body", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const unreadable = {
      formData() {
        throw new Error("body must not be read");
      },
    } as unknown as Request;

    await expectError(await route.POST(unreadable), 401, "AUTHENTICATION_REQUIRED");
    expect(listActiveCategories).not.toHaveBeenCalled();
  });

  it.each(["suspended", "deactivated"] as const)(
    "rejects an %s account before parsing",
    async (status) => {
      vi.mocked(getCurrentUser).mockResolvedValue({ ...user, status });
      await expectError(
        await route.POST(request([["image", imageFile()]])),
        403,
        "ACTIVE_ACCOUNT_REQUIRED",
      );
      expect(listActiveCategories).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["missing image", []],
    ["unknown field", [["ownerId", user.id]]],
    ["unsupported MIME", [["image", imageFile("image/gif", ["GIF89a"])]]],
  ] as Array<[string, Array<[string, string | File]>]>)(
    "rejects %s",
    async (_label, entries) => {
      await expectError(await route.POST(request(entries)), 400, "AI_IMAGE_INVALID");
      expect(suggestImageCategories).not.toHaveBeenCalled();
    },
  );

  it("rejects empty, corrupt and mismatched image bytes before inference", async () => {
    for (const file of [imageFile("image/png", []), imageFile("image/png", ["not an image"]), imageFile("image/jpeg")]) {
      await expectError(await route.POST(request([["image", file]])), 400, "AI_IMAGE_INVALID");
    }
    expect(listActiveCategories).not.toHaveBeenCalled();
    expect(suggestImageCategories).not.toHaveBeenCalled();
  });

  it("bounds the whole multipart request before parsing", async () => {
    const oversized = new Request("http://localhost/api/ai/image-category", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x" },
      body: new Uint8Array(REPORT_IMAGE_REQUEST_MAX_BYTES + 1),
    });
    await expectError(await route.POST(oversized), 400, "AI_IMAGE_INVALID");
    expect(suggestImageCategories).not.toHaveBeenCalled();
  });

  it("limits repeated inference before reading image bytes", async () => {
    for (let i = 0; i < rateLimitPolicies.aiInference.limit; i += 1) {
      consumeRateLimit(`ai:${user.id}`, rateLimitPolicies.aiInference);
    }
    const response = await route.POST({} as Request);
    await expectError(response, 429, "RATE_LIMITED");
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(suggestImageCategories).not.toHaveBeenCalled();
  });

  it("rejects an image larger than three megabytes", async () => {
    const oversized = imageFile("image/png", [new Uint8Array(3 * 1024 * 1024 + 1)]);
    await expectError(
      await route.POST(request([["image", oversized]])),
      400,
      "AI_IMAGE_INVALID",
    );
    expect(suggestImageCategories).not.toHaveBeenCalled();
  });

  it("reports when no active categories are available", async () => {
    vi.mocked(listActiveCategories).mockResolvedValue([]);
    await expectError(
      await route.POST(request([["image", imageFile()]])),
      422,
      "CATEGORY_UNAVAILABLE",
    );
    expect(suggestImageCategories).not.toHaveBeenCalled();
  });

  it("returns validated top suggestions without retaining the image", async () => {
    const response = await route.POST(request([["image", imageFile()]]));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(result);
    expect(suggestImageCategories).toHaveBeenCalledWith(
      expect.objectContaining({ type: "image/png", size: expect.any(Number) }),
      categories,
    );
  });

  it("returns a safe 200 fallback when the local model is unavailable", async () => {
    vi.mocked(suggestImageCategories).mockResolvedValue({
      method: "fallback",
      suggestions: [],
    });
    const response = await route.POST(request([["image", imageFile()]]));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      method: "fallback",
      suggestions: [],
    });
  });

  it("replaces invalid service output with a generic error", async () => {
    vi.mocked(suggestImageCategories).mockResolvedValue({
      method: "model_assisted",
      suggestions: [{ ...result.suggestions[0], confidence: 2 }],
    });
    const response = await route.POST(request([["image", imageFile()]]));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: "AI_IMAGE_UNAVAILABLE",
        message: "Image category suggestions are temporarily unavailable",
      },
    });
    expect(JSON.stringify(body)).not.toContain("confidence");
  });
});
