# Security and Data Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the audited dependency vulnerabilities, strip image metadata, bound JSON inputs consistently, add basic abuse protection, and provide safe repeatable database setup and legacy-image auditing.

**Architecture:** Keep security checks at shared trust-boundary utilities and reuse them from routes. Use the already-required Sharp image pipeline, a bounded process-local rate limiter suitable for the assessed single-instance application, and explicit opt-in database scripts that never run during tests or application startup.

**Tech Stack:** Next.js Route Handlers, TypeScript, Node.js crypto/streams, Sharp, Mongoose/MongoDB, Zod, Vitest, npm audit.

## Global Constraints

- Work only under `D:\Massey`.
- Never read, print, commit, or copy `.env.local` credentials.
- Do not connect to Atlas from automated tests.
- Do not run a database mutation script without separate explicit approval.
- Keep image upload at five files and 3 MB stored bytes per image.
- Ordinary JSON request bodies use one 16 KB UTF-8 limit.
- Return 413 for an oversized body and 429 with `Retry-After` for a rejected rate-limited request.
- Do not add Redis, a queue, a cloud image service, or a framework migration.

---

## File structure

- Modify `web/package.json` and `web/package-lock.json` for exact audited dependency fixes.
- Modify `web/src/lib/reports/image-validation.ts` and its tests for Sharp sanitisation.
- Create `web/src/lib/http/request-body.ts` and tests as the single bounded JSON reader.
- Delete four duplicated domain request-body implementations after all callers migrate.
- Create `web/src/lib/security/rate-limit.ts` and tests.
- Modify the listed authentication and mutation routes to use shared body parsing and rate limiting.
- Create `web/scripts/bootstrap-reference-data.mjs` and testable exported functions.
- Create `web/scripts/audit-legacy-photo-urls.mjs` and pure filtering tests.
- Update `.env.example`, `web/README.md`, and the root `README.md` with safe command usage.

### Task 1: Apply the exact audited dependency fixes

**Files:**
- Modify: `web/package.json`
- Modify: `web/package-lock.json`

**Interfaces:**
- Consumes: npm audit result from 15 September 2026.
- Produces: Next.js 16.3.5, matching ESLint configuration, Sharp 0.35.4 or later compatible 0.35 release, Vitest 4.1.11 or later compatible 4.1 release, and js-yaml 4.3.2 in the resolved tree.

- [ ] **Step 1: Save the pre-change audit facts**

Record these verified findings in the baseline verification file:

```text
next 16.2.12: critical; fixed by 16.3.5
sharp <0.35.4: high; fixed by 0.35.4
vitest/@vitest-mocker <4.1.11: moderate; fixed by 4.1.11
js-yaml <4.3.2: high; fixed by 4.3.2
total: 5 vulnerabilities (1 critical, 2 high, 2 moderate)
```

- [ ] **Step 2: Update package declarations**

Set these exact minimum compatible versions:

```json
"dependencies": {
  "mongoose": "^9.9.1",
  "next": "16.3.5",
  "react": "19.2.4",
  "react-dom": "19.2.4",
  "sharp": "^0.35.4",
  "zod": "^4.4.3"
},
"devDependencies": {
  "eslint-config-next": "16.3.5",
  "vitest": "^4.1.11"
}
```

Remove the obsolete top-level `sharp` override. Retain the current `nanoid` and Next/PostCSS overrides for the first install, then remove an override only if the post-install audit and tests prove it unnecessary.

- [ ] **Step 3: Regenerate the lockfile through npm**

```powershell
npm install
```

Expected: package-lock resolves Next 16.3.5, Sharp at least 0.35.4, Vitest at least 4.1.11, and js-yaml at least 4.3.2.

- [ ] **Step 4: Verify resolved versions and audit**

