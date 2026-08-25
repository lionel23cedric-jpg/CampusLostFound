# Explainable Intelligent Item Matching Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private-by-default `GET /api/reports/[id]/matches` endpoint that gives the authenticated owner of an open report up to five deterministic, explainable opposite-type matches.

**Architecture:** A pure scorer owns normalisation, weighting and explanations; a service owns owner-scoped MongoDB queries, privacy mapping and stable ranking; a route owns authentication, ID validation and safe HTTP errors. Matching is calculated on demand over a bounded candidate set and does not persist state or call an external service.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, Mongoose 9, Zod 4, Vitest 4, existing cookie-session authentication and `MemberReport` mapper.

## Global Constraints

- Implement only Issue #25 backend scope; no matching UI, notification, background job or persisted Match model.
- Use no new package and no external AI, embedding or language-model API.
- Source access is owner-scoped and source status must be `open`.
- Candidates are opposite-type `open` reports, exclude the source owner, and are bounded to the 500 newest eligible records.
- Scores use the fixed 100-point design weights and a minimum threshold of 35; return at most five matches.
- Hidden candidate dates and locations contribute no points or explanations and the denominator is never renormalised.
- Use reporter IDs only for source ownership, candidate exclusion and the existing public mapper; never pass them to scoring, explanations or responses.
- Never select, read, log or return verification evidence, contacts or authentication secrets.
- Tests mock database operations; never read `.env.local` or write live Atlas records.
- Every commit references Issue #25.

## File Structure

- Create `web/src/lib/reports/matching-score.ts`: pure report normalisation, factor scoring and explanations.
- Create `web/src/lib/reports/matching-score.test.ts`: scoring boundaries and labelled ranking evidence.
- Create `web/src/lib/reports/matching-errors.ts`: matching-specific safe error types and response mapping.
- Create `web/src/lib/reports/matching-errors.test.ts`: exact safe error envelopes and fallback behaviour.
- Create `web/src/lib/reports/matching-service.ts`: owner-scoped source and candidate queries, mapping, threshold and stable top-five ranking.
- Create `web/src/lib/reports/matching-service.test.ts`: query, privacy, ranking, eligibility and failure tests.
- Create `web/src/app/api/reports/[id]/matches/route.ts`: authenticated GET route.
- Create `web/src/app/api/reports/matching-routes.test.ts`: route trust-boundary, authorization and privacy tests.
- Create `docs/superpowers/verification/2026-08-25-explainable-matching-backend.md`: final reproducible quality and evaluation evidence.

---

### Task 1: Pure Explainable Scoring Engine

**Files:**
- Create: `web/src/lib/reports/matching-score.test.ts`
- Create: `web/src/lib/reports/matching-score.ts`

**Interfaces:**
- Consumes: plain `ScoringReport` values with public or owner-visible report fields.
- Produces: `scoreReportMatch(source: ScoringReport, candidate: ScoringReport): MatchScore`; exported `ScoringReport`, `MatchFactor`, `MatchFactorKey` and `MatchScore` types.

- [ ] **Step 1: Write scoring fixtures and failing tests**

Create `matching-score.test.ts` with a base lost report and helper:

```ts
import { describe, expect, it } from "vitest";
import {
  scoreReportMatch,
  type ScoringReport,
} from "./matching-score";

const source: ScoringReport = {
  id: "source",
  title: "Black laptop charger",
  publicDescription: "Lost a notebook power adapter near the library",
  categoryId: "electronics",
  campusLocationId: "library",
  occurredAt: "2026-08-20T00:00:00.000Z",
  colors: ["Black"],
  tags: ["laptop", "charger"],
  createdAt: "2026-08-20T01:00:00.000Z",
};

function candidate(overrides: Partial<ScoringReport> = {}): ScoringReport {
  return {
    ...source,
    id: "candidate",
    title: "Black notebook adapter",
    publicDescription: "Found a laptop charger by the library",
    ...overrides,
  };
}
```

Add explicit assertions for:

