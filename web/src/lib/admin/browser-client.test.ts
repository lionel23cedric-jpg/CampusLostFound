import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdministratorOverview } from "./overview-contract";
import {
  BrowserAdminOverviewError,
  getAdministratorOverview,
} from "./browser-client";

const overview = {
  generatedAt: "2026-08-25T03:30:00.000Z",
  reports: {
    submittedLost: 4,
    submittedFound: 3,
    submittedTotal: 7,
    unresolved: 2,
    recovered: 1,
    matched: 2,
  },
  claims: {
    pending: 2,
    approved: 1,
    rejected: 3,
    withdrawn: 1,
    completed: 2,
    total: 9,
  },
  accounts: { active: 8, suspended: 1, deactivated: 2, total: 11 },
} satisfies AdministratorOverview;

afterEach(() => vi.unstubAllGlobals());

describe("administrator overview browser client", () => {
  it("loads the strict overview with the exact no-cache request", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(Response.json(overview));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAdministratorOverview(controller.signal)).resolves.toEqual(
      overview,
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/overview", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });
  });

  it.each([
    ["unknown root field", { ...overview, email: "private@example.test" }],
    [
      "unknown nested field",
      { ...overview, accounts: { ...overview.accounts, userId: "private-id" } },
    ],
    [
      "negative count",
      { ...overview, reports: { ...overview.reports, unresolved: -1 } },
    ],
    [
      "fractional count",
      { ...overview, claims: { ...overview.claims, pending: 0.5 } },
    ],
    [
      "unsafe count",
      {
        ...overview,
        accounts: {
          ...overview.accounts,
          total: Number.MAX_SAFE_INTEGER + 1,
        },
      },
    ],
    ["malformed timestamp", { ...overview, generatedAt: "PRIVATE-DATE" }],
    [
      "inconsistent report total",
      { ...overview, reports: { ...overview.reports, submittedTotal: 999 } },
    ],
    [
      "inconsistent Claim total",
      { ...overview, claims: { ...overview.claims, total: 999 } },
    ],
    [
      "inconsistent account total",
      { ...overview, accounts: { ...overview.accounts, total: 999 } },
    ],
  ])("rejects a %s", async (_label, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));

    const error = await getAdministratorOverview().catch((reason) => reason);

    expect(error).toBeInstanceOf(BrowserAdminOverviewError);
    expect(error).toMatchObject({
      code: "ADMIN_OVERVIEW_UNAVAILABLE",
      status: 200,
      message: "Administrator overview is temporarily unavailable",
    });
    expect(error.message).not.toMatch(/private|email|userId|999|stack/i);
  });

  it.each([
    [401, "AUTHENTICATION_REQUIRED", "Authentication required"],
    [403, "ADMINISTRATOR_REQUIRED", "Administrator access required"],
    [
      500,
      "ADMIN_OVERVIEW_UNAVAILABLE",
      "Administrator overview is temporarily unavailable",
    ],
  ] as const)("preserves approved %i %s", async (status, code, message) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(Response.json({ error: { code, message } }, { status })),
    );

    await expect(getAdministratorOverview()).rejects.toMatchObject({
      code,
      status,
      message,
    });
  });

  it.each([
    [500, { error: { code: "MONGODB_ERROR", message: "PRIVATE-HOST" } }],
    [
      500,
      { error: { code: "ADMIN_OVERVIEW_UNAVAILABLE", message: "PRIVATE" } },
    ],
    [
      403,
      { error: { code: "ADMINISTRATOR_REQUIRED", message: "PRIVATE" } },
    ],
  ])("redacts an unapproved %i response", async (status, body) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json(body, { status })),
    );

    const error = await getAdministratorOverview().catch((reason) => reason);

    expect(error).toMatchObject({
      code: "ADMIN_OVERVIEW_UNAVAILABLE",
      status,
      message: "Administrator overview is temporarily unavailable",
    });
    expect(error.message).not.toMatch(/PRIVATE|MONGODB|HOST/i);
  });

  it("redacts malformed non-JSON failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("PRIVATE-NON-JSON", { status: 500 })),
    );

    const error = await getAdministratorOverview().catch((reason) => reason);

    expect(error).toMatchObject({
      code: "ADMIN_OVERVIEW_UNAVAILABLE",
      status: 500,
    });
    expect(error.message).not.toContain("PRIVATE-NON-JSON");
  });

  it("reduces network failures to the generic safe error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("mongodb://PRIVATE-HOST/database")),
    );

    await expect(getAdministratorOverview()).rejects.toMatchObject({
      code: "ADMIN_OVERVIEW_UNAVAILABLE",
      status: 0,
      message: "Administrator overview is temporarily unavailable",
    });
  });

  it("preserves aborts so the component can ignore them", async () => {
    const controller = new AbortController();
    controller.abort();
    const aborted = new DOMException("PRIVATE-ABORT", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(aborted));

    await expect(getAdministratorOverview(controller.signal)).rejects.toBe(
      aborted,
    );
  });
});
