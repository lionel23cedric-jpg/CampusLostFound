# Authentication and Visual Chart Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore local authentication, remove the registration banner overlap, and show visible percentages in every administrator overview doughnut chart.

**Architecture:** Preserve the current Next.js and CSS Modules structure. Restore only the ignored local environment file, fix layout at the two owning CSS rules, and derive rounded percentages inside the existing dependency-free `OverviewDonut` component.

**Tech Stack:** Next.js 16.3.5, React 19.2.4, TypeScript, CSS Modules, MongoDB Atlas through Mongoose, Vitest, Testing Library, ESLint.

## Global Constraints

- Work only in `D:\Massey\CampusLostFound-project-quality-polish`.
- Do not expose or commit `.env.local` or its MongoDB connection string.
- Do not add a charting or UI dependency.
- Do not change authentication rules, database schemas, report workflows, existing copy, or the visual identity.
- Preserve responsive behavior, keyboard operation, accessible names, and zero-data states.

---

### Task 1: Restore the ignored local database configuration

**Files:**
- Local-only copy: `D:\Massey\CampusLostFound\web\.env.local` to `D:\Massey\CampusLostFound-project-quality-polish\web\.env.local`
- Inspect: `web/src/lib/env.ts`
- Inspect: `web/src/lib/db.ts`
- Verify: `web/src/app/api/health/database/route.ts`

**Interfaces:**
- Consumes: `MONGODB_URI` through `getServerEnvironment()`.
- Produces: a local ignored `web/.env.local` available to `connectToDatabase()`.

- [ ] **Step 1: Copy the existing ignored environment file without printing it**

```powershell
Copy-Item -LiteralPath 'D:\Massey\CampusLostFound\web\.env.local' -Destination 'D:\Massey\CampusLostFound-project-quality-polish\web\.env.local'
```

- [ ] **Step 2: Verify the file exists, contains the required key, and is ignored**

Run from the repository root:

```powershell
Test-Path -LiteralPath 'web\.env.local'
git check-ignore -v web/.env.local
git status --short
```

Expected: `Test-Path` is `True`, `git check-ignore` identifies an ignore rule, and `.env.local` is absent from `git status`.

- [ ] **Step 3: Restart the development server and check database health**

```powershell
cd web
npm run dev
```

Then request `http://localhost:3000/api/health/database`. Expected: HTTP 200. Never print the environment-file contents.

---

### Task 2: Remove the registration illustration overlap

**Files:**
- Modify: `web/src/components/context-illustration.module.css`
- Modify: `web/src/app/auth-page.module.css`
- Test: `web/src/components/context-illustration.test.tsx`
- Test: `web/src/components/auth/register-form.test.tsx`

**Interfaces:**
- Consumes: `ContextIllustration` with `variant="banner"` inside `AuthPanel`.
- Produces: a block-level responsive image and positive spacing before `.privacyNote`.

- [ ] **Step 1: Record the failing visual state**

Open `/register` at desktop width and confirm that the privacy-note border or text touches or overlaps the banner bottom edge.

- [ ] **Step 2: Make the shared image participate as a block box**

Add the first declaration to the existing rule:

```css
.frame img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 3 / 2;
  object-fit: cover;
}
```

- [ ] **Step 3: Replace the registration note's negative top margin**

Change the existing rule to:

```css
.privacyNote {
  margin: 1.5rem 0 1.25rem;
  border-left: 3px solid var(--warm-accent);
  color: var(--ink-soft);
  font-size: 0.88rem;
  line-height: 1.55;
  padding-left: 0.8rem;
}
```

- [ ] **Step 4: Run focused component tests**

```powershell
cd web
npx vitest run src/components/context-illustration.test.tsx src/components/auth/register-form.test.tsx
```

Expected: both test files pass.

- [ ] **Step 5: Verify the repaired layout**

Open `/register` at approximately 390px and 1280px widths. Expected: the full banner remains clipped inside its rounded frame, the privacy note starts below it with visible spacing, and no horizontal scrolling appears.

- [ ] **Step 6: Commit the layout fix**