```ts
it("awards the fixed maximum and reports all positive factors", () => {
  const result = scoreReportMatch(source, candidate());
  expect(result.score).toBe(100);
  expect(result.factors.map((factor) => factor.key)).toEqual([
    "category", "location", "date", "colors", "tags", "text",
  ]);
  expect(result.factors.reduce((sum, factor) => sum + factor.points, 0))
    .toBe(result.score);
});

it.each([
  [0, 15], [1, 12], [3, 12], [4, 8], [7, 8],
  [8, 4], [14, 4], [15, 0],
])("awards the documented date bucket for %i elapsed days", (days, points) => {
  const occurredAt = new Date(Date.parse(source.occurredAt!) + days * 86_400_000)
    .toISOString();
  const result = scoreReportMatch(source, candidate({ occurredAt }));
  expect(result.factors.find((factor) => factor.key === "date")?.points ?? 0)
    .toBe(points);
});

it("omits hidden candidate location and date completely", () => {
  const result = scoreReportMatch(
    source,
    candidate({ campusLocationId: null, occurredAt: null }),
  );
  expect(result.factors.map((factor) => factor.key)).not.toContain("location");
  expect(result.factors.map((factor) => factor.key)).not.toContain("date");
});

it("normalises sets, synonyms and Unicode deterministically", () => {
  const result = scoreReportMatch(
    { ...source, title: "ＭＯＢＩＬＥ notebook", colors: [" BLACK ", "black"] },
    candidate({ title: "phone laptop", colors: ["black"] }),
  );
  expect(result.factors.find((factor) => factor.key === "colors")?.points)
    .toBe(15);
  expect(result.factors.find((factor) => factor.key === "text")?.points)
    .toBe(20);
});
```

Add Jaccard rounding cases, empty-vector cases, punctuation/stopword cases, unrelated zero-score data, positive explanations with no private words, and a labelled evaluation containing one strong, one partial and one irrelevant candidate. Sort fixture results with the documented service comparator and assert the labelled strong candidate is rank 1 and the irrelevant candidate scores below 35.

- [ ] **Step 2: Run the scorer test and confirm the red state**

```powershell
npm.cmd test -- src/lib/reports/matching-score.test.ts
```

Expected: FAIL because `matching-score.ts` does not exist.

- [ ] **Step 3: Implement exact scoring contracts and normalisation**

Create `matching-score.ts` with these public contracts:

```ts
export type MatchFactorKey =
  | "category"
  | "location"
  | "date"
  | "colors"
  | "tags"
  | "text";

export type ScoringReport = {
  id: string;
  title: string;
  publicDescription: string;
  categoryId: string;
  campusLocationId: string | null;
  occurredAt: string | null;
  colors: string[];
  tags: string[];
  createdAt: string;
};

export type MatchFactor = {
  key: MatchFactorKey;
  points: number;
  maximum: number;
  explanation: string;
};

export type MatchScore = { score: number; factors: MatchFactor[] };
```

Use fixed constants and pure helpers:

```ts
const DAY_MS = 86_400_000;
const STOP_WORDS = new Set([
  "a", "an", "and", "at", "by", "for", "from", "in", "is", "it",
  "near", "of", "on", "the", "to", "was", "were", "with",
]);
const SYNONYMS: Readonly<Record<string, string>> = {
  adapter: "charger",
  cellphone: "phone",
  mobile: "phone",
  smartphone: "phone",
  notebook: "laptop",
  earbuds: "earphones",
  spectacles: "glasses",
};

function normaliseValue(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-NZ");
}

function jaccard(left: string[], right: string[]) {
  const leftSet = new Set(left.map(normaliseValue).filter(Boolean));
  const rightSet = new Set(right.map(normaliseValue).filter(Boolean));
  if (leftSet.size === 0 || rightSet.size === 0) return 0;
  const shared = [...leftSet].filter((value) => rightSet.has(value)).length;
  return shared / new Set([...leftSet, ...rightSet]).size;
}
```

Tokenise with `/[\p{L}\p{N}]+/gu`, discard stop words, apply `SYNONYMS`, build term-frequency maps and calculate cosine similarity. Return zero when either magnitude is zero. Use `Math.round(maximum * similarity)` for set and text points.

