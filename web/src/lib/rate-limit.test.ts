import { beforeEach, describe, expect, it } from "vitest";

import {
  clientAddress,
  consumeRateLimit,
  rateLimitedResponse,
  resetRateLimitsForTests,
} from "./rate-limit";

describe("process-local rate limiting", () => {
  beforeEach(resetRateLimitsForTests);

  it("allows the configured count and rejects until the window resets", () => {
    const policy = { limit: 2, windowMs: 60_000 };

    expect(consumeRateLimit("login:test", policy, 1_000)).toEqual({
      allowed: true,
    });
    expect(consumeRateLimit("login:test", policy, 1_001)).toEqual({
      allowed: true,
    });
    expect(consumeRateLimit("login:test", policy, 1_002)).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
    expect(consumeRateLimit("login:test", policy, 61_001)).toEqual({
      allowed: true,
    });
  });

  it("keeps independent keys independent", () => {
    const policy = { limit: 1, windowMs: 1_000 };
    expect(consumeRateLimit("a", policy, 0).allowed).toBe(true);
    expect(consumeRateLimit("a", policy, 1).allowed).toBe(false);
    expect(consumeRateLimit("b", policy, 1).allowed).toBe(true);
  });

  it("bounds stored buckets and reclaims expired entries", () => {
    const policy = { limit: 1, windowMs: 1 };
    for (let index = 0; index < 10_001; index += 1) {
      consumeRateLimit(`key:${index}`, policy, 0);
    }

    expect(consumeRateLimit("fresh", policy, 2).allowed).toBe(true);
    expect(consumeRateLimit("key:0", policy, 2).allowed).toBe(true);
  });

  it("uses the first forwarded address with safe fallbacks", () => {
    expect(
      clientAddress(
        new Request("https://campus-find.test", {
          headers: { "x-forwarded-for": "203.0.113.4, 10.0.0.2" },
        }),
      ),
    ).toBe("203.0.113.4");
    expect(
      clientAddress(
        new Request("https://campus-find.test", {
          headers: { "x-real-ip": "198.51.100.7" },
        }),
      ),
    ).toBe("198.51.100.7");
    expect(clientAddress(new Request("https://campus-find.test"))).toBe(
      "unknown",
    );
  });

  it("returns a safe 429 response with Retry-After", async () => {
    const response = rateLimitedResponse(42);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Try again later.",
      },
    });
  });
});
