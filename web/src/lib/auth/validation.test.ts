import { describe, expect, it } from "vitest";

import { loginSchema, registerSchema } from "./validation";

describe("authentication validation", () => {
  it("normalises a valid registration", () => {
    expect(
      registerSchema.parse({
        email: "  STUDENT@EXAMPLE.COM ",
        password: "a secure password",
        displayName: "  Student Name  ",
      }),
    ).toEqual({
      email: "student@example.com",
      password: "a secure password",
      displayName: "Student Name",
    });
  });

  it("rejects short passwords", () => {
    expect(
      registerSchema.safeParse({
        email: "student@example.com",
        password: "short",
        displayName: "Student Name",
      }).success,
    ).toBe(false);
  });

  it("preserves intentional registration password whitespace", () => {
    expect(
      registerSchema.parse({
        email: "student@example.com",
        password: " 12345678 ",
        displayName: "Student Name",
      }).password,
    ).toBe(" 12345678 ");
  });

  it.each([
    ["role", "administrator"],
    ["status", "active"],
    ["unknownField", true],
  ])("rejects the unknown registration field %s", (field, value) => {
    expect(
      registerSchema.safeParse({
        email: "student@example.com",
        password: "a secure password",
        displayName: "Student Name",
        [field]: value,
      }).success,
    ).toBe(false);
  });

  it("normalises login email but preserves password whitespace", () => {
    expect(
      loginSchema.parse({
        email: " STUDENT@EXAMPLE.COM ",
        password: "  intentional spaces  ",
      }),
    ).toEqual({
      email: "student@example.com",
      password: "  intentional spaces  ",
    });
  });

  it("rejects unknown login fields", () => {
    expect(
      loginSchema.safeParse({
        email: "student@example.com",
        password: "a secure password",
        rememberForever: true,
      }).success,
    ).toBe(false);
  });
});