Calculate elapsed date days with `Math.floor(Math.abs(left - right) / DAY_MS)`. Add a factor only when its awarded points are greater than zero. Keep factor construction order exactly category, location, date, colours, tags and text. Shared colour/tag explanations list only normalised values already present in public arrays.

- [ ] **Step 4: Run focused scorer verification**

```powershell
npm.cmd test -- src/lib/reports/matching-score.test.ts
npx.cmd eslint src/lib/reports/matching-score.ts src/lib/reports/matching-score.test.ts
npx.cmd tsc --noEmit --incremental false
```

Expected: scorer and labelled ranking tests pass; ESLint and TypeScript exit 0.

- [ ] **Step 5: Commit the scoring engine**

```powershell
git add web/src/lib/reports/matching-score.ts web/src/lib/reports/matching-score.test.ts
git diff --cached --check
git commit -m "feat(matching): add explainable report scorer" -m "Refs #25"
```

---

### Task 2: Matching Error Contract

**Files:**
- Create: `web/src/lib/reports/matching-errors.test.ts`
- Create: `web/src/lib/reports/matching-errors.ts`

**Interfaces:**
- Consumes: existing `AuthError` and `authErrorResponse`.
- Produces: `MatchingError`, `MatchingErrorCode` and `matchingErrorResponse(error: unknown): Response`.

- [ ] **Step 1: Write failing exact-envelope tests**

Create tests that assert:

```ts
expect(new MatchingError("REPORT_NOT_FOUND")).toMatchObject({
  code: "REPORT_NOT_FOUND", status: 404, message: "Report not found",
});
expect(new MatchingError("REPORT_NOT_MATCHABLE")).toMatchObject({
  status: 409, message: "Report is not available for matching",
});
```

For `matchingErrorResponse`, assert exact 404 and 409 JSON, preservation of only `AUTHENTICATION_REQUIRED`, and conversion of an arbitrary `Error("database secret")`, an unapproved `AuthError`, and forged objects to:

```json
{
  "error": {
    "code": "MATCHING_FAILED",
    "message": "Unable to find report matches"
  }
}
```

with HTTP 500 and no secret text.

- [ ] **Step 2: Run the error test and confirm the red state**

```powershell
npm.cmd test -- src/lib/reports/matching-errors.test.ts
```

Expected: FAIL because the matching error module does not exist.

- [ ] **Step 3: Implement the closed error mapping**

Use this definition shape:

```ts
const matchingErrorDefinitions = {
  REPORT_NOT_FOUND: { message: "Report not found", status: 404 },
  REPORT_NOT_MATCHABLE: {
    message: "Report is not available for matching",
    status: 409,
  },
  MATCHING_FAILED: {
    message: "Unable to find report matches",
    status: 500,
  },
} as const;
```

`matchingErrorResponse` must call `authErrorResponse` only for an actual `AuthError` whose code is `AUTHENTICATION_REQUIRED`. It may return actual `MatchingError` instances for `REPORT_NOT_FOUND` and `REPORT_NOT_MATCHABLE`; every other value becomes a new `MatchingError("MATCHING_FAILED")`.

- [ ] **Step 4: Run error verification and commit**

```powershell
npm.cmd test -- src/lib/reports/matching-errors.test.ts
npx.cmd eslint src/lib/reports/matching-errors.ts src/lib/reports/matching-errors.test.ts
git add web/src/lib/reports/matching-errors.ts web/src/lib/reports/matching-errors.test.ts
git diff --cached --check
git commit -m "feat(matching): define safe matching errors" -m "Refs #25"
```

---

### Task 3: Owner-Scoped Matching Service

**Files:**
- Create: `web/src/lib/reports/matching-service.test.ts`
- Create: `web/src/lib/reports/matching-service.ts`

**Interfaces:**
- Consumes: `PublicUser`, `ItemReportModel`, `toMemberReport`, `scoreReportMatch` and `MatchingError`.
- Produces: `findReportMatches(user: PublicUser, reportId: string): Promise<ReportMatches>` plus `ReportMatch` and `ReportMatches` response types.

- [ ] **Step 1: Write service mocks and failing tests**

