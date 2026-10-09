# Matching Audit Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Those execution skills are not installed here, so Codex will execute inline if the user chooses that option.

**Goal:** Repair eligible AI-assisted Possible matches lost at the pre-model rule gate, stabilise the observed Claim focus test if its race repeats, then verify and synchronise GitHub.

**Architecture:** Retain the database eligibility query and final 35-point threshold. Include in the bounded AI shortlist any pair whose non-text score is at least 15, since the model can add at most 20 text points. Preserve rule scoring if inference fails; repair a test race without changing production focus unless a real defect is observed.

**Tech Stack:** Next.js 16.3.8, TypeScript, Vitest 4, ESLint, Mongoose, local ONNX embeddings.

## Global Constraints

- The source belongs to the requesting user and is open and non-hidden.
- A candidate belongs to another account, is opposite-type, open and non-hidden.
- Only public candidate data reaches the scorer or embedding model.
- Keep `MATCH_CANDIDATE_LIMIT = 500`, `MATCH_SEMANTIC_SHORTLIST_LIMIT = 30`, `MATCH_MINIMUM_SCORE = 35`, and `MATCH_RESULT_LIMIT = 5`.
- A suggestion is never an ownership or moderation decision.
- Never force-push; push `develop` before `main` after the final checks.

---

### Task 1: Repair the semantic shortlist

**Files:**
- Modify: `web/src/lib/reports/matching-service.test.ts` (the test beginning `does not use AI text points`)
- Modify: `web/src/lib/reports/matching-service.ts` (shortlist selection in `findReportMatches`)
- Inspect: `web/src/lib/reports/matching-score.ts`, `web/src/lib/reports/semantic-score.ts`, `web/src/lib/reports/public-report.ts`

**Interfaces:** Consumes `MatchFactor[]`, `scoreReportMatch`, `replaceTextFactor` and `semanticTextPoints`. Produces the unchanged `findReportMatches(user: PublicUser, reportId: string): Promise<ReportMatches>` interface.

- [ ] **Step 1: Confirm eligibility and add the failing regression.** Check any user-supplied Lost/Found report pair read-only. In the existing test setup, replace the old blanket rejection test with a test whose mocked rule result is `{ score: 25, factors: [{ key: "category", points: 25, maximum: 25, explanation: "Same category" }] }`, whose mocked embeddings are identical `new Float32Array([1, 0])`, and whose expected result is `matchingMethod: "model_assisted"`, one candidate and `score: 45`. Add a second candidate scored `14` with a non-text factor worth 14; assert it is not embedded or returned.
- [ ] **Step 2: Verify red.** From `web`, run `npm test -- src/lib/reports/matching-service.test.ts`. Expected: the low-lexical candidate test fails because current code filters below 35 before embedding.
- [ ] **Step 3: Implement the minimal admission rule.** In `matching-service.ts`, replace the old `eligible` calculation with:

  ```ts
  const eligible = ranked.filter((match) =>
    match.score >= MATCH_MINIMUM_SCORE ||
    match.factors
      .filter((factor) => factor.key !== "text")
      .reduce((total, factor) => total + factor.points, 0) >=
      MATCH_MINIMUM_SCORE - 20,
  );
  ```

  Keep the existing `slice(0, MATCH_SEMANTIC_SHORTLIST_LIMIT)`, final `score >= MATCH_MINIMUM_SCORE` filter and catch/fallback branch. Check that rank ordering cannot starve a candidate that can reach 35; adjust shortlist ordering only if a regression demonstrates that risk.
- [ ] **Step 4: Verify green and boundaries.** Run `npm test -- src/lib/reports/matching-service.test.ts` and the matching route tests discovered by `rg --files src | rg 'matches.*test|matching.*test'`. Expected: all pass, including owner, privacy, fallback, score and limit checks.
- [ ] **Step 5: Compare evaluation evidence.** Run `npm run evaluate:matching`. Record precision/recall beside the baseline synthetic fixture values `0.8275862068965517 / 1`. Do not label these as real-campus model accuracy.

### Task 2: Stabilise the Claim focus test, conditional on reproduction

**Files:**
- Modify only if reproduced: `web/src/components/claims/staff-claim-detail-client.test.tsx` (the generic initial failure test)
- Inspect: `web/src/components/claims/staff-claim-detail-client.tsx`

**Interfaces:** No production interface changes. The accessible error heading must still receive focus.

- [ ] **Step 1: Re-run the full suite.** From `web`, run `npm test`. The baseline full run failed once at `expect(document.activeElement).toBe(errorHeading)` and the file later passed 40/40 in isolation.
- [ ] **Step 2: If the same timing race repeats, change only the assertion.** Import `waitFor` from `@testing-library/react` if not already imported and replace that one immediate assertion with:

  ```ts
  await waitFor(() => expect(document.activeElement).toBe(errorHeading));
  ```

  If focus never reaches the heading, investigate and fix the production effect instead of changing the requirement.
- [ ] **Step 3: Verify.** Run `npm test -- src/components/claims/staff-claim-detail-client.test.tsx` at least twice, then `npm test` again. Expected: heading-focus requirement and full suite pass.

### Task 3: Release verification and GitHub synchronisation

**Files:**
- Add: `docs/superpowers/2026-10-09-matching-audit-results.md` (actual command outcomes and skipped live checks)
- Modify only on confirmed failures: directly relevant source and test files

**Interfaces:** The verified commit becomes the tip of GitHub `develop` and then `main`; no public API change.

- [ ] **Step 1: Run release checks.** From `web`, run `npm test`, `npx tsc --noEmit`, `npx eslint .`, and `npm run build`. Expected: all exit code 0. Record test count and any warnings, not just a blanket “passed”.
- [ ] **Step 2: Inspect release scope.** Run `git diff --check`, `git status --short`, and `git diff --stat`. Confirm no secrets, build output, production data or unrelated edits. Commit code and a truthful audit record on `fix/matching-audit-2026-10-09`.
- [ ] **Step 3: Check remote ancestry and push in order.** Run `git fetch github develop main` and use `git merge-base --is-ancestor github/develop HEAD` and `git merge-base --is-ancestor github/main HEAD`. Only if both succeed, run `git push github HEAD:develop` followed by `git push github HEAD:main`. Never use `--force`. If either branch advanced incompatibly, stop before pushing and reconcile with the contributor's changes.
- [ ] **Step 4: Confirm remote and deployment.** Run `git ls-remote github refs/heads/develop refs/heads/main` and compare both hashes with `git rev-parse HEAD`. Check the production URL and deployment commit read-only; report Ready, pending, or error accurately. Do not modify live report/account data for a demo.

## Acceptance

- The eligible low-lexical pair becomes a model-assisted candidate, while an unrelated pair remains excluded.
- Eligibility, privacy, ordering, limits and rule fallback remain intact.
- Full tests, type check, lint and build pass at the pushed commit.
- GitHub branches both point at that commit, or the precise safe-sync blocker is reported.