```powershell
git add web/src/components/context-illustration.module.css web/src/app/auth-page.module.css
git commit -m "fix(auth-ui): separate registration note from illustration"
```

---

### Task 3: Add visible percentages to overview chart legends

**Files:**
- Modify: `web/src/components/admin/overview-donut.tsx`
- Modify: `web/src/components/admin/admin-overview.module.css`
- Test: `web/src/components/admin/overview-donut.test.tsx`

**Interfaces:**
- Consumes: `OverviewDonutSegment { label: string; value: number; color: string }` and the chart `total`.
- Produces: one raw count and one rounded percentage for every legend row, including `0%` when total is zero.

- [ ] **Step 1: Add failing percentage assertions**

Extend the first test after rendering a total of five:

```tsx
expect(screen.getByText("40%")).toBeTruthy();
expect(screen.getByText("60%")).toBeTruthy();
```

Extend the zero-total test:

```tsx
expect(screen.getByText("0%")).toBeTruthy();
```

- [ ] **Step 2: Run the test and confirm it fails**

```powershell
cd web
npx vitest run src/components/admin/overview-donut.test.tsx
```

Expected: failure because `40%`, `60%`, and `0%` are not rendered yet.

- [ ] **Step 3: Add the minimal percentage formatter**

Add above `OverviewDonut`:

```tsx
function formatPercentage(value: number, total: number) {
  return `${total === 0 ? 0 : Math.round((value / total) * 100)}%`;
}
```

Replace the final legend value with:

```tsx
<span className={styles.legendValue}>
  <strong>{segment.value}</strong>
  <small>{formatPercentage(segment.value, total)}</small>
</span>
```

- [ ] **Step 4: Style count and percentage as one compact value group**

Add:

```css
.legendValue {
  display: inline-flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 0.35rem;
  white-space: nowrap;
}

.legendValue small {
  color: var(--ink-soft);
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 5: Run the focused tests and confirm they pass**

```powershell
cd web
npx vitest run src/components/admin/overview-donut.test.tsx src/components/admin/admin-overview-client.test.tsx
```

Expected: both files pass and the accessibility label still contains counts and total.

- [ ] **Step 6: Commit the percentage enhancement**

```powershell
git add web/src/components/admin/overview-donut.tsx web/src/components/admin/overview-donut.test.tsx web/src/components/admin/admin-overview.module.css
git commit -m "feat(admin-ui): show overview chart percentages"
```

---

### Task 4: Complete quality and browser verification

**Files:**
- Verify: all changed files
- Record: `docs/superpowers/verification/2026-09-15-auth-visual-chart-polish-verification.md`

**Interfaces:**
- Consumes: the restored local environment and Tasks 2–3 UI changes.
- Produces: reproducible automated and manual evidence without secrets.

- [ ] **Step 1: Run the complete automated quality gate**

```powershell
cd web
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
npm audit
```

Expected: tests, lint, TypeScript, and production build pass; audit reports zero vulnerabilities.

- [ ] **Step 2: Run the UI detector once over changed targets**

```powershell
node D:\.codex\skills\impeccable\scripts\detect.mjs --json web/src/app/auth-page.module.css web/src/components/context-illustration.module.css web/src/components/admin/overview-donut.tsx web/src/components/admin/admin-overview.module.css
```

Expected: no unresolved high-severity layout, accessibility, or responsive defect.

- [ ] **Step 3: Verify authentication and charts in the browser**

Check login with an existing account, registration with a new valid account, `/api/auth/me` after authentication, and `/admin/overview` as an administrator. Expected: no HTTP 500, registration banner does not overlap copy, all three charts show count and percentage, and no console errors appear.

- [ ] **Step 4: Record results without credentials**

Create the verification file with command outcomes, checked routes, viewports, remaining manual limitations, and no environment values or test passwords.

- [ ] **Step 5: Commit the verification record**

```powershell
git add docs/superpowers/verification/2026-09-15-auth-visual-chart-polish-verification.md
git commit -m "test: verify auth and visual chart polish"
```
