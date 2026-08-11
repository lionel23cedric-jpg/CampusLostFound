import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("uses a fresh salt and verifies only the correct password", async () => {
    const first = await hashPassword("correct horse battery staple");
    const second = await hashPassword("correct horse battery staple");

    expect(first).toMatch(/^scrypt\$16384\$8\$1\$[^$]+\$[^$]+$/);
    expect(second).not.toBe(first);
    expect(first).not.toContain("correct horse battery staple");
    await expect(
      verifyPassword("correct horse battery staple", first),
    ).resolves.toBe(true);
    await expect(verifyPassword("wrong password", first)).resolves.toBe(false);
  });

  it.each([
    "",
    "bcrypt$not-scrypt",
    "scrypt$16384$8$1$bad$bad",
    "scrypt$999999$8$1$c2FsdA$a2V5",
  ])("fails safely for malformed stored hash %s", async (storedHash) => {
    await expect(verifyPassword("password", storedHash)).resolves.toBe(false);
  });
});
