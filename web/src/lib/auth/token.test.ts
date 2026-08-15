import { describe, expect, it } from "vitest";

import {
  SESSION_DURATION_SECONDS,
  createSessionExpiry,
  createSessionToken,
  hashSessionToken,
} from "./token";

describe("session token utilities", () => {
  it("creates unpredictable 32-byte base64url tokens", () => {
    const first = createSessionToken();
    const second = createSessionToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });

  it("hashes a token deterministically without retaining the raw value", () => {
    const token = "a".repeat(43);
    const hash = hashSessionToken(token);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken(token)).toBe(hash);
    expect(hash).not.toContain(token);
  });

  it("sets expiry exactly seven days after the supplied time", () => {
    const now = new Date("2026-08-11T00:00:00.000Z");

    expect(SESSION_DURATION_SECONDS).toBe(604800);
    expect(createSessionExpiry(now).toISOString()).toBe(
      "2026-08-18T00:00:00.000Z",
    );
  });
});
