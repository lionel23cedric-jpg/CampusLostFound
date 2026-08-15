import { describe, expect, it } from "vitest";

import { validateLoginForm, validateRegisterForm } from "./form-validation";

describe("authentication form validation", () => {
  it("accepts valid login values without trimming password whitespace", () => {
    const result = validateLoginForm({
      email: " STUDENT@EXAMPLE.COM ",
      password: " pass word ",
    });

    expect(result).toEqual({
      success: true,
      data: { email: "student@example.com", password: " pass word " },
    });
  });

  it("maps invalid login fields", () => {
    expect(validateLoginForm({ email: "bad", password: "short" })).toEqual({
      success: false,
      errors: {
        email: "Email must be valid",
        password: "Password must contain at least 10 characters",
      },
    });
  });

  it("accepts registration and removes confirmation from API data", () => {
    expect(
      validateRegisterForm({
        displayName: " Student Name ",
        email: "STUDENT@EXAMPLE.COM",
        password: "secure pass",
        confirmPassword: "secure pass",
      }),
    ).toEqual({
      success: true,
      data: {
        displayName: "Student Name",
        email: "student@example.com",
        password: "secure pass",
      },
    });
  });

  it("reports display name, email, password and confirmation errors", () => {
    expect(
      validateRegisterForm({
        displayName: "x",
        email: "bad",
        password: "short",
        confirmPassword: "different",
      }),
    ).toEqual({
      success: false,
      errors: {
        displayName: "Display name must contain at least 2 characters",
        email: "Email must be valid",
        password: "Password must contain at least 10 characters",
        confirmPassword: "Passwords must match",
      },
    });
  });
});
