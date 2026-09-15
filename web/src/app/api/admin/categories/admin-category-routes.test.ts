import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/reference-data-access", () => ({
  getCurrentReferenceDataAdministrator: vi.fn(),
}));
vi.mock("@/lib/admin/category-service", () => ({
  listAdminCategories: vi.fn(),
  createAdminCategory: vi.fn(),
  updateAdminCategory: vi.fn(),
}));

import { getCurrentReferenceDataAdministrator } from "@/lib/admin/reference-data-access";
import {
  createAdminCategory,
  listAdminCategories,
  updateAdminCategory,
} from "@/lib/admin/category-service";
import { ReferenceDataManagementError } from "@/lib/admin/reference-data-errors";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";

import * as categoryMemberRoute from "./[categoryId]/route";
import * as categoryCollectionRoute from "./route";

const { GET, POST } = categoryCollectionRoute;
const { PATCH } = categoryMemberRoute;
const id = "64b64c6f2f4d9f1a2b3c4d51";
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
const category = {
  id,
  name: "Electronics",
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

describe("administrator Category routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentReferenceDataAdministrator).mockResolvedValue(
      administrator,
    );
  });

  it("exports only the approved methods", () => {
    expect(categoryCollectionRoute).toHaveProperty("GET");
    expect(categoryCollectionRoute).toHaveProperty("POST");
    expect(categoryCollectionRoute).not.toHaveProperty("DELETE");
    expect(categoryMemberRoute).toHaveProperty("PATCH");
    expect(categoryMemberRoute).not.toHaveProperty("DELETE");
  });

  it("lists a validated query with HTTP 200 and no-store", async () => {
    vi.mocked(listAdminCategories).mockResolvedValue({
      categories: [category],
      page: 2,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });

    const response = await GET(
      new Request(
        "http://localhost/api/admin/categories?q=Keys&status=active&page=2",
      ),
    );

    expectResponse(response, 200);
    expect(listAdminCategories).toHaveBeenCalledWith(administrator, {
      q: "Keys",
      status: "active",
      page: 2,
    });
    await expect(response.json()).resolves.toEqual({
      categories: [category],
      page: 2,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it("creates a normalized category with HTTP 201 and no-store", async () => {
    vi.mocked(createAdminCategory).mockResolvedValue(category);

    const response = await POST(
      new Request("http://localhost/api/admin/categories", {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          name: " Electronics ",
          description: " ",
        }),
      }),
    );

    expectResponse(response, 201);
    expect(createAdminCategory).toHaveBeenCalledWith(administrator, {
      name: "Electronics",
      description: null,
    });
    await expect(response.json()).resolves.toEqual({ category });
  });

  it("updates with the canonical path ID and exact timestamp", async () => {
    vi.mocked(updateAdminCategory).mockResolvedValue({
      ...category,
      isActive: false,
    });

    const response = await PATCH(
      jsonRequest(
        `http://localhost/api/admin/categories/${id.toUpperCase()}`,
        "PATCH",
        { updatedAt: category.updatedAt, isActive: false },
      ),
      { params: Promise.resolve({ categoryId: id.toUpperCase() }) },
    );

    expectResponse(response, 200);
    expect(updateAdminCategory).toHaveBeenCalledWith(administrator, id, {
      updatedAt: category.updatedAt,
      isActive: false,
    });
    await expect(response.json()).resolves.toEqual({
      category: { ...category, isActive: false },
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
              new Request("http://localhost/api/admin/categories?page=01"),
            )
          : method === "POST"
            ? await POST(
                new Request("http://localhost/api/admin/categories", {
                  method: "POST",
                  headers: { "content-type": "text/plain" },
                  body: "not-json",
                }),
              )
            : await PATCH(
                new Request(
                  "http://localhost/api/admin/categories/not-an-id",
                  {
                    method: "PATCH",
                    headers: { "content-type": "text/plain" },
                    body: "not-json",
                  },
                ),
                { params: Promise.resolve({ categoryId: "not-an-id" }) },
              );

      expectResponse(response, status);
      expect(listAdminCategories).not.toHaveBeenCalled();
      expect(createAdminCategory).not.toHaveBeenCalled();
      expect(updateAdminCategory).not.toHaveBeenCalled();
    },
  );

  it.each([
    "?page=01",
    "?page=0",
    "?page=10001",
    "?status=archived",
    "?status=active&status=inactive",
    "?unknown=value",
  ])("rejects the list query %s", async (query) => {
    const response = await GET(
      new Request(`http://localhost/api/admin/categories${query}`),
    );

    expectResponse(response, 400);
    expect(listAdminCategories).not.toHaveBeenCalled();
  });

  it.each([
    ["empty", "application/json", " "],
    ["unsupported content type", "text/plain", "{}"],
    ["malformed JSON", "application/json", "{"],
    [
      "unknown authority field",
      "application/json",
      JSON.stringify({ name: "Keys", administratorId: administrator.id }),
    ],
    [
      "server-owned active field",
      "application/json",
      JSON.stringify({ name: "Keys", isActive: false }),
    ],
  ])("returns safe 400 for an invalid create body: %s", async (_case, type, body) => {
    const response = await POST(
      new Request("http://localhost/api/admin/categories", {
        method: "POST",
        headers: { "content-type": type },
        body,
      }),
    );

    expectResponse(response, 400);
    expect(createAdminCategory).not.toHaveBeenCalled();
  });

  it.each([
    ["above 8 KiB", "a".repeat(8 * 1024 + 1)],
    ["malformed UTF-8", new Uint8Array([0xc3, 0x28])],
  ])("maps the %s body boundary failure to safe 400", async (_case, body) => {
    const response = await POST(
      new Request("http://localhost/api/admin/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      }),
    );

    expectResponse(response, 400);
    expect(createAdminCategory).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid path", "not-an-id", { updatedAt: category.updatedAt, isActive: false }],
    ["missing change", id, { updatedAt: category.updatedAt }],
    [
      "unknown field",
      id,
      { updatedAt: category.updatedAt, administratorId: administrator.id },
    ],
  ])("returns safe 400 for an invalid update: %s", async (_case, categoryId, body) => {
    const response = await PATCH(
      jsonRequest(
        `http://localhost/api/admin/categories/${categoryId}`,
        "PATCH",
        body,
      ),
      { params: Promise.resolve({ categoryId }) },
    );

    expectResponse(response, 400);
    expect(updateAdminCategory).not.toHaveBeenCalled();
  });

  it.each([
    ["empty", "application/json", " "],
    ["unsupported content type", "text/plain", "{}"],
    ["malformed JSON", "application/json", "{"],
  ])("returns safe 400 for an invalid update body: %s", async (_case, type, body) => {
    const response = await PATCH(
      new Request(`http://localhost/api/admin/categories/${id}`, {
        method: "PATCH",
        headers: { "content-type": type },
        body,
      }),
      { params: Promise.resolve({ categoryId: id }) },
    );

    expectResponse(response, 400);
    expect(updateAdminCategory).not.toHaveBeenCalled();
  });

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
    vi.mocked(updateAdminCategory).mockRejectedValue(
      new ReferenceDataManagementError(code),
    );

    const response = await PATCH(
      jsonRequest(`http://localhost/api/admin/categories/${id}`, "PATCH", {
        updatedAt: category.updatedAt,
        description: null,
      }),
      { params: Promise.resolve({ categoryId: id }) },
    );

    expectResponse(response, status);
    await expect(response.json()).resolves.toEqual({
      error: { code, message },
    });
  });

  it("redacts an unexpected service failure as a closed 500", async () => {
    vi.mocked(createAdminCategory).mockRejectedValue(
      new Error("mongodb private detail"),
    );

    const response = await POST(
      jsonRequest("http://localhost/api/admin/categories", "POST", {
        name: "Keys",
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
      jsonRequest(`http://localhost/api/admin/categories/${id}`, "PATCH", {
        updatedAt: category.updatedAt,
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
    expect(updateAdminCategory).not.toHaveBeenCalled();
  });
});
