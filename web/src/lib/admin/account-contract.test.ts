import { describe, expect, it } from "vitest";

import {
  accountListQuerySchema,
  accountStatusInputSchema,
  accountUserIdSchema,
  managedAccountPageSchema,
  parseManagedAccountPage,
  toAccountListQueryInput,
  toManagedAccount,
} from "./account-contract";

const id = "64b64c6f2f4d9f1a2b3c4d51";
const createdAt = new Date("2026-08-20T01:00:00.000Z");
const updatedAt = new Date("2026-08-27T01:00:00.000Z");

function accountRow(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => id },
    email: "student@example.test",
    role: "student",
    status: "active",
    createdAt,
    lastLoginAt: null,
    updatedAt,
    displayName: "Example Student",
    ...overrides,
  };
}

describe("administrator account contracts", () => {
  it("normalises and validates the exact list query", () => {
    const params = new URLSearchParams({
      q: "  Example   Student  ",
      role: "student",
      status: "active",
      page: "2",
    });

    expect(
      accountListQuerySchema.parse(toAccountListQueryInput(params)),
    ).toEqual({
      q: "Example Student",
      role: "student",
      status: "active",
      page: 2,
    });
  });

  it.each([
    "?page=0",
    "?page=501",
    "?page=01",
    "?role=administrator",
    "?status=unknown",
    "?q=",
    "?q=a&q=b",
    "?owner=private",
  ])("rejects invalid list query %s", (query) => {
    expect(
      accountListQuerySchema.safeParse(
        toAccountListQueryInput(new URLSearchParams(query)),
      ).success,
    ).toBe(false);
  });

  it("normalises Unicode search text and rejects control characters", () => {
    expect(accountListQuerySchema.parse({ q: "  Ｋｅｙ  " })).toEqual({
      q: "Key",
      page: 1,
    });
    expect(accountListQuerySchema.safeParse({ q: "name\u0000" }).success).toBe(
      false,
    );
  });

  it.each([
    ["suspended", "security_concern"],
    ["suspended", "policy_violation"],
    ["suspended", "administrative_review"],
    ["active", "account_restored"],
    ["deactivated", "account_closed"],
  ])("accepts status %s and controlled reason %s", (status, reason) => {
    expect(
      accountStatusInputSchema.safeParse({
        status,
        expectedUpdatedAt: updatedAt.toISOString(),
        reason,
      }).success,
    ).toBe(true);
  });

  it("rejects unknown mutation fields and malformed identifiers or timestamps", () => {
    expect(
      accountStatusInputSchema.safeParse({
        status: "suspended",
        expectedUpdatedAt: "yesterday",
        reason: "security_concern",
        email: "new@example.test",
      }).success,
    ).toBe(false);
    expect(accountUserIdSchema.safeParse(id).success).toBe(true);
    expect(accountUserIdSchema.safeParse(id.toUpperCase()).success).toBe(false);
  });

  it("parses an exact aggregate page without private fields", () => {
    const page = parseManagedAccountPage(
      [{ accounts: [accountRow()], metadata: [{ totalItems: 1 }] }],
      { page: 1 },
    );

    expect(managedAccountPageSchema.parse(page)).toEqual(page);
    expect(page).toEqual({
      accounts: [
        {
          id,
          email: "student@example.test",
          displayName: "Example Student",
          role: "student",
          status: "active",
          createdAt: createdAt.toISOString(),
          lastLoginAt: null,
          updatedAt: updatedAt.toISOString(),
        },
      ],
      pagination: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      },
    });
    expect(JSON.stringify(page)).not.toMatch(
      /passwordHash|tokenHash|emailVerifiedAt|notificationSettings/,
    );
  });

  it("maps a transaction record through the same public schema", () => {
    expect(
      toManagedAccount(
        accountRow({ lastLoginAt: createdAt }),
        { displayName: "Example Student" },
      ),
    ).toMatchObject({
      id,
      lastLoginAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });
  });

  it("returns a complete empty page and rejects malformed aggregate output", () => {
    expect(
      parseManagedAccountPage([{ accounts: [], metadata: [] }], { page: 3 }),
    ).toEqual({
      accounts: [],
      pagination: {
        page: 3,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
      },
    });
    expect(() =>
      parseManagedAccountPage(
        [
          {
            accounts: [accountRow({ passwordHash: "PRIVATE" })],
            metadata: [],
          },
        ],
        { page: 1 },
      ),
    ).toThrow();
  });

  it("rejects inconsistent pagination totals", () => {
    expect(
      managedAccountPageSchema.safeParse({
        accounts: [],
        pagination: {
          page: 1,
          pageSize: 20,
          totalItems: 21,
          totalPages: 1,
        },
      }).success,
    ).toBe(false);
  });
});
