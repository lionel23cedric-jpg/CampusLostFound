import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/cookie", () => ({ readSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/ai/report-assistant", () => ({
  suggestReportDetails: vi.fn(),
}));

import { suggestReportDetails } from "@/lib/ai/report-assistant";
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";

import { POST } from "./route";

const user = {
  id: "64b64c6f2f4d9f1a2b3c4d51",
  email: "student@example.com",
  role: "student" as const,
  status: "active" as const,
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Student Name",
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

const input = {
  title: "Black laptop charger",
  publicDescription: "A black charger near the library.",
  colors: ["Black"],
  reportType: "lost" as const,
};

const fallback = {
  method: "fallback" as const,
  suggestedDescription: "A black charger near the library. The item is black.",
  suggestedTags: ["charger", "black", "library"],
};

function request(body: unknown = input) {
  return new Request("http://localhost/api/ai/report-assistant", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function expectError(
  response: Response,
  status: number,
  code: string,
  message: string,
) {
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toEqual({
    error: { code, message },
  });
}

describe("report assistant route", () => {
  beforeEach(() => {
    vi.mocked(readSessionCookie).mockReset();
    vi.mocked(getCurrentUser).mockReset();
    vi.mocked(suggestReportDetails).mockReset();
    vi.mocked(readSessionCookie).mockResolvedValue("raw-session-token");
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(suggestReportDetails).mockResolvedValue(fallback);
  });

  it("requires a session before reading report text", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await POST(request());

    await expectError(
      response,
      401,
      "AUTHENTICATION_REQUIRED",
      "Authentication required",
    );
    expect(suggestReportDetails).not.toHaveBeenCalled();
  });

  it("rejects an inactive account", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      ...user,
      status: "suspended",
    });

    const response = await POST(request());

    await expectError(response, 403, "ACCOUNT_UNAVAILABLE", "Account is unavailable");
    expect(getCurrentUser).toHaveBeenCalledWith("raw-session-token", {
      includeInactive: true,
    });
    expect(suggestReportDetails).not.toHaveBeenCalled();
  });

  it("rejects unknown request fields before calling the assistant", async () => {
    const response = await POST(request({ ...input, serialNumber: "private" }));

    expect(response.status).toBe(400);
    expect(suggestReportDetails).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain("private");
  });

  it("returns the validated fallback when local inference is unavailable", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(suggestReportDetails).toHaveBeenCalledWith(input);
    await expect(response.json()).resolves.toEqual(fallback);
  });

  it("hides unexpected failures and invalid service output", async () => {
    vi.mocked(suggestReportDetails).mockResolvedValue({
      ...fallback,
      privateEvidence: "secret",
    } as never);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: {
        code: "AI_ASSISTANT_FAILED",
        message: "Unable to suggest report wording",
      },
    });
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});
