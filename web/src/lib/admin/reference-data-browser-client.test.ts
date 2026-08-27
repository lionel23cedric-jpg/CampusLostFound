import { afterEach, describe, expect, it, vi } from "vitest";

import { ADMIN_REFERENCE_DATA_PAGE_SIZE } from "./reference-data-contract";
import {
  BrowserReferenceDataError,
  createAdministratorCampusLocation,
  createAdministratorCategory,
  listAdministratorCampusLocations,
  listAdministratorCategories,
  updateAdministratorCampusLocation,
  updateAdministratorCategory,
} from "./reference-data-browser-client";

const category = {
  id: "64b64c5f2f8f9e0012345678",
  name: "Wallets",
  description: "Wallets and purses",
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-27T01:00:00.000Z",
} as const;

const campusLocation = {
  id: "64b64c5f2f8f9e0012345679",
  campusName: "Auckland",
  locationName: "Library foyer",
  description: "Ground floor entrance",
  isActive: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-27T02:00:00.000Z",
} as const;

const categoryPage = {
  categories: [category],
  page: 1,
  pageSize: ADMIN_REFERENCE_DATA_PAGE_SIZE,
  total: 1,
  totalPages: 1,
} as const;

const campusLocationPage = {
  campusLocations: [campusLocation],
  page: 1,
  pageSize: ADMIN_REFERENCE_DATA_PAGE_SIZE,
  total: 1,
  totalPages: 1,
} as const;

afterEach(() => vi.unstubAllGlobals());

describe("administrator reference-data browser client requests", () => {
  it("lists categories with a canonical encoded query", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(Response.json(categoryPage));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      listAdministratorCategories(
        { q: "wallet & keys", status: "inactive", page: 2 },
        controller.signal,
      ),
    ).resolves.toEqual(categoryPage);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/categories?q=wallet+%26+keys&status=inactive&page=2",
      {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      },
    );
  });

  it("lists campus locations while omitting an absent search", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json(campusLocationPage));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      listAdministratorCampusLocations({ status: "all", page: 1 }),
    ).resolves.toEqual(campusLocationPage);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/campus-locations?status=all&page=1",
      {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        signal: undefined,
      },
    );
  });

  it("creates a category with the exact JSON request", async () => {
    const input = { name: "Wallets", description: "Wallets and purses" };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ category }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(createAdministratorCategory(input)).resolves.toEqual(category);

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/categories", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      cache: "no-store",
      signal: undefined,
      body: JSON.stringify(input),
    });
  });

  it("updates a category with an encoded identifier", async () => {
    const input = { updatedAt: category.updatedAt, isActive: false };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ category }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updateAdministratorCategory("category/id with spaces", input),
    ).resolves.toEqual(category);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/categories/category%2Fid%20with%20spaces",
      {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        cache: "no-store",
        signal: undefined,
        body: JSON.stringify(input),
      },
    );
  });

  it("creates a campus location with the exact JSON request", async () => {
    const controller = new AbortController();
    const input = {
      campusName: "Auckland",
      locationName: "Library foyer",
      description: null,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ campusLocation }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createAdministratorCampusLocation(input, controller.signal),
    ).resolves.toEqual(campusLocation);

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/campus-locations", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify(input),
    });
  });

  it("updates a campus location with an encoded identifier", async () => {
    const input = {
      updatedAt: campusLocation.updatedAt,
      locationName: "Atrium",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ campusLocation }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updateAdministratorCampusLocation("campus/location id", input),
    ).resolves.toEqual(campusLocation);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/campus-locations/campus%2Flocation%20id",
      {
        method: "PATCH",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        cache: "no-store",
        signal: undefined,
        body: JSON.stringify(input),
      },
    );
  });
});

describe("administrator reference-data browser client response validation", () => {
  it.each([
    { ...categoryPage, privateField: "PRIVATE" },
    {
      ...categoryPage,
      categories: [{ ...category, privateField: "PRIVATE" }],
    },
    { ...categoryPage, total: 21, totalPages: 1 },
    {
      ...categoryPage,
      categories: [{ ...category, id: "invalid-id" }],
    },
    {
      ...categoryPage,
      categories: [{ ...category, updatedAt: "not-a-timestamp" }],
    },
  ])("rejects an unsafe category page %#", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));

    const error = await listAdministratorCategories({
      status: "all",
      page: 1,
    }).catch((reason) => reason);

    expectUnavailable(error, 200);
  });

  it.each([
    { category, privateField: "PRIVATE" },
    { category: { ...category, privateField: "PRIVATE" } },
    { category: { ...category, createdAt: "not-a-timestamp" } },
  ])("rejects an unsafe category mutation body %#", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));

    const error = await createAdministratorCategory({
      name: "Wallets",
      description: null,
    }).catch((reason) => reason);

    expectUnavailable(error, 200);
  });

  it.each([
    { campusLocation, privateField: "PRIVATE" },
    { campusLocation: { ...campusLocation, privateField: "PRIVATE" } },
    { campusLocation: { ...campusLocation, id: "invalid-id" } },
  ])("rejects an unsafe campus-location mutation body %#", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));

    const error = await createAdministratorCampusLocation({
      campusName: "Auckland",
      locationName: "Library foyer",
      description: null,
    }).catch((reason) => reason);

    expectUnavailable(error, 200);
  });
});

