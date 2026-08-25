import { describe, expect, it } from "vitest";

import { AuthError } from "@/lib/auth/errors";

import { MatchingError, matchingErrorResponse } from "./matching-errors";

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

describe("matching errors", () => {
  it("defines exact report matching domain errors", () => {
    expect(new MatchingError("REPORT_NOT_FOUND")).toMatchObject({
      name: "MatchingError",
      code: "REPORT_NOT_FOUND",
      status: 404,
      message: "Report not found",
    });
    expect(new MatchingError("REPORT_NOT_MATCHABLE")).toMatchObject({
      code: "REPORT_NOT_MATCHABLE",
      status: 409,
      message: "Report is not available for matching",
    });
    expect(new MatchingError("MATCHING_FAILED")).toMatchObject({
      code: "MATCHING_FAILED",
      status: 500,
      message: "Unable to find report matches",
    });
  });

  it("preserves only the authentication-required response", async () => {
    await expectError(
      matchingErrorResponse(new AuthError("AUTHENTICATION_REQUIRED")),
      401,
      "AUTHENTICATION_REQUIRED",
      "Authentication required",
    );
  });

  it.each([
    ["missing", "REPORT_NOT_FOUND", 404, "Report not found"],
    [
      "ineligible",
      "REPORT_NOT_MATCHABLE",
      409,
      "Report is not available for matching",
    ],
  ] as const)(
    "maps the %s domain error exactly",
    async (_case, code, status, message) => {
      await expectError(
        matchingErrorResponse(new MatchingError(code)),
        status,
        code,
        message,
      );
    },
  );

  it.each([
    ["arbitrary error", new Error("database connection secret")],
    ["unapproved auth error", new AuthError("AUTHENTICATION_FAILED")],
    [
      "forged object",
      {
        code: "REPORT_NOT_FOUND",
        status: 404,
        message: "forged internal detail",
      },
    ],
    ["primitive", "raw internal detail"],
  ])("hides an %s", async (_case, error) => {
    const response = matchingErrorResponse(error);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: {
        code: "MATCHING_FAILED",
        message: "Unable to find report matches",
      },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /database connection secret|forged internal detail|raw internal detail/,
    );
  });
});
