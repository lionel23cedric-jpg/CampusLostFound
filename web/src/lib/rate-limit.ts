export type RateLimitPolicy = { limit: number; windowMs: number };

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

export const rateLimitPolicies = {
  login: { limit: 10, windowMs: 15 * 60_000 },
  register: { limit: 5, windowMs: 60 * 60_000 },
  memberWrite: { limit: 30, windowMs: 10 * 60_000 },
  privilegedWrite: { limit: 60, windowMs: 10 * 60_000 },
} as const;

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

function reclaimExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function consumeRateLimit(
  key: string,
  policy: RateLimitPolicy,
  now = Date.now(),
): RateLimitResult {
  const current = buckets.get(key);
  if (current && current.resetAt > now) {
    if (current.count >= policy.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      };
    }
    current.count += 1;
    return { allowed: true };
  }

  if (current) buckets.delete(key);
  if (buckets.size >= MAX_BUCKETS) reclaimExpired(now);
  if (buckets.size >= MAX_BUCKETS) {
    const oldestKey = buckets.keys().next().value as string | undefined;
    if (oldestKey !== undefined) buckets.delete(oldestKey);
  }

  buckets.set(key, { count: 1, resetAt: now + policy.windowMs });
  return { allowed: true };
}

export function clientAddress(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0];
  const address = forwarded?.trim() || request.headers.get("x-real-ip")?.trim();
  return address ? address.slice(0, 128) : "unknown";
}

export function rateLimitedResponse(retryAfterSeconds: number) {
  return Response.json(
    {
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Try again later.",
      },
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "Cache-Control": "no-store",
      },
    },
  );
}

export function resetRateLimitsForTests() {
  buckets.clear();
}

// ponytail: process-local buckets are the course-project baseline; use a shared
// trusted store when deployment uses multiple application instances.
