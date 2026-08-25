# Explainable Intelligent Matching Backend Verification

**Issue:** #25
**Branch:** `feature/issue-25-intelligent-matching-backend`
**Date:** 2026-08-25

## Automated Gates

| Gate | Result |
|---|---|
| Focused matching tests | PASS — 4 files, 51 tests |
| Full Vitest suite | PASS — 62 files, 1179 tests |
| ESLint | PASS |
| TypeScript | PASS — `tsc --noEmit --incremental false` |
| Next.js production build | PASS — `/api/reports/[id]/matches` listed as a dynamic route |
| npm audit | PASS — 0 vulnerabilities |
| `.env.local` ignored | PASS — `!! web/.env.local`; contents not read |

Vitest emitted its existing future Vite native-config-loader warning. It did
not affect test execution and is outside Issue #25 because changing module
configuration would broaden this backend feature's scope.

## Intelligent-Feature Evidence

The scorer uses a fixed, deterministic 100-point formula:

| Factor | Maximum |
|---|---:|
| Category equality | 25 |
| Public campus location equality | 15 |
| Public event-date proximity | 15 |
| Colour-set Jaccard similarity | 15 |
| Tag-set Jaccard similarity | 10 |
| Normalised title/description cosine similarity | 20 |

Candidates below 35 are excluded. Results are ordered by score descending,
creation time descending and report ID descending, then limited to five. The
candidate database query is independently bounded to the 500 newest eligible
records.

The labelled fixture evaluation passed with:

- the declared strongest relevant candidate at rank 1;
- four relevant candidates in the returned top five;
- fixed-fixture precision at five of `0.8`;
- the declared irrelevant candidate below the 35-point threshold.

These hand-authored fixtures demonstrate reproducibility and ranking behaviour;
they are not presented as a measurement of production-world accuracy.

## Privacy and Authorization Evidence

- The source query includes both report ID and current-user ID.
- Missing and non-owned sources share the same safe 404 response.
- Non-open owned sources return the safe 409 matching-state response.
- Candidate queries require the opposite report type and `open` status and
  exclude the source owner's reports.
- Candidates pass through the existing member-visible mapper before scoring.
- A service test proves hidden candidate campus locations and event dates reach
  the scorer as `null` and produce no factor.
- The response-contract test excludes reporter IDs, privacy settings,
  verification answers, serial numbers, exact private locations, private notes,
  email addresses, password hashes, token hashes and raw session tokens.
- The production-code privacy scan found no verification, contact or
  authentication-secret term in the matching scorer, errors, service or route.
- The external-call and persistence scan found no `fetch`, Axios, OpenAI,
  embedding, Match model or Mongoose schema in Issue #25 production code.

## Operational and Scope Evidence

- No package or lockfile changed and no dependency was added.
- No database model, existing report mapper, authentication module or UI file
  changed.
- Tests mock MongoDB dependencies and created no Atlas record.
- `.env.local` was checked only through Git ignored status and was not opened.
- `git diff --check develop...HEAD` passed.
- Every branch commit references Issue #25.

## Commands Executed

```powershell
npm.cmd test -- src/lib/reports/matching-score.test.ts src/lib/reports/matching-errors.test.ts src/lib/reports/matching-service.test.ts src/app/api/reports/matching-routes.test.ts
npm.cmd test
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd run build
npm.cmd audit
git status --short --ignored web/.env.local
git diff --check develop...HEAD
git diff --name-status develop...HEAD
git log --format="%h %s%n%b" develop..HEAD
```
