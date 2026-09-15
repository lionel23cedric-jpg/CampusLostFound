# Submission Readiness Polish Implementation Plan

> **Execution:** Complete this plan inline in the current task. Do not use subagents, add dependencies, or mutate the configured database.

**Goal:** Close the remaining deterministic source and setup gaps with small, tested changes that stay within the 159.333 course-project scope.

**Architecture:** Reuse the existing `PageBackLink`, page containers, MongoDB/Mongoose connection, native MongoDB collections, Sharp dependency, and Vitest setup. Keep all role provisioning outside the public web UI, dry-run by default, and transactionally revoke sessions only when `--apply` is explicit.

**Tech stack:** Next.js 16 App Router, React 19, TypeScript 5, Node.js ESM scripts, MongoDB/Mongoose, Sharp, Vitest, Testing Library, ESLint.

---

## Task 1: Add consistent return navigation

**Files:**

- Modify: `web/src/components/profile/profile-settings-client.test.tsx`
- Modify: `web/src/components/profile/profile-settings-client.tsx`
- Modify: `web/src/components/reports/owner-report-history.test.tsx`
- Modify: `web/src/components/reports/owner-report-history.tsx`
- Modify: `web/src/app/admin/reference-data/admin-reference-data-page.test.tsx`
- Modify: `web/src/components/admin/admin-reference-data-client.tsx`

### Step 1: Add failing assertions

Assert that the normal Profile and My reports views expose a `Back to dashboard` link with `href="/dashboard"`. Assert that the reference-data workspace exposes `Back to administrator overview` with `href="/admin"`, and that the rendered route contains exactly one `main` landmark.

### Step 2: Run the focused tests and confirm failure

Run from `web`:

```powershell
npm test -- src/components/profile/profile-settings-client.test.tsx src/components/reports/owner-report-history.test.tsx src/app/admin/reference-data/admin-reference-data-page.test.tsx
```

Expected: new return-link assertions fail.

### Step 3: Implement the smallest page-level change

Import and render the existing `PageBackLink` at the top of each established page container:

- Profile: `/dashboard`, `Back to dashboard`
- My reports: `/dashboard`, `Back to dashboard`
- Reference data: `/admin`, `Back to administrator overview`

Change the reference-data client's nested `<main>` wrapper to `<div>` because the route already owns the single page landmark. Do not add a second navigation component or browser-history logic.

### Step 4: Run focused tests

Run the Step 2 command again. Expected: all selected tests pass.

### Step 5: Commit

```powershell
git add web/src/components/profile/profile-settings-client.tsx web/src/components/profile/profile-settings-client.test.tsx web/src/components/reports/owner-report-history.tsx web/src/components/reports/owner-report-history.test.tsx web/src/components/admin/admin-reference-data-client.tsx web/src/app/admin/reference-data/admin-reference-data-page.test.tsx
git commit -m "fix(ui): complete return navigation"
```

## Task 2: Correct and optimise the home page

**Files:**

- Modify: `web/src/app/home-page.test.tsx`
- Modify: `web/src/app/page.tsx`
- Create: `web/public/campus-find-hero.webp`
- Delete: `web/public/campus-find-hero.png`
- Modify: `docs/ai-generated-visual-assets.md`

### Step 1: Add failing content and source assertions

Update the home test to require copy explaining that the displayed notices are examples and authenticated members can browse live reports. Assert that the hero image source is `/campus-find-hero.webp`, not the PNG path.

### Step 2: Run the home test and confirm failure

```powershell
npm test -- src/app/home-page.test.tsx
```

Expected: the revised copy and WebP source assertions fail.

### Step 3: Convert the existing asset

Use the installed Sharp dependency to rotate safely, strip metadata, retain 1536 by 1024 dimensions, and encode WebP at quality 84. Do not download or generate a replacement.

```powershell
node -e "const sharp=require('sharp'); sharp('public/campus-find-hero.png').rotate().resize(1536,1024,{fit:'cover'}).webp({quality:84,smartSubsample:true}).toFile('public/campus-find-hero.webp').catch(error=>{console.error(error);process.exit(1)})"
```

Inspect the output metadata and confirm `format: webp`, `width: 1536`, `height: 1024`, and no EXIF/ICC/XMP metadata. Compare file sizes.

### Step 4: Update the page and provenance record

Point `next/image` to the WebP and replace the obsolete future-feature sentence with accurate live-browsing copy. Record the hero as a pre-existing project asset whose original provenance must be confirmed by the team; do not invent authorship or a licence.

After the focused test and production-server visual check pass, remove the superseded PNG.

### Step 5: Re-run the focused test and commit

```powershell
npm test -- src/app/home-page.test.tsx
git add web/src/app/page.tsx web/src/app/home-page.test.tsx web/public/campus-find-hero.webp web/public/campus-find-hero.png docs/ai-generated-visual-assets.md
git commit -m "perf(home): optimise hero and correct live copy"
```

## Task 3: Remove avoidable module and source-order warnings

**Files:**

- Modify: `web/src/app/api/auth/login/route.ts`
- Rename: `web/vitest.config.ts` to `web/vitest.config.mts`

### Step 1: Establish the warning baseline

Run a small existing test and record whether Node prints the Vitest configuration module-format warning:

```powershell
npm test -- src/app/api/auth/auth-routes.test.ts
```

### Step 2: Apply mechanical cleanup

Move `createHash` to the login route's top import block without changing runtime logic. Rename the ESM Vitest configuration from `.ts` to `.mts`; do not add `"type": "module"` to `package.json`.

