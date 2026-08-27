import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/reference-data-access", () => ({
  getCurrentReferenceDataAdministrator: vi.fn(),
}));
vi.mock("@/lib/admin/campus-location-service", () => ({
  listAdminCampusLocations: vi.fn(),
  createAdminCampusLocation: vi.fn(),
  updateAdminCampusLocation: vi.fn(),
}));

import { getCurrentReferenceDataAdministrator } from "@/lib/admin/reference-data-access";
import {
  createAdminCampusLocation,
  listAdminCampusLocations,
  updateAdminCampusLocation,
} from "@/lib/admin/campus-location-service";
import { ReferenceDataManagementError } from "@/lib/admin/reference-data-errors";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";

import * as campusLocationMemberRoute from "./[campusLocationId]/route";
import * as campusLocationCollectionRoute from "./route";

const { GET, POST } = campusLocationCollectionRoute;
const { PATCH } = campusLocationMemberRoute;
const id = "64b64c6f2f4d9f1a2b3c4d52";
const administrator = {
  id: "64b64c6f2f4d9f1a2b3c4d50",
  email: "admin@example.test",
  role: "administrator",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Admin User",
    preferredContactMethod: "email",
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
} satisfies PublicUser;
const campusLocation = {
  id,
  campusName: "Auckland",
  locationName: "Library",
  description: null,
  isActive: true,
  createdAt: "2026-08-27T01:00:00.000Z",
  updatedAt: "2026-08-27T02:00:00.000Z",
};

function jsonRequest(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function expectResponse(response: Response, status: number) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
}

