import { describe, expect, it } from "vitest";

import {
  ACCOUNT_BROWSER_PAGE_SIZE,
  accountBrowserSearchSchema,
  managedBrowserAccountPageSchema,
  managedBrowserAccountResponseSchema,
} from "./account-browser-contract";

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

describe("account browser contract", () => {
  it("normalises a valid search", () => {
    expect(accountBrowserSearchSchema.parse("  Alex   Student ")).toBe(
      "Alex Student",
    );
  });

  it.each(["", "   ", "private\u0000query", "x".repeat(81)])(
    "rejects invalid search %j",
    (value) => {
      expect(accountBrowserSearchSchema.safeParse(value).success).toBe(false);
    },
  );

  it("accepts the exact public page and mutation response", () => {
    expect(managedBrowserAccountPageSchema.parse(pageFixture)).toEqual(pageFixture);
    expect(
      managedBrowserAccountResponseSchema.parse({ account: accountFixture }),
    ).toEqual({ account: accountFixture });
  });

  it.each([
    { ...accountFixture, passwordHash: "PRIVATE" },
    { ...accountFixture, tokenHash: "PRIVATE" },
    { ...accountFixture, emailVerifiedAt: null },
    { ...accountFixture, notificationSettings: {} },
    { ...accountFixture, role: "administrator" },
    { ...accountFixture, id: "not-an-object-id" },
    { ...accountFixture, updatedAt: "PRIVATE-DATE" },
  ])("rejects an unsafe account response %#", (account) => {
    expect(
      managedBrowserAccountPageSchema.safeParse({
        ...pageFixture,
        accounts: [account],
      }).success,
    ).toBe(false);
  });

  it("rejects extra page fields and inconsistent pagination", () => {
    expect(
      managedBrowserAccountPageSchema.safeParse({
        ...pageFixture,
        privateField: "PRIVATE",
      }).success,
    ).toBe(false);
    expect(
      managedBrowserAccountPageSchema.safeParse({
        ...pageFixture,
        pagination: { ...pageFixture.pagination, totalItems: 21, totalPages: 1 },
      }).success,
    ).toBe(false);
  });
});