### Step 3: Verify behavior and warning removal

Run the Step 1 command again. Expected: authentication route tests pass and the module-format warning is absent.

### Step 4: Commit

```powershell
git add web/src/app/api/auth/login/route.ts web/vitest.config.ts web/vitest.config.mts
git commit -m "chore(test): make Vitest module format explicit"
```

## Task 4: Add dry-run-first role provisioning

**Files:**

- Create: `web/scripts/set-account-role.test.ts`
- Create: `web/scripts/set-account-role.mjs`
- Modify: `web/package.json`

### Step 1: Write argument and transition tests

Test exported pure helpers for:

- required `--email` and `--role` values;
- accepted target roles limited to `staff` and `administrator`;
- unknown flags, duplicate flags, missing values, and malformed email rejected;
- default `apply: false` and explicit `--apply`;
- allowed student-to-staff, student-to-administrator, and staff-to-administrator transitions;
- same-role idempotence;
- administrator demotion and staff-to-student behavior unavailable.

### Step 2: Run the focused test and confirm failure

```powershell
npm test -- scripts/set-account-role.test.ts
```

Expected: the module does not yet exist or the new expectations fail.

### Step 3: Implement argument parsing and read-only behavior

Create an ESM script that exports:

- `parseRoleArguments(argv)`;
- `roleTransition(previousRole, nextRole)`;
- `setAccountRole(database, input, options)`.

Normalise the email to trimmed lowercase. Query only `_id`, `email`, `role`, `status`, and `updatedAt`. In default dry-run mode, print only the normalised email, current role, requested role, and the statement that no record changed. Do not print credentials, connection strings, session tokens, profiles, or report data.

### Step 4: Add database-operation tests

Use fakes, not a live database, to prove:

- a missing account fails safely;
- dry run performs no update, session start, or session deletion;
- same-role apply is an idempotent no-op;
- allowed apply mode starts one transaction;
- the conditional update includes `_id`, previous role, and `updatedAt`;
- a concurrent mismatch becomes a safe conflict;
- successful role change deletes every session for that user inside the same transaction;
- every started session is ended on success and failure.

### Step 5: Implement transactional apply mode

On explicit `--apply`, re-read the account in the transaction, validate the transition, conditionally update the role with optimistic concurrency, and revoke all account sessions with the same session object. Return a safe structured result for tests. Convert operational failures to short script-facing messages and always disconnect/end the session.

The CLI entry point must require `MONGODB_URI`, connect through Mongoose, and remain inactive when imported by Vitest.

### Step 6: Add the package command

Add:

```json
"db:set-role": "node --env-file=.env.local scripts/set-account-role.mjs"
```

Do not run the command against `.env.local` during implementation.

### Step 7: Run focused tests and commit

```powershell
npm test -- scripts/set-account-role.test.ts
git add web/scripts/set-account-role.mjs web/scripts/set-account-role.test.ts web/package.json
git commit -m "feat(setup): add safe account role provisioning"
```

## Task 5: Document fresh setup and verify all gates

**Files:**

- Modify: `web/README.md`
- Modify: `docs/test-matrix.md`
- Create: `docs/superpowers/verification/2026-09-15-submission-readiness-polish-verification.md`

### Step 1: Document the fresh-database sequence

Explain in plain language:

1. create `.env.local` locally;
2. install packages;
3. run the reference-data bootstrap;
4. register ordinary accounts in the UI;
5. dry-run each staff/administrator promotion;
6. add `--apply` only after checking the email and transition;
7. sign in again because previous sessions are intentionally revoked.

Include a warning that bootstrap and role apply commands write to the configured database. Do not include any real email, password, or URI.

### Step 2: Update the test matrix honestly

Add role-provisioning automated evidence under database/setup coverage. Keep responsive, accessibility, live three-role E2E, and full browser visual checks as `Not run`; do not convert manual work into a claimed pass.

### Step 3: Run focused and complete verification

From `web`:

```powershell
npm test -- src/components/profile/profile-settings-client.test.tsx src/components/reports/owner-report-history.test.tsx src/app/admin/reference-data/admin-reference-data-page.test.tsx src/app/home-page.test.tsx src/app/api/auth/auth-routes.test.ts scripts/set-account-role.test.ts
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run evaluate:matching
npm run build
npm audit
```

Expected: every command exits zero; the full suite exceeds the previous 168-file/2922-test baseline by the new role-script tests; no Vitest module-format warning appears; audit reports zero vulnerabilities.

### Step 4: Perform non-database runtime checks

Use the already-running local server or start `npm run dev`. Confirm:

- `/` returns 200 and serves `/campus-find-hero.webp`;
- the hero image has no text overlap at desktop and narrow widths;
- the public browser console has no error;
- authenticated page checks remain explicitly pending if no approved credentials are used.

Do not use the role command or bootstrap against the configured database in this task.

### Step 5: Record evidence and commit

Write exact command results, counts, asset sizes, and remaining manual checks to the verification document.

```powershell
git add web/README.md docs/test-matrix.md docs/superpowers/verification/2026-09-15-submission-readiness-polish-verification.md
git commit -m "docs: verify submission readiness polish"
```

### Step 6: Final repository check

```powershell
git diff --check github/develop...HEAD
git status --short --branch
git log --oneline --decorate -8
```

Expected: no whitespace errors, no unintended generated files, and a clean worktree ahead of `github/develop` only by the reviewed local commits.