Mock `connectToDatabase`, `ItemReportModel.findOne`, `ItemReportModel.find`, `toMemberReport` and `scoreReportMatch`. Provide separate chains:

```ts
const sourceExec = vi.fn();
const sourceChain = { exec: sourceExec };
const candidateExec = vi.fn();
const candidateChain = {
  sort: vi.fn(),
  limit: vi.fn(),
  exec: candidateExec,
};
```

Assert the source call contains `_id` and `reporterId: user.id` with an explicit projection. Assert missing/non-owned source throws `REPORT_NOT_FOUND`, and every non-open status throws `REPORT_NOT_MATCHABLE` without querying candidates.

For a valid lost source, assert the candidate query is exactly constrained by:

```ts
{
  _id: { $ne: sourceDocument._id },
  reporterId: { $ne: sourceDocument.reporterId },
  reportType: "found",
  status: "open",
}
```

and is followed by `.sort({ createdAt: -1, _id: -1 })`, `.limit(500)` and `.exec()`. Repeat direction coverage for a found source expecting `reportType: "lost"`.

Assert each candidate is passed through `toMemberReport(document, user.id)` before the plain scoring input is constructed. Inject hidden location/date candidate fixtures and assert the scorer receives `null`, not stored private values.

Add scored fixtures proving:

```ts
expect(result.matches.map((match) => match.report.id)).toEqual([
  "newer-tie", "older-tie", "lower-score",
]);
expect(result.matches.every((match) => match.score >= 35)).toBe(true);
expect(result.matches).toHaveLength(3);
```

Also prove ID descending resolves equal-score/equal-time ties, only five of six qualifying candidates are returned, empty candidates succeed, and database/scorer/mapper failures are rethrown unchanged for the route boundary.

- [ ] **Step 2: Run the service test and confirm the red state**

```powershell
npm.cmd test -- src/lib/reports/matching-service.test.ts
```

Expected: FAIL because `matching-service.ts` does not exist.

- [ ] **Step 3: Implement projections, conversion and orchestration**

Define:

```ts
export type ReportMatch = {
  report: MemberReport;
  score: number;
  factors: MatchFactor[];
};

export type ReportMatches = {
  sourceReportId: string;
  matches: ReportMatch[];
};
```

Use one explicit projection containing only `_id`, `reporterId`, `reportType`, `title`, `publicDescription`, `categoryId`, `campusLocationId`, `occurredAt`, `colors`, `tags`, `photoUrls`, `status`, `privacySettings`, `resolvedAt`, `createdAt` and `updatedAt`.

Create a private owner-source converter that includes the owner's actual location/date, and a candidate converter that accepts only `MemberReport`, therefore receiving `null` for hidden location/date. Query source with `{ _id: reportId, reporterId: user.id }`. Query candidates only after confirming source status is `open`.

Use constants:

```ts
const CANDIDATE_LIMIT = 500;
const RESULT_LIMIT = 5;
const MINIMUM_SCORE = 35;
```

Score, filter and sort:

```ts
const matches = candidates
  .map((document) => {
    const report = toMemberReport(document, user.id);
    const result = scoreReportMatch(sourceInput, toCandidateInput(report));
    return { report, score: result.score, factors: result.factors };
  })
  .filter((match) => match.score >= MINIMUM_SCORE)
  .sort((left, right) =>
    right.score - left.score ||
    right.report.createdAt.localeCompare(left.report.createdAt) ||
    right.report.id.localeCompare(left.report.id),
  )
  .slice(0, RESULT_LIMIT);
```

Return `{ sourceReportId: source._id.toString(), matches }`.

- [ ] **Step 4: Run service and scorer verification**

```powershell
npm.cmd test -- src/lib/reports/matching-service.test.ts src/lib/reports/matching-score.test.ts
npx.cmd eslint src/lib/reports/matching-service.ts src/lib/reports/matching-service.test.ts
npx.cmd tsc --noEmit --incremental false
```

Expected: all matching scorer/service tests pass; TypeScript proves the service returns the exact public contract.

- [ ] **Step 5: Commit the service**