describe("administrator CampusLocation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentReferenceDataAdministrator).mockResolvedValue(
      administrator,
    );
  });

  it("exports only the approved methods", () => {
    expect(campusLocationCollectionRoute).toHaveProperty("GET");
    expect(campusLocationCollectionRoute).toHaveProperty("POST");
    expect(campusLocationCollectionRoute).not.toHaveProperty("DELETE");
    expect(campusLocationMemberRoute).toHaveProperty("PATCH");
    expect(campusLocationMemberRoute).not.toHaveProperty("DELETE");
  });

  it("lists a normalized query as a flat page with HTTP 200", async () => {
    vi.mocked(listAdminCampusLocations).mockResolvedValue({
      campusLocations: [campusLocation],
      page: 2,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
    const response = await GET(
      new Request(
        "http://localhost/api/admin/campus-locations?q=%EF%BC%ACibrary++desk&status=inactive&page=2",
      ),
    );
    expectResponse(response, 200);
    expect(listAdminCampusLocations).toHaveBeenCalledWith(administrator, {
      q: "Library desk",
      status: "inactive",
      page: 2,
    });
    await expect(response.json()).resolves.toEqual({
      campusLocations: [campusLocation],
      page: 2,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it("applies strict list-query defaults", async () => {
    vi.mocked(listAdminCampusLocations).mockResolvedValue({
      campusLocations: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    const response = await GET(
      new Request("http://localhost/api/admin/campus-locations"),
    );
    expectResponse(response, 200);
    expect(listAdminCampusLocations).toHaveBeenCalledWith(administrator, {
      status: "all",
      page: 1,
    });
  });

  it("creates an active campus location with HTTP 201", async () => {
    vi.mocked(createAdminCampusLocation).mockResolvedValue(campusLocation);
    const response = await POST(
      new Request("http://localhost/api/admin/campus-locations", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          campusName: " Auckland ",
          locationName: " Library ",
          description: " ",
        }),
      }),
    );
    expectResponse(response, 201);
    expect(createAdminCampusLocation).toHaveBeenCalledWith(administrator, {
      campusName: "Auckland",
      locationName: "Library",
      description: null,
    });
    await expect(response.json()).resolves.toEqual({ campusLocation });
  });

  it("updates with the canonical path ID and exact timestamp", async () => {
    vi.mocked(updateAdminCampusLocation).mockResolvedValue({
      ...campusLocation,
      isActive: false,
    });
    const response = await PATCH(
      jsonRequest(
        `http://localhost/api/admin/campus-locations/${id.toUpperCase()}`,
        "PATCH",
        { updatedAt: campusLocation.updatedAt, isActive: false },
      ),
      { params: Promise.resolve({ campusLocationId: id.toUpperCase() }) },
    );
    expectResponse(response, 200);
    expect(updateAdminCampusLocation).toHaveBeenCalledWith(
      administrator,
      id,
      { updatedAt: campusLocation.updatedAt, isActive: false },
    );
    await expect(response.json()).resolves.toEqual({
      campusLocation: { ...campusLocation, isActive: false },
    });
  });

  it.each([
    ["GET", new AuthError("AUTHENTICATION_REQUIRED"), 401],
    ["GET", new ReferenceDataManagementError("ADMINISTRATOR_REQUIRED"), 403],
    ["POST", new AuthError("AUTHENTICATION_REQUIRED"), 401],
    ["POST", new ReferenceDataManagementError("ADMINISTRATOR_REQUIRED"), 403],
    ["PATCH", new AuthError("AUTHENTICATION_REQUIRED"), 401],
    ["PATCH", new ReferenceDataManagementError("ADMINISTRATOR_REQUIRED"), 403],
  ] as const)(
    "returns safe auth failure for %s before parsing business input",
    async (method, failure, status) => {
      vi.mocked(getCurrentReferenceDataAdministrator).mockRejectedValue(failure);

      const response =
        method === "GET"
          ? await GET(
              new Request(
                "http://localhost/api/admin/campus-locations?page=01",
              ),
            )
          : method === "POST"
            ? await POST(
                new Request("http://localhost/api/admin/campus-locations", {
                  method: "POST",
                  headers: { "content-type": "text/plain" },
                  body: "not-json",
                }),
              )
            : await PATCH(
                new Request(
                  "http://localhost/api/admin/campus-locations/not-an-id",
                  {
                    method: "PATCH",
                    headers: { "content-type": "text/plain" },
                    body: "not-json",
                  },
                ),
                {
                  params: Promise.resolve({
                    campusLocationId: "not-an-id",
                  }),
                },
              );

      expectResponse(response, status);
      expect(listAdminCampusLocations).not.toHaveBeenCalled();
      expect(createAdminCampusLocation).not.toHaveBeenCalled();
      expect(updateAdminCampusLocation).not.toHaveBeenCalled();
    },
  );

  it.each([
    "?page=01",
    "?page=0",
    "?page=10001",
    "?status=archived",
    "?page=1&page=2",
    "?status=active&status=inactive",
    "?unknown=value",
  ])("rejects the list query %s", async (query) => {
    const response = await GET(
      new Request(`http://localhost/api/admin/campus-locations${query}`),
    );

    expectResponse(response, 400);
    expect(listAdminCampusLocations).not.toHaveBeenCalled();
  });

  it.each([
    ["empty", "application/json", " "],
    ["unsupported content type", "text/plain", "{}"],
    ["malformed JSON", "application/json", "{"],
    [
      "unknown authority field",
      "application/json",
      JSON.stringify({
        campusName: "Auckland",
        locationName: "Library",
        administratorId: administrator.id,
      }),
    ],
    [
      "server-owned active field",
      "application/json",
      JSON.stringify({
        campusName: "Auckland",
        locationName: "Library",
        isActive: false,
      }),
    ],
  ])(
    "returns safe 400 for an invalid create body: %s",
    async (_case, type, body) => {
      const response = await POST(
        new Request("http://localhost/api/admin/campus-locations", {
          method: "POST",
          headers: { "content-type": type },
          body,
        }),
      );

      expectResponse(response, 400);
      expect(createAdminCampusLocation).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["above 8 KiB", "a".repeat(8 * 1024 + 1)],
    ["malformed UTF-8", new Uint8Array([0xc3, 0x28])],
  ])("maps the %s body boundary failure to safe 400", async (_case, body) => {
    const response = await POST(
      new Request("http://localhost/api/admin/campus-locations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
    );

    expectResponse(response, 400);
    expect(createAdminCampusLocation).not.toHaveBeenCalled();
  });

  it.each([
    [
      "invalid path",
      "not-an-id",
      { updatedAt: campusLocation.updatedAt, isActive: false },
    ],
    ["missing change", id, { updatedAt: campusLocation.updatedAt }],
    ["missing timestamp", id, { isActive: false }],
    ["invalid timestamp", id, { updatedAt: "yesterday", isActive: false }],
    [
      "unknown authority field",
      id,
      {
        updatedAt: campusLocation.updatedAt,
        administratorId: administrator.id,
      },
    ],
  ])(
    "returns safe 400 for an invalid update: %s",
    async (_case, campusLocationId, body) => {
      const response = await PATCH(
        jsonRequest(
          `http://localhost/api/admin/campus-locations/${campusLocationId}`,
          "PATCH",
          body,
        ),
        { params: Promise.resolve({ campusLocationId }) },
      );

      expectResponse(response, 400);
      expect(updateAdminCampusLocation).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["empty", "application/json", " "],
    ["unsupported content type", "text/plain", "{}"],
    ["malformed JSON", "application/json", "{"],
  ])(
    "returns safe 400 for an invalid update body: %s",
    async (_case, type, body) => {
      const response = await PATCH(
        new Request(`http://localhost/api/admin/campus-locations/${id}`, {
          method: "PATCH",
          headers: { "content-type": type },
          body,
        }),
        { params: Promise.resolve({ campusLocationId: id }) },
      );

      expectResponse(response, 400);
      expect(updateAdminCampusLocation).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["REFERENCE_DATA_NOT_FOUND", 404, "Reference data not found"],
    ["REFERENCE_DATA_DUPLICATE", 409, "Reference data already exists"],
    ["REFERENCE_DATA_STATE_CONFLICT", 409, "Reference data has changed"],
    [
      "REFERENCE_DATA_OPERATION_FAILED",
      500,
      "Reference data operation failed",
    ],
  ] as const)("maps %s to a closed response", async (code, status, message) => {
    vi.mocked(updateAdminCampusLocation).mockRejectedValue(
      new ReferenceDataManagementError(code),
    );

    const response = await PATCH(
      jsonRequest(`http://localhost/api/admin/campus-locations/${id}`, "PATCH", {
        updatedAt: campusLocation.updatedAt,
        description: null,
      }),
      { params: Promise.resolve({ campusLocationId: id }) },
    );

    expectResponse(response, status);
    await expect(response.json()).resolves.toEqual({
      error: { code, message },
    });
  });

  it("redacts an unexpected service failure as a closed 500", async () => {
    vi.mocked(createAdminCampusLocation).mockRejectedValue(
      new Error("mongodb private detail"),
    );

    const response = await POST(
      jsonRequest("http://localhost/api/admin/campus-locations", "POST", {
        campusName: "Auckland",
        locationName: "Library",
      }),
    );

    expectResponse(response, 500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "REFERENCE_DATA_OPERATION_FAILED",
        message: "Reference data operation failed",
      },
    });
  });

  it("maps a rejected parameter promise to a closed 500", async () => {
    const response = await PATCH(
      jsonRequest(`http://localhost/api/admin/campus-locations/${id}`, "PATCH", {
        updatedAt: campusLocation.updatedAt,
        isActive: false,
      }),
      { params: Promise.reject(new Error("private routing detail")) },
    );

    expectResponse(response, 500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "REFERENCE_DATA_OPERATION_FAILED",
        message: "Reference data operation failed",
      },
    });
    expect(updateAdminCampusLocation).not.toHaveBeenCalled();
  });
});