```powershell
npm ls next sharp vitest @vitest/mocker js-yaml
npm audit
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

Expected: no npm vulnerability remains; all existing checks pass. If a newer compatible patch is resolved, keep the lockfile result and document the actual version.

- [ ] **Step 5: Commit**

```powershell
git add -- web/package.json web/package-lock.json
git commit -m "chore(deps): apply audited security updates"
```

### Task 2: Strip metadata from uploaded report images

**Files:**
- Modify: `web/src/lib/reports/image-validation.ts`
- Modify: `web/src/lib/reports/image-validation.test.ts`
- Modify: `web/src/app/api/reports/[id]/images/report-image-upload-route.test.ts`

**Interfaces:**
- Consumes: `File`, `REPORT_IMAGE_CONTENT_TYPES`, `REPORT_IMAGE_MAX_BYTES`, Sharp.
- Produces: `readAndValidateReportImageFile(file): Promise<ValidatedReportImage>` containing re-encoded metadata-free bytes.

- [ ] **Step 1: Write a failing EXIF-removal test**

Create an input through Sharp so the test does not need a binary fixture:

```ts
const source = await sharp({
  create: { width: 2, height: 3, channels: 3, background: "#1f6a52" },
})
  .jpeg()
  .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: "private" } } })
  .toBuffer();

const result = await readAndValidateReportImageFile(
  new File([source], "evidence.jpg", { type: "image/jpeg" }),
);
const metadata = await sharp(result.data).metadata();

expect(result.contentType).toBe("image/jpeg");
expect(metadata.orientation).toBeUndefined();
expect(metadata.exif).toBeUndefined();
expect(metadata.width).toBe(3);
expect(metadata.height).toBe(2);
```

Also add PNG and WebP cases and a case where re-encoded output is rejected if it exceeds `REPORT_IMAGE_MAX_BYTES`.

- [ ] **Step 2: Run the focused test to verify failure**

```powershell
npx vitest run src/lib/reports/image-validation.test.ts
```

Expected: FAIL because current output is the unchanged source buffer and retains metadata/orientation.

- [ ] **Step 3: Implement one sanitising function**

Add:

```ts
import sharp from "sharp";

async function sanitiseImage(
  data: Buffer,
  contentType: ReportImageContentType,
): Promise<Buffer> {
  const pipeline = sharp(data, {
    failOn: "warning",
    limitInputPixels: 20_000_000,
  }).rotate();

  switch (contentType) {
    case "image/jpeg":
      return pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    case "image/png":
      return pipeline.png({ compressionLevel: 9 }).toBuffer();
    case "image/webp":
      return pipeline.webp({ quality: 85 }).toBuffer();
  }
}
```

After signature validation, call `sanitiseImage` inside `try/catch`; map decoder failures to `IMAGE_CONTENT_INVALID`. Recheck non-zero length and `REPORT_IMAGE_MAX_BYTES` on the sanitised output. Return only sanitised bytes and their actual length. Do not call `withMetadata` on output.

- [ ] **Step 4: Run image and upload tests**

```powershell
npx vitest run src/lib/reports/image-validation.test.ts src/app/api/reports/[id]/images/report-image-upload-route.test.ts src/lib/reports/image-upload-service.test.ts src/lib/reports/image-read-service.test.ts
```

Expected: PASS; upload receipts use the processed byte count.

- [ ] **Step 5: Commit**

```powershell
git add -- web/src/lib/reports/image-validation.ts web/src/lib/reports/image-validation.test.ts web/src/app/api/reports/[id]/images/report-image-upload-route.test.ts
git commit -m "fix(report-images): strip uploaded image metadata"
```

### Task 3: Introduce one bounded JSON request reader

**Files:**
- Create: `web/src/lib/http/request-body.ts`
- Create: `web/src/lib/http/request-body.test.ts`

**Interfaces:**
- Produces: `JSON_REQUEST_BODY_LIMIT`, `RequestBodyError`, `readJsonRequestBody(request, limit?)`.

- [ ] **Step 1: Write failing boundary tests**

Cover:

```ts
expect(JSON_REQUEST_BODY_LIMIT).toBe(16 * 1024);
await expect(readJsonRequestBody(jsonRequest('true'))).resolves.toBe(true);
await expect(readJsonRequestBody(jsonRequest('{'))).rejects.toMatchObject({ code: "INVALID_JSON" });
await expect(readJsonRequestBody(new Request("https://test", { method: "POST", body: "{}" })))
  .rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });
