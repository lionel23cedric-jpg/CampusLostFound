import { describe, expect, it } from "vitest";

import { AuthError } from "@/lib/auth/errors";

import {
  AdminOverviewError,
  adminOverviewErrorResponse,
  invalidAdminOverviewQueryResponse,
} from "./errors";

async function responseBody(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("administrator overview errors", () => {
  it.each([
    [
      new AdminOverviewError("ADMINISTRATOR_REQUIRED"),
      403,
      "ADMINISTRATOR_REQUIRED",
      "Administrator access required",
    ],
    [
      new AdminOverviewError("ADMIN_OVERVIEW_UNAVAILABLE"),
      500,
      "ADMIN_OVERVIEW_UNAVAILABLE",
      "Administrator overview is temporarily unavailable",
    ],
    [
      new AuthError("AUTHENTICATION_REQUIRED"),
      401,
      "AUTHENTICATION_REQUIRED",
      "Authentication required",
    ],
  ] as const)(
    "preserves approved error %#",
    async (error, status, code, message) => {
      const response = adminOverviewErrorResponse(error);
      expect(response.status).toBe(status);
      expect(await responseBody(response)).toEqual({
        error: { code, message },
      });
    },
  );

  it.each([
    new AuthError("ACCOUNT_UNAVAILABLE"),
    new Error("mongodb://private-host/database"),
    { passwordHash: "secret", stack: "private stack" },
    "raw failure",
    null,
  ])("redacts unknown failure %#", async (error) => {
    const response = adminOverviewErrorResponse(error);
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({
      error: {
        code: "ADMIN_OVERVIEW_UNAVAILABLE",
        message: "Administrator overview is temporarily unavailable",
      },
    });
    expect(text).not.toMatch(
      /mongodb|private-host|password|secret|stack|raw failure|account_unavailable/i,
    );
  });

  it("returns the exact invalid-query response", async () => {
    const response = invalidAdminOverviewQueryResponse();
    expect(response.status).toBe(400);
    expect(await responseBody(response)).toEqual({
      error: {
        code: "ADMIN_OVERVIEW_INVALID_QUERY",
        message: "Overview query is invalid",
      },
    });
  });
});
