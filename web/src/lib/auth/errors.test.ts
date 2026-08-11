import { describe, expect, it } from "vitest";

import { registerSchema } from "./validation";
import {
  AuthError,
  authErrorResponse,
  invalidRequestResponse,
} from "./errors";

describe("authentication errors", () => {
  it("returns field details for a Zod validation error", async () => {
    const parsed = registerSchema.safeParse({});
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("Expected invalid registration");

    const response = invalidRequestResponse(parsed.error);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request",
        fields: {
          email: expect.any(Array),
          password: expect.any(Array),
          displayName: expect.any(Array),
        },
      },
    });
  });

  it.each([
    ["INVALID_CREDENTIALS", 401, "Invalid email or password"],
    ["ACCOUNT_UNAVAILABLE", 403, "Account is unavailable"],
    ["EMAIL_ALREADY_REGISTERED", 409, "Email is already registered"],
    ["AUTHENTICATION_REQUIRED", 401, "Authentication required"],
    [
      "AUTHENTICATION_FAILED",
      500,
      "Unable to complete authentication request",
    ],
  ] as const)(
    "maps the known authentication error %s",
    async (code, status, message) => {
      const response = authErrorResponse(new AuthError(code));

      expect(response.status).toBe(status);
      await expect(response.json()).resolves.toEqual({
        error: { code, message },
      });
    },
  );

  it("returns no field details when no Zod error is provided", async () => {
    const response = invalidRequestResponse();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request",
      },
    });
  });

  it("hides unknown internal errors", async () => {
    const response = authErrorResponse(new Error("mongodb connection text"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "AUTHENTICATION_FAILED",
        message: "Unable to complete authentication request",
      },
    });
  });
});