```

Add exact-limit and one-byte-over tests using UTF-8 multi-byte input, invalid UTF-8 stream input, empty body, declared oversized `Content-Length`, and a stream that exceeds the limit without a length header.

- [ ] **Step 2: Verify the missing helper fails**

```powershell
npx vitest run src/lib/http/request-body.test.ts
```

- [ ] **Step 3: Implement the shared reader**

Use this public contract:

```ts
export const JSON_REQUEST_BODY_LIMIT = 16 * 1024;

export type RequestBodyErrorCode =
  | "UNSUPPORTED_MEDIA_TYPE"
  | "BODY_TOO_LARGE"
  | "INVALID_UTF8"
  | "EMPTY_BODY"
  | "INVALID_JSON";

export class RequestBodyError extends Error {
  constructor(readonly code: RequestBodyErrorCode) {
    super(code);
    this.name = "RequestBodyError";
  }
}

export function requestBodyErrorResponse(error: RequestBodyError) {
  const bodyTooLarge = error.code === "BODY_TOO_LARGE";
  return Response.json(
    {
      error: {
        code: bodyTooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_REQUEST",
        message: bodyTooLarge
          ? "Request body is too large"
          : "Request body is invalid",
      },
    },
    {
      status: bodyTooLarge ? 413 : 400,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function readJsonRequestBody(
  request: Request,
  limit = JSON_REQUEST_BODY_LIMIT,
): Promise<unknown>;
```

Require `application/json`, reject a declared oversized length before reading, read `ReadableStream` chunks with fatal UTF-8 decoding, cancel on failure, reject whitespace-only bodies, and parse with `JSON.parse`. Never include raw body text in an error.

- [ ] **Step 4: Run focused tests**

```powershell
npx vitest run src/lib/http/request-body.test.ts
```

Expected: PASS at both byte boundaries and for all safe error codes.

- [ ] **Step 5: Commit**

```powershell
git add -- web/src/lib/http/request-body.ts web/src/lib/http/request-body.test.ts
git commit -m "feat(http): add bounded JSON request reader"
```

### Task 4: Migrate every JSON mutation route and delete duplicate readers

**Files:**
- Modify: the 19 route files listed below and their existing grouped route tests.
- Delete: `web/src/lib/claims/request-body.ts`
- Delete: `web/src/lib/claims/request-body.test.ts`
- Delete: `web/src/lib/notifications/request-body.ts`
- Delete: `web/src/lib/admin/account-request-body.ts`
- Delete: `web/src/lib/admin/reference-data-request-body.ts`

**Interfaces:**
- Consumes: `readJsonRequestBody`, `RequestBodyError`.
- Produces: one consistent 16 KB trust boundary across JSON mutation routes.

- [ ] **Step 1: Add grouped 413 regression cases**

In each existing domain route suite, add at least one representative body of `16 * 1024 + 1` bytes and assert:

```ts
expect(response.status).toBe(413);
expect(JSON.stringify(await response.json())).not.toContain(oversizedBody);
```

Cover auth, reports, Claims, notifications, profile, staff, and administrator routes. Add an invalid content-type case expecting the domain's safe 400/415 response and no service call.

- [ ] **Step 2: Verify current unbounded routes fail**

```powershell
npx vitest run src/app/api/auth src/app/api/profile src/app/api/reports src/app/api/claims src/app/api/notifications src/app/api/staff src/app/api/admin
```

Expected: new 413 tests fail on routes that still use `request.json()` or old 8 KB/16 KB readers.

- [ ] **Step 3: Replace parsing in all 19 JSON routes**

Migrate exactly these paths:

```text
api/auth/login/route.ts
api/auth/register/route.ts
api/profile/route.ts
api/reports/route.ts
api/reports/[id]/claims/route.ts
api/reports/[id]/flags/route.ts
api/claims/[id]/withdraw/route.ts
api/notifications/[id]/read/route.ts
api/staff/claims/[id]/complete/route.ts
api/staff/claims/[id]/decision/route.ts
api/staff/reports/[reportId]/storage/route.ts
api/staff/reports/[reportId]/verify/route.ts
api/admin/accounts/[userId]/status/route.ts
api/admin/campus-locations/route.ts
api/admin/campus-locations/[campusLocationId]/route.ts
api/admin/categories/route.ts
api/admin/categories/[categoryId]/route.ts
api/admin/report-flags/[flagId]/route.ts
api/admin/reports/[reportId]/moderation/route.ts
```

Replace all local body-reading and `JSON.parse` blocks with the shared reader.
For the report route, use this exact shape:

```ts
let body: unknown;
try {
  body = await readJsonRequestBody(request);
} catch (error) {
  return error instanceof RequestBodyError
    ? requestBodyErrorResponse(error)
    : reportErrorResponse(error);
}
```

Routes that wrap responses with `noStore` must wrap
`requestBodyErrorResponse(error)`. Unexpected errors continue through that
route's existing `authErrorResponse`, `reportErrorResponse`,
`claimErrorResponse`, `moderationErrorResponse`, staff error response, or admin
error response. Do not expose `error.message`.

- [ ] **Step 4: Delete old readers only after no caller remains**

```powershell
rg -n "readClaimRequestBody|readNotificationRequestBody|readAccountRequestBody|readReferenceDataRequestBody|request\.json\(\)" src/app/api src/lib
```

Expected: no route or library caller remains. Then delete the five old files listed under Files.

- [ ] **Step 5: Run all route and request-body tests**

```powershell
npx vitest run src/lib/http src/app/api
```

Expected: PASS; image multipart routes remain unchanged.

- [ ] **Step 6: Commit explicit migrated paths**

```powershell
git add -- web/src/lib/http web/src/app/api web/src/lib/claims/request-body.ts web/src/lib/claims/request-body.test.ts web/src/lib/notifications/request-body.ts web/src/lib/admin/account-request-body.ts web/src/lib/admin/reference-data-request-body.ts
git commit -m "refactor(http): unify bounded JSON parsing"
```

Before committing, run `git diff --cached --name-only` and remove any path not listed by this task.

### Task 5: Add bounded process-local rate limiting

**Files:**
- Create: `web/src/lib/security/rate-limit.ts`
- Create: `web/src/lib/security/rate-limit.test.ts`
- Modify: authentication and selected mutation routes plus their tests.

**Interfaces:**
- Produces: `RateLimitPolicy`, `consumeRateLimit`, `clientAddress`, `rateLimitedResponse`, `resetRateLimitsForTests`.
- Consumes: Request headers and a privacy-safe scope key.

- [ ] **Step 1: Write failing deterministic limiter tests**

Use an injected clock:

```ts
const policy = { limit: 2, windowMs: 60_000 };
expect(consumeRateLimit("login:test", policy, 1_000).allowed).toBe(true);
expect(consumeRateLimit("login:test", policy, 1_001).allowed).toBe(true);
expect(consumeRateLimit("login:test", policy, 1_002)).toEqual({
  allowed: false,
  retryAfterSeconds: 60,
});
expect(consumeRateLimit("login:test", policy, 61_001).allowed).toBe(true);
```

Also test independent keys, expired-bucket cleanup, a maximum of 10,000 buckets, first `x-forwarded-for` address selection, `x-real-ip` fallback, and `unknown` fallback.

- [ ] **Step 2: Verify missing limiter failure**

```powershell
npx vitest run src/lib/security/rate-limit.test.ts
```

- [ ] **Step 3: Implement the smallest bounded limiter**

Use:

```ts
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
```

Delete expired buckets opportunistically. If capacity remains full, delete the oldest Map key before inserting. Add this ceiling note:

```ts
// ponytail: process-local buckets are the course-project baseline; use a shared
// trusted store when deployment uses multiple application instances.
```

`rateLimitedResponse` must return:

```ts
Response.json(
  { error: { code: "RATE_LIMITED", message: "Too many requests. Try again later." } },
  { status: 429, headers: { "Retry-After": String(retryAfterSeconds), "Cache-Control": "no-store" } },
);
```

- [ ] **Step 4: Add route-level failing tests**

Mock `consumeRateLimit` to reject and assert `429`, `Retry-After`, no service call, and no private key in the response for:

```text
auth/login and auth/register
reports POST
reports/[id]/claims POST
reports/[id]/flags POST
staff claim decision
admin account status
admin report moderation
admin category and location mutations
```

- [ ] **Step 5: Integrate exact policy scopes**

Use `clientAddress(request)` for unauthenticated auth routes. After parsing login input, hash the normalised email with Node `createHash("sha256")` before placing it in a key:

```ts
const identity = createHash("sha256").update(parsed.data.email).digest("hex");
const limit = consumeRateLimit(
  `auth:login:${clientAddress(request)}:${identity}`,
  rateLimitPolicies.login,
);
```

Use `register` by client address. For authenticated writes, use the public user's `id` with `memberWrite`; staff/admin mutations use `privilegedWrite`. Never use display name, email, session token, or raw request body in a bucket key.

- [ ] **Step 6: Run limiter and route tests**

```powershell
npx vitest run src/lib/security/rate-limit.test.ts src/app/api/auth src/app/api/reports src/app/api/staff src/app/api/admin
```

Expected: PASS; 429 responses include integer `Retry-After` values.

- [ ] **Step 7: Commit explicit paths**

Stage only the new limiter, its test, and the route/test files actually integrated. Check `git diff --cached --name-only`, then:

```powershell
git commit -m "feat(security): rate limit sensitive operations"
```

### Task 6: Add idempotent reference-data bootstrap

**Files:**
- Create: `web/scripts/bootstrap-reference-data.mjs`
- Create: `web/scripts/bootstrap-reference-data.test.ts`
- Modify: `web/package.json`
- Modify: `web/README.md`

**Interfaces:**
- Produces: `REFERENCE_CATEGORIES`, `CAMPUS_LOCATIONS`, `bootstrapReferenceData(database)` and `npm run db:bootstrap`.

- [ ] **Step 1: Write failing pure bootstrap tests**

Import the arrays and function. Use fake collections whose `updateOne` records calls. Assert:

```ts
expect(REFERENCE_CATEGORIES.map((item) => item.name)).toEqual([
  "Bags", "Books and stationery", "Clothing", "Electronics",
  "Identification", "Keys", "Other",
]);
expect(CAMPUS_LOCATIONS).toHaveLength(6);
expect(categoryCollection.updateOne).toHaveBeenCalledTimes(7);
expect(locationCollection.updateOne).toHaveBeenCalledTimes(6);
expect(categoryCollection.updateOne.mock.calls[0][2]).toMatchObject({
  upsert: true,
  collation: { locale: "en", strength: 2 },
});
```

Assert every update uses `$setOnInsert` and never `$set`, so an existing administrator-edited description or active status is preserved.

- [ ] **Step 2: Verify the missing script fails**

```powershell
npx vitest run scripts/bootstrap-reference-data.test.ts
```

- [ ] **Step 3: Implement exact seed records and idempotent upserts**

Use seven categories from Step 1 and these six location pairs:

```text
Auckland / Library
Auckland / Student Central
Manawatū / Main Library
Manawatū / Student Centre
Wellington / Campus reception
Wellington / Library
```

Every inserted record receives `description: null`, `isActive: true`, and identical `createdAt`/`updatedAt` timestamps. Category lookup is by `name`; location lookup is by `campusName` and `locationName`; both use case-insensitive collation.

The executable path must:

```js
const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is required");
await mongoose.connect(uri);
try {
  const result = await bootstrapReferenceData(mongoose.connection.db);
  console.log(`Reference data ready: ${result.categories} categories, ${result.locations} locations.`);
} finally {
  await mongoose.disconnect();
}
```

Do not log the URI.

- [ ] **Step 4: Add an explicit npm command**

```json
"db:bootstrap": "node --env-file=.env.local scripts/bootstrap-reference-data.mjs"
```

Document that `.env.local` is required and that the command performs writes. Do not run the command in tests or builds.

- [ ] **Step 5: Run offline tests and syntax check**

```powershell
npx vitest run scripts/bootstrap-reference-data.test.ts
node --check scripts/bootstrap-reference-data.mjs
```

Expected: PASS without a database connection.

- [ ] **Step 6: Commit**

```powershell
git add -- web/scripts/bootstrap-reference-data.mjs web/scripts/bootstrap-reference-data.test.ts web/package.json web/README.md
git commit -m "feat(database): add idempotent reference bootstrap"
```

### Task 7: Add a dry-run legacy image-reference audit

**Files:**
- Create: `web/scripts/audit-legacy-photo-urls.mjs`
- Create: `web/scripts/audit-legacy-photo-urls.test.ts`
- Modify: `web/package.json`
- Modify: `web/README.md`

**Interfaces:**
- Produces: `partitionPhotoReferences(photoUrls)`, dry-run CLI, and explicit `--apply` mode.

- [ ] **Step 1: Write failing pure classification tests**

```ts
expect(partitionPhotoReferences([
  "/api/report-images/507f1f77bcf86cd799439011",
  "https://old.example/photo.jpg",
  "javascript:alert(1)",
])).toEqual({
  internal: ["/api/report-images/507f1f77bcf86cd799439011"],
  legacy: ["https://old.example/photo.jpg"],
  invalid: ["javascript:alert(1)"],
});
```

Assert the input array is not mutated.

- [ ] **Step 2: Verify missing script failure**

```powershell
npx vitest run scripts/audit-legacy-photo-urls.test.ts
```

- [ ] **Step 3: Implement dry-run-first behaviour**

Query only documents with a non-empty `photoUrls` array and print report ID plus counts, never the full URL. Without `--apply`, make no `updateOne` call. With `--apply`, keep only valid internal paths:

```js
const apply = process.argv.includes("--apply");
const { internal, legacy, invalid } = partitionPhotoReferences(report.photoUrls);
if (apply && (legacy.length > 0 || invalid.length > 0)) {
  await collection.updateOne(
    { _id: report._id, updatedAt: report.updatedAt },
    { $set: { photoUrls: internal, updatedAt: new Date() } },
  );
}
```

The optimistic `updatedAt` predicate prevents overwriting a concurrently edited report. Count conflicts separately.

- [ ] **Step 4: Add commands and warnings**

```json
"db:audit-legacy-images": "node --env-file=.env.local scripts/audit-legacy-photo-urls.mjs"
```

Document dry-run invocation and the explicit form:

```powershell
npm run db:audit-legacy-images -- --apply
```

State that `--apply` removes external/invalid references and requires a database backup plus separate approval.

- [ ] **Step 5: Run offline verification only**

```powershell
npx vitest run scripts/audit-legacy-photo-urls.test.ts
node --check scripts/audit-legacy-photo-urls.mjs
```

Do not execute either database mode during implementation without user approval.

- [ ] **Step 6: Commit**

```powershell
git add -- web/scripts/audit-legacy-photo-urls.mjs web/scripts/audit-legacy-photo-urls.test.ts web/package.json web/README.md
git commit -m "feat(database): audit legacy report image references"
```

### Task 8: Verify the full hardening slice

**Files:**
- Create: `docs/superpowers/verification/2026-09-15-security-data-hardening.md`
- Modify only defects caused by Tasks 1–7.

- [ ] **Step 1: Run complete automated checks**

```powershell
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
npm audit
npm ls next sharp vitest @vitest/mocker js-yaml
```

Expected: all commands pass and audit reports zero vulnerabilities.

- [ ] **Step 2: Run static security checks**

```powershell
rg -n "await request\.json\(\)|readClaimRequestBody|readNotificationRequestBody|readAccountRequestBody|readReferenceDataRequestBody" src
rg -n "withMetadata\(" src/lib/reports
rg -n "MONGODB_URI=.*mongodb" . --glob '!node_modules/**' --glob '!.env.local'
```

Expected: no old JSON reader, no metadata-preserving output, and no committed credential value.

- [ ] **Step 3: Record exact evidence**

Record dependency versions, test totals, audit totals, build result, rate policies, request limits, and confirmation that database scripts were not run against Atlas.

- [ ] **Step 4: Commit the verification record**

```powershell
git add -- docs/superpowers/verification/2026-09-15-security-data-hardening.md
git commit -m "test(security): verify project hardening"
```