describe("administrator reference-data browser client errors", () => {
  it.each([
    [
      400,
      "INVALID_REFERENCE_DATA_REQUEST",
      "Reference data request is invalid",
    ],
    [401, "AUTHENTICATION_REQUIRED", "Authentication required"],
    [403, "ADMINISTRATOR_REQUIRED", "Administrator access required"],
    [404, "REFERENCE_DATA_NOT_FOUND", "Reference data not found"],
    [409, "REFERENCE_DATA_DUPLICATE", "Reference data already exists"],
    [409, "REFERENCE_DATA_STATE_CONFLICT", "Reference data has changed"],
    [
      500,
      "REFERENCE_DATA_OPERATION_FAILED",
      "Reference data operation failed",
    ],
  ] as const)(
    "accepts approved %i %s only with its fixed message",
    async (status, code, message) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            Response.json({ error: { code, message } }, { status }),
          ),
      );

      const error = await listAdministratorCategories({
        status: "all",
        page: 1,
      }).catch((reason) => reason);

      expect(error).toBeInstanceOf(BrowserReferenceDataError);
      expect(error).toMatchObject({ code, status, message });
    },
  );

  it.each([
    [403, { error: { code: "ADMINISTRATOR_REQUIRED", message: "PRIVATE" } }],
    [
      401,
      {
        error: {
          code: "ADMINISTRATOR_REQUIRED",
          message: "Administrator access required",
        },
      },
    ],
    [
      409,
      {
        error: {
          code: "REFERENCE_DATA_DUPLICATE",
          message: "Reference data already exists",
          privateField: "PRIVATE",
        },
      },
    ],
    [500, { error: { code: "MONGODB_ERROR", message: "PRIVATE-HOST" } }],
  ])("redacts an unsafe %i error body %#", async (status, body) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json(body, { status })),
    );

    const error = await listAdministratorCategories({
      status: "all",
      page: 1,
    }).catch((reason) => reason);

    expectUnavailable(error, status);
  });

  it("redacts a network rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("PRIVATE-HOST")));

    const error = await listAdministratorCategories({
      status: "all",
      page: 1,
    }).catch((reason) => reason);

    expectUnavailable(error, 0);
  });

  it.each([200, 500])("redacts a non-JSON %i body", async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("PRIVATE-RAW-BODY", { status })),
    );

    const error = await listAdministratorCategories({
      status: "all",
      page: 1,
    }).catch((reason) => reason);

    expectUnavailable(error, status);
  });

  it("preserves an AbortError from fetch by identity", async () => {
    const interrupted = new DOMException("PRIVATE-ABORT", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(interrupted));

    await expect(
      listAdministratorCategories({ status: "all", page: 1 }),
    ).rejects.toBe(interrupted);
  });

  it("preserves an AbortError from a response body by identity", async () => {
    const interrupted = new DOMException("PRIVATE-BODY", "AbortError");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: vi.fn().mockRejectedValue(interrupted),
      }),
    );

    await expect(
      listAdministratorCategories({ status: "all", page: 1 }),
    ).rejects.toBe(interrupted);
  });

  it("normalises a non-Abort fetch rejection after its signal aborts", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("PRIVATE-ABORT-CAUSE")),
    );

    const error = await listAdministratorCategories(
      { status: "all", page: 1 },
      controller.signal,
    ).catch((reason) => reason);

    expectSafeAbort(error);
  });

  it("normalises a non-Abort body rejection after its signal aborts", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockRejectedValue(new Error("PRIVATE-BODY")),
      }),
    );

    const error = await listAdministratorCategories(
      { status: "all", page: 1 },
      controller.signal,
    ).catch((reason) => reason);

    expectSafeAbort(error);
  });
});

function expectUnavailable(error: unknown, status: number) {
  expect(error).toBeInstanceOf(BrowserReferenceDataError);
  expect(error).toMatchObject({
    code: "REFERENCE_DATA_OPERATION_FAILED",
    status,
    message: "Reference data management is temporarily unavailable",
  });
  expect((error as Error).message).not.toMatch(
    /PRIVATE|MONGODB|HOST|password|timestamp|pagination/i,
  );
}

function expectSafeAbort(error: unknown) {
  expect(error).toBeInstanceOf(DOMException);
  expect(error).toMatchObject({
    name: "AbortError",
    message: "The operation was aborted",
  });
  expect((error as Error).message).not.toMatch(/PRIVATE|CAUSE|BODY/i);
}
