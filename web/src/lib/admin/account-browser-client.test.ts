import { afterEach, describe, expect, it, vi } from "vitest";

import { ACCOUNT_BROWSER_PAGE_SIZE } from "./account-browser-contract";
import {
  BrowserAccountManagementError,
  listAdministratorAccounts,
  updateAdministratorAccountStatus,
} from "./account-browser-client";

const accountFixture = {
  id: "64b64c5f2f8f9e0012345678",
  email: "student@example.test",
  displayName: "Alex Student",
  role: "student",
  status: "active",
  createdAt: "2026-08-01T00:00:00.000Z",
  lastLoginAt: "2026-08-26T02:00:00.000Z",
  updatedAt: "2026-08-27T01:00:00.000Z",
} as const;

const pageFixture = {
  accounts: [accountFixture],
  pagination: {
    page: 1,
    pageSize: ACCOUNT_BROWSER_PAGE_SIZE,
    totalItems: 1,
    totalPages: 1,
  },
} as const;

afterEach(() => vi.unstubAllGlobals());

describe("administrator account browser client", () => {
  it("lists accounts with an encoded exact no-store request", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(Response.json(pageFixture));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      listAdministratorAccounts(
        { q: "Alex Student", role: "student", status: "active", page: 2 },
        controller.signal,
      ),
    ).resolves.toEqual(pageFixture);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/accounts?q=Alex+Student&role=student&status=active&page=2",
      {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      },
    );
  });

  it("omits empty optional list filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(pageFixture));
    vi.stubGlobal("fetch", fetchMock);
    await listAdministratorAccounts({ page: 1 });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/accounts?page=1");
  });

  it.each([
    { ...pageFixture, privateField: "PRIVATE" },
    { ...pageFixture, accounts: [{ ...accountFixture, passwordHash: "PRIVATE" }] },
    {
      ...pageFixture,
      pagination: { ...pageFixture.pagination, totalItems: 21, totalPages: 1 },
    },
  ])("rejects unsafe list body %#", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    const error = await listAdministratorAccounts({ page: 1 }).catch(
      (reason) => reason,
    );
    expect(error).toMatchObject({
      code: "ACCOUNT_OPERATION_FAILED",
      message: "Account management is temporarily unavailable",
    });
    expect(error.message).not.toMatch(/PRIVATE|passwordHash|21/i);
  });
});

it("updates one account with the exact concurrency body", async () => {
  const controller = new AbortController();
  const updated = {
    ...accountFixture,
    status: "suspended" as const,
    updatedAt: "2026-08-27T02:00:00.000Z",
  };
  const fetchMock = vi
    .fn()
    .mockResolvedValue(Response.json({ account: updated }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(
    updateAdministratorAccountStatus(
      accountFixture.id,
      {
        status: "suspended",
        expectedUpdatedAt: accountFixture.updatedAt,
        reason: "administrative_review",
      },
      controller.signal,
    ),
  ).resolves.toEqual(updated);

  expect(fetchMock).toHaveBeenCalledWith(
    `/api/admin/accounts/${accountFixture.id}/status`,
    {
      method: "PATCH",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify({
        status: "suspended",
        expectedUpdatedAt: accountFixture.updatedAt,
        reason: "administrative_review",
      }),
      signal: controller.signal,
    },
  );
});

it.each([
  [400, "VALIDATION_ERROR", "Request is invalid", "Request is invalid"],
  [
    401,
    "AUTHENTICATION_REQUIRED",
    "Authentication required",
    "Authentication required",
  ],
  [
    403,
    "ADMINISTRATOR_REQUIRED",
    "Administrator access required",
    "Administrator access required",
  ],
  [
    403,
    "ACCOUNT_ACTION_FORBIDDEN",
    "Account action is not permitted",
    "Account action is not permitted",
  ],
  [404, "ACCOUNT_NOT_FOUND", "Account not found", "Account not found"],
  [
    409,
    "ACCOUNT_STATE_CONFLICT",
    "Account state has changed or cannot be updated",
    "Account state has changed or cannot be updated",
  ],
  [
    500,
    "ACCOUNT_OPERATION_FAILED",
    "Account operation could not be completed",
    "Account management is temporarily unavailable",
  ],
] as const)(
  "accepts approved %i %s while exposing only its browser message",
  async (status, code, wireMessage, browserMessage) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ error: { code, message: wireMessage } }, { status }),
      ),
    );
    const error = await listAdministratorAccounts({ page: 1 }).catch(
      (reason) => reason,
    );
    expect(error).toMatchObject({
      code,
      status,
      message: browserMessage,
    });
  },
);

it.each([
  [500, { error: { code: "MONGODB_ERROR", message: "PRIVATE-HOST" } }],
  [403, { error: { code: "ADMINISTRATOR_REQUIRED", message: "PRIVATE" } }],
  [200, { account: { ...accountFixture, passwordHash: "PRIVATE" } }],
])("redacts an unsafe %i response", async (status, body) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json(body, { status })),
  );
  const error = await listAdministratorAccounts({ page: 1 }).catch(
    (reason) => reason,
  );
  expect(error).toBeInstanceOf(BrowserAccountManagementError);
  expect(error.message).not.toMatch(/PRIVATE|MONGODB|HOST|passwordHash/i);
});

it("preserves an AbortError", async () => {
  const controller = new AbortController();
  controller.abort();
  const aborted = new DOMException("PRIVATE-ABORT", "AbortError");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(aborted));
  await expect(
    listAdministratorAccounts({ page: 1 }, controller.signal),
  ).rejects.toBe(aborted);
});

it("preserves an actual AbortError from a successful response body", async () => {
  const interrupted = new DOMException("PRIVATE-BODY", "AbortError");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(interrupted),
    }),
  );

  await expect(listAdministratorAccounts({ page: 1 })).rejects.toBe(
    interrupted,
  );
});

it("normalises a non-Abort error from an aborted error response body", async () => {
  const controller = new AbortController();
  controller.abort();
  const interrupted = new Error("PRIVATE-BODY");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(interrupted),
    }),
  );

  const error = await listAdministratorAccounts(
    { page: 1 },
    controller.signal,
  ).catch((reason) => reason);

  expect(error).not.toBe(interrupted);
  expect(error).toBeInstanceOf(DOMException);
  expect(error).toMatchObject({
    name: "AbortError",
    message: "The operation was aborted",
  });
  expect(error.message).not.toMatch(/PRIVATE|BODY/i);
});

it("preserves an actual AbortError from an error response body", async () => {
  const interrupted = new DOMException("PRIVATE-BODY", "AbortError");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(interrupted),
    }),
  );

  await expect(listAdministratorAccounts({ page: 1 })).rejects.toBe(
    interrupted,
  );
});

it("redacts a network rejection", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("PRIVATE-HOST")));

  const error = await listAdministratorAccounts({ page: 1 }).catch(
    (reason) => reason,
  );

  expect(error).toMatchObject({
    code: "ACCOUNT_OPERATION_FAILED",
    status: 0,
    message: "Account management is temporarily unavailable",
  });
  expect(error.message).not.toMatch(/PRIVATE|HOST/i);
});

it.each([200, 500])("redacts a non-JSON %i body", async (status) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("PRIVATE-RAW-BODY", { status })),
  );

  const error = await listAdministratorAccounts({ page: 1 }).catch(
    (reason) => reason,
  );

  expect(error).toMatchObject({
    code: "ACCOUNT_OPERATION_FAILED",
    status,
    message: "Account management is temporarily unavailable",
  });
  expect(error.message).not.toMatch(/PRIVATE|RAW|BODY/i);
});