```powershell
git add web/src/lib/reports/matching-service.ts web/src/lib/reports/matching-service.test.ts
git diff --cached --check
git commit -m "feat(matching): rank owner report candidates" -m "Refs #25"
```

---

### Task 4: Authenticated Matching API Route

**Files:**
- Create: `web/src/app/api/reports/matching-routes.test.ts`
- Create: `web/src/app/api/reports/[id]/matches/route.ts`

**Interfaces:**
- Consumes: `readSessionCookie`, `getCurrentUser`, existing `reportIdSchema`, `findReportMatches` and `matchingErrorResponse`.
- Produces: `GET /api/reports/[id]/matches` returning `ReportMatches` with HTTP 200.

- [ ] **Step 1: Write the route test before the handler**

Mock cookie, current-user and service modules. Use a Next.js 16 async context:

```ts
function context(id: string) {
  return { params: Promise.resolve({ id }) };
}
```

Assert an authenticated owner success calls `findReportMatches(user, reportId)` and returns the service object unchanged with HTTP 200. Repeat success for `student`, `staff` and `administrator` because ownership, not role, is authoritative.

Add exact failure tests:

- no current user returns the existing exact 401 before params are awaited;
- invalid ID returns exact 400 `VALIDATION_ERROR` / `Invalid report query` and does not call the service;
- rejected params, cookie/current-user failures and arbitrary service errors return exact generic 500 with no internal detail;
- service `REPORT_NOT_FOUND` returns 404;
- service `REPORT_NOT_MATCHABLE` returns 409;
- authentication occurs before params, and params are validated before service invocation;
- response JSON does not contain `reporterId`, `privacySettings`, `expectedAnswer`, `serialNumber`, `exactLocationDetails`, `privateNotes`, `email`, `passwordHash`, `tokenHash` or a raw session token.

- [ ] **Step 2: Run the route test and confirm the red state**

```powershell
npm.cmd test -- src/app/api/reports/matching-routes.test.ts
```

Expected: FAIL because the matches route does not exist.

- [ ] **Step 3: Implement the route in trust-boundary order**

Create `route.ts`:

```ts
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { reportIdSchema } from "@/lib/reports/browse-validation";
import { invalidReportQueryResponse } from "@/lib/reports/errors";
import { matchingErrorResponse } from "@/lib/reports/matching-errors";
import { findReportMatches } from "@/lib/reports/matching-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  let user: PublicUser;
  try {
    const current = await getCurrentUser(await readSessionCookie());
    if (!current) throw new AuthError("AUTHENTICATION_REQUIRED");
    user = current;
  } catch (error) {
    return matchingErrorResponse(error);
  }

  let rawId: string;
  try {
    rawId = (await context.params).id;
  } catch (error) {
    return matchingErrorResponse(error);
  }

  const parsedId = reportIdSchema.safeParse(rawId);
  if (!parsedId.success) return invalidReportQueryResponse();

  try {
    return Response.json(await findReportMatches(user, parsedId.data));
  } catch (error) {
    return matchingErrorResponse(error);
  }
}
```

- [ ] **Step 4: Run all Issue #25 focused checks**

```powershell
npm.cmd test -- src/lib/reports/matching-score.test.ts src/lib/reports/matching-errors.test.ts src/lib/reports/matching-service.test.ts src/app/api/reports/matching-routes.test.ts
npx.cmd eslint src/lib/reports/matching-score.ts src/lib/reports/matching-errors.ts src/lib/reports/matching-service.ts src/app/api/reports/[id]/matches/route.ts src/app/api/reports/matching-routes.test.ts
npx.cmd tsc --noEmit --incremental false
```

Expected: all focused tests, ESLint and TypeScript pass.

- [ ] **Step 5: Commit the API route**

```powershell
git add web/src/app/api/reports/[id]/matches/route.ts web/src/app/api/reports/matching-routes.test.ts
git diff --cached --check
git commit -m "feat(matching): add report matches API" -m "Refs #25"
```

---

### Task 5: Complete Quality, Privacy and Academic Verification

**Files:**
- Create: `docs/superpowers/verification/2026-08-25-explainable-matching-backend.md`

**Interfaces:**
- Consumes: completed Issue #25 scorer, service and route.
- Produces: reproducible evidence that the intelligent feature is correct, privacy-safe, dependency-clean and within scope.

- [ ] **Step 1: Run all automated tests**

```powershell
npm.cmd test
```

Expected: every existing and new Vitest test passes. Record exact test-file and test counts.

- [ ] **Step 2: Run static and production checks**

```powershell
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd run build
```

Expected: all exit 0 and the Next.js route table contains `/api/reports/[id]/matches`.

- [ ] **Step 3: Run the dependency audit**

```powershell
npm.cmd audit
```

Expected: `found 0 vulnerabilities`. Do not use `npm audit fix --force`.

- [ ] **Step 4: Confirm environment privacy without reading the file**

From the repository root:

```powershell
git status --short --ignored web/.env.local
```

Expected exactly: `!! web/.env.local`.

- [ ] **Step 5: Run explicit matching privacy and architecture scans**

```powershell
rg -n "expectedAnswer|serialNumber|exactLocationDetails|privateNotes|passwordHash|tokenHash|email" web/src/lib/reports/matching-*.ts "web/src/app/api/reports/[id]/matches/route.ts"
rg -n "fetch\(|axios|openai|embedding|MatchModel|new Schema" web/src/lib/reports/matching-*.ts "web/src/app/api/reports/[id]/matches/route.ts"
rg -n "showCampusLocation|showEventDate|campusLocationId|occurredAt" web/src/lib/reports/matching-service.ts web/src/lib/reports/matching-score.ts web/src/lib/reports/matching-service.test.ts web/src/lib/reports/matching-score.test.ts
```

Expected: private/authentication terms occur only in negative non-disclosure tests; there is no external call or persistence; visibility is applied before scoring hidden candidate location/date.

- [ ] **Step 6: Verify branch scope and commit integrity**

```powershell
git diff --check develop...HEAD
git status --short --branch
git diff --stat develop...HEAD
git diff --name-status develop...HEAD
git log --format="%h %s%n%b" develop..HEAD
```

Expected: changes are limited to the Issue #25 design, plan, verification, scorer, error, service and route files; every commit body contains `Refs #25`; no manifest, lockfile, environment, model, existing response mapper or UI file changes.

- [ ] **Step 7: Write the verification record with exact observed results**

Create the verification document with:

```markdown
# Explainable Intelligent Matching Backend Verification

**Issue:** #25
**Branch:** `feature/issue-25-intelligent-matching-backend`
**Date:** 2026-08-25

## Automated gates

| Gate | Result |
|---|---|
| Focused matching tests | Copy the focused Vitest test count and PASS status produced by Task 4 Step 4 |
| Full Vitest suite | Copy the `Test Files` and `Tests` PASS lines produced by Task 5 Step 1 |
| ESLint | PASS |
| TypeScript | PASS |
| Next.js production build | PASS — route listed |
| npm audit | PASS — 0 vulnerabilities |
| `.env.local` ignored | PASS — contents not read |

## Intelligent-feature evidence

Record the fixed weights, threshold, top-five limit, deterministic tie-breakers, labelled rank-1 fixture result and fixed-fixture precision-at-five result.

## Privacy and scope evidence

Record that hidden dates/locations contributed no factor, response scans found no private/authentication output, no external API or persistence was added, and no Atlas records were created.
```

Use only observed command output in the final record; do not estimate results.

- [ ] **Step 8: Commit the verification evidence**

```powershell
git add docs/superpowers/verification/2026-08-25-explainable-matching-backend.md
git diff --cached --check
git commit -m "docs: record intelligent matching verification" -m "Refs #25"
```

- [ ] **Step 9: Prepare delivery**

Run a final `git status --short --branch`. If clean, push only this feature branch:

```powershell
git push -u origin feature/issue-25-intelligent-matching-backend
```

Prepare a pull request into `develop` with `Closes #25`, the fixed scoring formula, privacy guarantees and exact verification results. Do not merge or delete branches until GitHub confirms the pull request is merged.
