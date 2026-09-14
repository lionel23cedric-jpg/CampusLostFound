# Interface and Visualisation Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add clear registration guidance, a restrained local illustration system, and accurate accessible administrator overview charts.

**Architecture:** Reuse the current CSS-module visual language. Add one small shared illustration component and one native-SVG doughnut chart component, then integrate them at functional-area entry points rather than introducing a chart or icon package.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, `next/image`, CSS Modules, Testing Library, Vitest.

## Global Constraints

- Keep all work under `D:\Massey`.
- Preserve the calm practical interface, existing behavioural copy, privacy boundaries, and WCAG 2.2 AA target.
- Use local assets; do not introduce remote image hosts, a chart dependency, animation for decoration, or invented institutional claims.
- Keep report evidence visually dominant on report detail pages.
- Every chart segment must be mutually exclusive and must use the same validated response as the corresponding metric cards.
- Preserve all current uncommitted work until it has been inventoried and reviewed.

---

## File structure

- Create `web/public/illustrations/auth.svg`: authentication illustration.
- Create `web/public/illustrations/reports.svg`: report workflow illustration.
- Create `web/public/illustrations/claims.svg`: ownership Claim illustration.
- Create `web/public/illustrations/notifications.svg`: notification/dashboard illustration.
- Create `web/public/illustrations/administration.svg`: staff/admin illustration.
- Create `web/src/components/context-illustration.tsx`: typed local-asset renderer.
- Create `web/src/components/context-illustration.module.css`: shared responsive image frame.
- Create `web/src/components/context-illustration.test.tsx`: asset, alt-text, and size contract tests.
- Create `web/src/components/admin/overview-donut-chart.tsx`: accessible native-SVG chart.
- Create `web/src/components/admin/overview-donut-chart.module.css`: chart and legend layout.
- Create `web/src/components/admin/overview-donut-chart.test.tsx`: chart arithmetic and zero-state tests.
- Modify authentication, dashboard, report, Claim, notification, staff, and admin entry components to place the relevant shared visual.
- Modify `web/src/components/auth/register-form.tsx`, `password-field.tsx`, and `auth-form.module.css` for persistent field guidance.
- Modify `web/src/components/admin/admin-overview-client.tsx` and `admin-overview.module.css` to place the three charts.

### Task 1: Preserve the D-drive baseline in an isolated D-drive worktree

**Files:**
- Inspect: all modified paths reported by `git status --short`
- Record: `docs/superpowers/verification/2026-09-15-project-quality-baseline.md`

**Interfaces:**
- Consumes: current D-drive worktree and `develop` history.
- Produces: an auditable baseline and a clean D-drive feature worktree without discarding any local change.

- [ ] **Step 1: Record repository state**

Run:

```powershell
Set-Location 'D:\Massey\CampusLostFound'
git status --short
git branch --show-current
git log --oneline --decorate -10
git diff --stat
git diff --check
```

Expected: every dirty path is visible; `git diff --check` reports no whitespace error or identifies exact pre-existing lines.

- [ ] **Step 2: Classify the existing diff**

Run:

```powershell
git diff --numstat
git diff -- web/src/components/admin/admin-account-management-client.tsx
git diff -- web/src/lib/admin/account-status-service.ts
```

Record which changes are comment-only and which change behaviour. Do not stage, restore, or delete any path during this step.

- [ ] **Step 3: Create a clean feature worktree without cleaning the original worktree**

Run:

```powershell
git show-ref --verify --quiet refs/heads/feature/project-quality-polish
git worktree add -b feature/project-quality-polish 'D:\Massey\CampusLostFound-project-quality-polish' HEAD
```

Expected: the first command exits 1 because the branch does not yet exist; the
second creates a clean worktree. The original dirty changes remain untouched in
`D:\Massey\CampusLostFound`. If the branch or destination already exists, stop
and inspect it instead of deleting or overwriting it.

- [ ] **Step 4: Record the automated baseline**

Run from `D:\Massey\CampusLostFound-project-quality-polish\web`:

```powershell
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
```

Write exact commands, pass/fail totals, and any pre-existing failure into the verification file. Do not change code to hide a baseline failure.

- [ ] **Step 5: Commit only the baseline record**

```powershell
git add -- docs/superpowers/verification/2026-09-15-project-quality-baseline.md
git commit -m "docs: record project quality baseline"
```

### Task 2: Add persistent registration guidance

**Files:**
- Modify: `web/src/components/auth/password-field.tsx`
- Modify: `web/src/components/auth/register-form.tsx`
- Modify: `web/src/components/auth/auth-form.module.css`
- Modify: `web/src/components/auth/password-field.test.tsx`
- Modify: `web/src/components/auth/register-form.test.tsx`

**Interfaces:**
- Consumes: `registerSchema`, `PasswordField`, `FieldError`.
- Produces: `PasswordFieldProps.hint?: string` and accessible persistent help text.

- [ ] **Step 1: Write failing registration guidance tests**

Add assertions that the rendered form contains these exact strings:

```tsx
expect(screen.getByText("Use 2–80 characters.")).toBeTruthy();
expect(
  screen.getByText("Use a valid email address, for example name@example.com."),
).toBeTruthy();
expect(screen.getByText("Use 10–128 characters.")).toBeTruthy();
expect(screen.getByText("Enter the same password again.")).toBeTruthy();
```

After submitting an invalid password, also assert that the password input's
`aria-describedby` contains both `password-hint` and `password-error`, and that
both messages remain visible.

- [ ] **Step 2: Verify the tests fail for missing help text**

Run:

```powershell
npx vitest run src/components/auth/password-field.test.tsx src/components/auth/register-form.test.tsx
```

Expected: FAIL because the help text and combined accessible description do not yet exist.

- [ ] **Step 3: Extend `PasswordField` minimally**

Add the prop and IDs:

```tsx
type PasswordFieldProps = {
  id: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  hint?: string;
  error?: string;
  disabled?: boolean;
};

const hintId = `${id}-hint`;
const errorId = `${id}-error`;
const describedBy = [hint ? hintId : undefined, error ? errorId : undefined]
  .filter(Boolean)
  .join(" ") || undefined;
```

Set `aria-describedby={describedBy}` and render this before `FieldError`:

```tsx
{hint ? <p className="field-hint" id={hintId}>{hint}</p> : null}
```

- [ ] **Step 4: Add registration help without duplicating validation logic**

Use fixed presentation strings that exactly reflect the existing Zod limits:

```tsx
<p className={styles.hint} id="displayName-hint">Use 2–80 characters.</p>
<p className={styles.hint} id="email-hint">
  Use a valid email address, for example name@example.com.
</p>
```

Build each ordinary input's `aria-describedby` from its hint ID plus its error ID. Pass these props to the password fields:

```tsx
hint="Use 10–128 characters."
hint="Enter the same password again."
```

- [ ] **Step 5: Style help text as secondary, not disabled**

Add:

```css
.hint,
.form :global(.field-hint) {
  margin: 0;
  color: var(--ink-soft);
  font-size: 0.82rem;
  line-height: 1.45;
}
```

- [ ] **Step 6: Run focused and authentication tests**

```powershell
npx vitest run src/components/auth
```

Expected: PASS with both persistent guidance and validation errors.

- [ ] **Step 7: Commit**

```powershell
git add -- web/src/components/auth/password-field.tsx web/src/components/auth/register-form.tsx web/src/components/auth/auth-form.module.css web/src/components/auth/password-field.test.tsx web/src/components/auth/register-form.test.tsx
git commit -m "feat(auth-ui): explain registration requirements"
```

### Task 3: Add the shared local illustration system

**Files:**
- Create: the five files under `web/public/illustrations`
- Create: `web/src/components/context-illustration.tsx`
- Create: `web/src/components/context-illustration.module.css`
- Create: `web/src/components/context-illustration.test.tsx`

**Interfaces:**
- Consumes: `next/image`, current paper/ink/green/warm-accent palette.
- Produces: `ContextIllustration({ kind, priority?, className? })`.

- [ ] **Step 1: Write the failing component test**

Mock `next/image` as an ordinary `img`, render all five kinds, and assert the exact local paths:

```tsx
const expected = {
  auth: "/illustrations/auth.svg",
  reports: "/illustrations/reports.svg",
  claims: "/illustrations/claims.svg",
  notifications: "/illustrations/notifications.svg",
  administration: "/illustrations/administration.svg",
};

for (const [kind, src] of Object.entries(expected)) {
  const { unmount } = render(<ContextIllustration kind={kind as IllustrationKind} />);
  expect(screen.getByRole("img", { hidden: true }).getAttribute("src")).toBe(src);
  expect(screen.getByRole("img", { hidden: true }).getAttribute("alt")).toBe("");
  unmount();
}
```

- [ ] **Step 2: Verify the missing component fails**

```powershell
npx vitest run src/components/context-illustration.test.tsx
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Create five coherent SVG assets**

Each asset must use `viewBox="0 0 640 420"`, a `#fffdf8` background, `#17372f` line art, `#1f6a52` primary shape, and `#b85f3d` accent. Use these exact subjects:

```text
auth.svg             campus ID card beside a key
reports.svg          backpack, bottle and report card
claims.svg           two hands exchanging a labelled item box
notifications.svg    notice card with a restrained bell indicator
administration.svg   three data cards with a small shield/check mark
```

All SVGs must omit scripts, external references, embedded raster data, animation, institution logos, and factual text.

- [ ] **Step 4: Implement the typed renderer**

```tsx
import Image from "next/image";
import styles from "./context-illustration.module.css";

const sources = {
  auth: "/illustrations/auth.svg",
  reports: "/illustrations/reports.svg",
  claims: "/illustrations/claims.svg",
  notifications: "/illustrations/notifications.svg",
  administration: "/illustrations/administration.svg",
} as const;

export type IllustrationKind = keyof typeof sources;

export function ContextIllustration({
  kind,
  priority = false,
  className,
}: {
  kind: IllustrationKind;
  priority?: boolean;
  className?: string;
}) {
  return (
    <figure className={[styles.frame, className].filter(Boolean).join(" ")} aria-hidden="true">
      <Image
        src={sources[kind]}
        alt=""
        width={640}
        height={420}
        priority={priority}
        sizes="(max-width: 48rem) 100vw, 32rem"
      />
    </figure>
  );
}
```

- [ ] **Step 5: Add stable responsive image framing**

```css
.frame {
  overflow: hidden;
  margin: 0;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--paper-light);
  box-shadow: var(--shadow);
}

.frame img {
  width: 100%;
  height: auto;
  aspect-ratio: 32 / 21;
  object-fit: cover;
}
```

- [ ] **Step 6: Run the test and static asset checks**

```powershell
npx vitest run src/components/context-illustration.test.tsx
rg -n "<script|https?://|data:image|<animate" public/illustrations
```

Expected: test PASS; `rg` returns no match.

- [ ] **Step 7: Commit**

```powershell
git add -- web/public/illustrations web/src/components/context-illustration.tsx web/src/components/context-illustration.module.css web/src/components/context-illustration.test.tsx
git commit -m "feat(ui): add local contextual illustrations"
```

### Task 4: Integrate illustrations at functional-area entry points

**Files:**
- Modify: `web/src/components/auth/auth-panel.tsx` and module CSS
- Modify: `web/src/components/dashboard/dashboard-client.tsx` and module CSS
- Modify: `web/src/components/reports/report-browser.tsx`, `owner-report-history.tsx`, `report-form.tsx`, and their module CSS files
- Modify: `web/src/components/claims/claim-list-client.tsx` and module CSS
- Modify: `web/src/components/claims/staff-claim-list-client.tsx` and module CSS
- Modify: `web/src/components/notifications/notification-centre.tsx` and module CSS
- Modify: `web/src/components/staff-reports/staff-report-list-client.tsx` and module CSS
- Modify: `web/src/components/admin/admin-overview-client.tsx`, `admin-account-management-client.tsx`, `admin-reference-data-client.tsx`, `admin-moderation-client.tsx`, and their module CSS files
- Modify: the existing focused tests for those components

**Interfaces:**
- Consumes: `ContextIllustration` from Task 3.
- Produces: one restrained visual at each functional area's primary entry surface.

- [ ] **Step 1: Add failing presence tests**

Mock the shared component to render a marker:

```tsx
vi.mock("@/components/context-illustration", () => ({
  ContextIllustration: ({ kind }: { kind: string }) => (
    <div data-testid={`illustration-${kind}`} />
  ),
}));
```

Assert the exact mapping:

```text
AuthPanel                                           auth
DashboardClient, NotificationCentre                 notifications
ReportBrowser, OwnerReportHistory, ReportForm        reports
ClaimListClient, StaffClaimListClient                claims
StaffReportListClient and all four admin entry views administration
```

- [ ] **Step 2: Verify representative failures**

```powershell
npx vitest run src/components/auth/auth-panel.test.tsx src/components/dashboard/dashboard-client.test.tsx src/components/reports/report-browser.test.tsx src/components/notifications/notification-centre.test.tsx src/components/admin/admin-overview-client.test.tsx
```

If `auth-panel.test.tsx` does not exist, create it with a render of `AuthPanel` and the `illustration-auth` assertion before running.

- [ ] **Step 3: Add the exact illustration invocations**

Place these calls beside, not inside, interactive controls:

```tsx
<ContextIllustration kind="auth" priority />
<ContextIllustration kind="notifications" />
<ContextIllustration kind="reports" />
<ContextIllustration kind="claims" />
<ContextIllustration kind="administration" />
```

Each file must use only the kind assigned in Step 1. Detail views that already show uploaded evidence do not receive a decorative illustration.

- [ ] **Step 4: Add one shared two-column pattern per existing CSS module**

Use the current breakpoint conventions and this layout shape:

```css
.introLayout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(14rem, 22rem);
  align-items: center;
  gap: clamp(1.25rem, 4vw, 3rem);
}

@media (max-width: 48rem) {
  .introLayout {
    grid-template-columns: 1fr;
  }
}
```

Use existing component-specific class names when an equivalent header grid already exists; do not add a second competing wrapper.

- [ ] **Step 5: Run all touched component tests**

```powershell
npx vitest run src/components/auth src/components/dashboard src/components/reports src/components/claims src/components/notifications src/components/staff-reports src/components/admin
```

Expected: PASS; no test relies on external image loading.

- [ ] **Step 6: Commit**

```powershell
git add -- web/src/components/auth/auth-panel.tsx web/src/components/auth/auth-panel.module.css web/src/components/auth/auth-panel.test.tsx web/src/components/dashboard/dashboard-client.tsx web/src/components/dashboard/dashboard.module.css web/src/components/dashboard/dashboard-client.test.tsx web/src/components/reports/report-browser.tsx web/src/components/reports/report-browsing.module.css web/src/components/reports/report-browser.test.tsx web/src/components/reports/owner-report-history.tsx web/src/components/reports/owner-report-history.module.css web/src/components/reports/owner-report-history.test.tsx web/src/components/reports/report-form.tsx web/src/components/reports/report-form.module.css web/src/components/reports/report-form.test.tsx web/src/components/claims/claim-list-client.tsx web/src/components/claims/claim-management.module.css web/src/components/claims/claim-list-client.test.tsx web/src/components/claims/staff-claim-list-client.tsx web/src/components/claims/staff-claim-review.module.css web/src/components/claims/staff-claim-list-client.test.tsx web/src/components/notifications/notification-centre.tsx web/src/components/notifications/notification-centre.module.css web/src/components/notifications/notification-centre.test.tsx web/src/components/staff-reports/staff-report-list-client.tsx web/src/components/staff-reports/staff-report-handling.module.css web/src/components/staff-reports/staff-report-list-client.test.tsx web/src/components/admin/admin-overview-client.tsx web/src/components/admin/admin-overview.module.css web/src/components/admin/admin-overview-client.test.tsx web/src/components/admin/admin-account-management-client.tsx web/src/components/admin/admin-account-management.module.css web/src/components/admin/admin-account-management-client.test.tsx web/src/components/admin/admin-reference-data-client.tsx web/src/components/admin/admin-reference-data.module.css web/src/components/admin/admin-reference-data-client.test.tsx web/src/components/admin/admin-moderation-client.tsx web/src/components/admin/admin-moderation.module.css web/src/components/admin/admin-moderation-client.test.tsx
git commit -m "feat(ui): add contextual visuals to core workflows"
```

### Task 5: Add the accessible native-SVG doughnut chart

**Files:**
- Create: `web/src/components/admin/overview-donut-chart.tsx`
- Create: `web/src/components/admin/overview-donut-chart.module.css`
- Create: `web/src/components/admin/overview-donut-chart.test.tsx`

**Interfaces:**
- Produces: `ChartSegment` and `OverviewDonutChart({ title, segments })`.
- Consumes: non-negative integer overview counts.

- [ ] **Step 1: Write failing chart tests**

Use this fixture:

```tsx
const segments = [
  { key: "lost", label: "Lost", value: 4, color: "#1f6a52" },
  { key: "found", label: "Found", value: 3, color: "#b85f3d" },
] as const;
```

Assert:

```tsx
expect(screen.getByRole("figure", { name: "Submitted reports" })).toBeTruthy();
expect(screen.getByText("7 total")).toBeTruthy();
expect(screen.getByText("Lost: 4")).toBeTruthy();
expect(screen.getByText("Found: 3")).toBeTruthy();
expect(container.querySelectorAll("circle[data-segment]")).toHaveLength(2);
```

Add a zero fixture and assert `No data recorded yet` with no segment circles.

- [ ] **Step 2: Verify the missing chart fails**

```powershell
npx vitest run src/components/admin/overview-donut-chart.test.tsx
```

- [ ] **Step 3: Implement the chart arithmetic**

Use a radius of 42 and circumference `2 * Math.PI * 42`. Filter only positive values, compute total from all validated values, and accumulate offsets:

```tsx
export type ChartSegment = {
  key: string;
  label: string;
  value: number;
  color: string;
};

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const rendered = segments
  .filter((segment) => segment.value > 0)
  .map((segment) => ({
    ...segment,
    length: (segment.value / total) * CIRCUMFERENCE,
  }));
```

Render the visual SVG as `aria-hidden="true"`; the enclosing `<figure aria-label={title}>`, exact legend, and total are the accessible representation. Each segment circle uses:

```tsx
<circle
  data-segment={segment.key}
  cx="50"
  cy="50"
  r={RADIUS}
  fill="none"
  stroke={segment.color}
  strokeWidth="16"
  strokeDasharray={`${segment.length} ${CIRCUMFERENCE - segment.length}`}
  strokeDashoffset={-offset}
  transform="rotate(-90 50 50)"
/>
```

- [ ] **Step 4: Style a compact chart and legend**

```css
.figure {
  display: grid;
  grid-template-columns: minmax(8rem, 10rem) minmax(0, 1fr);
  align-items: center;
  gap: 1rem;
  margin: 0;
}

.figure svg {
  width: 100%;
  height: auto;
}

@media (max-width: 30rem) {
  .figure { grid-template-columns: 1fr; }
}
```

Legend swatches must include a visible border so pale segments remain distinguishable.

- [ ] **Step 5: Run chart tests**

```powershell
npx vitest run src/components/admin/overview-donut-chart.test.tsx
```

Expected: PASS for ordinary, one-segment, and zero-total cases.

- [ ] **Step 6: Commit**

```powershell
git add -- web/src/components/admin/overview-donut-chart.tsx web/src/components/admin/overview-donut-chart.module.css web/src/components/admin/overview-donut-chart.test.tsx
git commit -m "feat(admin-ui): add accessible overview charts"
```

### Task 6: Integrate the three administrator charts

**Files:**
- Modify: `web/src/components/admin/admin-overview-client.tsx`
- Modify: `web/src/components/admin/admin-overview.module.css`
- Modify: `web/src/components/admin/admin-overview-client.test.tsx`

**Interfaces:**
- Consumes: `OverviewDonutChart`, `AdministratorOverview`.
- Produces: three truthful chart configurations.

- [ ] **Step 1: Add failing overview chart assertions**

With the existing overview fixture, assert:

```tsx
expect(await screen.findByRole("figure", { name: "Submitted reports" })).toBeTruthy();
expect(screen.getByRole("figure", { name: "Ownership Claim states" })).toBeTruthy();
expect(screen.getByRole("figure", { name: "Account states" })).toBeTruthy();
expect(screen.getByText("Lost: 4")).toBeTruthy();
expect(screen.getByText("Found: 3")).toBeTruthy();
```

The existing zero-snapshot test must assert three `No data recorded yet` messages.

- [ ] **Step 2: Verify the assertions fail**

```powershell
npx vitest run src/components/admin/admin-overview-client.test.tsx
```

- [ ] **Step 3: Build exact mutually exclusive segment arrays**

```tsx
const reportChart = [
  { key: "lost", label: "Lost", value: data.reports.submittedLost, color: "#1f6a52" },
  { key: "found", label: "Found", value: data.reports.submittedFound, color: "#b85f3d" },
];

const claimChart = [
  { key: "pending", label: "Pending", value: data.claims.pending, color: "#d49345" },
  { key: "approved", label: "Approved", value: data.claims.approved, color: "#2d7d61" },
  { key: "rejected", label: "Rejected", value: data.claims.rejected, color: "#9b2c2c" },
  { key: "withdrawn", label: "Withdrawn", value: data.claims.withdrawn, color: "#6b7280" },
  { key: "completed", label: "Completed", value: data.claims.completed, color: "#245d8c" },
];

const accountChart = [
  { key: "active", label: "Active", value: data.accounts.active, color: "#1f6a52" },
  { key: "suspended", label: "Suspended", value: data.accounts.suspended, color: "#d49345" },
  { key: "deactivated", label: "Deactivated", value: data.accounts.deactivated, color: "#6b7280" },
];
```

Do not add `unresolved`, `recovered`, or `matched` to the report pie because those values overlap the Lost/Found whole.

- [ ] **Step 4: Add chart-and-metrics layout**

Wrap each chart and existing `MetricList` in:

```css
.sectionBody {
  display: grid;
  grid-template-columns: minmax(15rem, 0.34fr) minmax(0, 1fr);
  align-items: start;
  gap: 1.25rem;
}

@media (max-width: 50rem) {
  .sectionBody { grid-template-columns: 1fr; }
}
```

- [ ] **Step 5: Run overview and contract tests**

```powershell
npx vitest run src/components/admin/admin-overview-client.test.tsx src/components/admin/overview-donut-chart.test.tsx src/lib/admin/overview-contract.test.ts
```

Expected: PASS; existing card totals and links remain unchanged.

- [ ] **Step 6: Commit**

```powershell
git add -- web/src/components/admin/admin-overview-client.tsx web/src/components/admin/admin-overview.module.css web/src/components/admin/admin-overview-client.test.tsx
git commit -m "feat(admin-ui): visualise overview distributions"
```

### Task 7: Bounded visual and accessibility verification

**Files:**
- Modify only defects found in the UI files touched by Tasks 2–6.
- Create: `docs/superpowers/verification/2026-09-15-interface-visualisation-polish.md`

**Interfaces:**
- Consumes: completed UI changes.
- Produces: one evidence record and no temporary asset.

- [ ] **Step 1: Run automated UI verification**

```powershell
npx vitest run src/components
npm run lint
npx tsc --noEmit --incremental false
```

Expected: PASS.

- [ ] **Step 2: Run the one required Impeccable detector pass**

```powershell
node 'D:\.codex\skills\impeccable\scripts\detect.mjs' --json src/components/auth src/components/dashboard src/components/reports src/components/claims src/components/notifications src/components/staff-reports src/components/admin
```

Record real findings. Fix accessibility, broken image, overflow, or invalid markup findings in one batch; do not add cosmetic churn unrelated to those findings.

- [ ] **Step 3: Verify representative widths once**

Run the application and inspect registration, report browsing, notifications, and administrator overview at 320 px, 768 px, and 1440 px. Verify keyboard focus, 200% zoom, zero data, loading, error, and long-label states. Save no screenshots inside `web/public`.

- [ ] **Step 4: Perform one confirmation pass**

Re-run only the focused tests and affected viewport checks after the batch fix. Stop after the confirmation pass unless a blocking defect remains.

- [ ] **Step 5: Record and commit**

If the detector required code fixes, stage only the exact already-listed UI
paths changed by those fixes, verify them with `git diff --cached --name-only`,
and commit them as `fix(ui): resolve visual verification defects`. Then commit
the evidence separately:

```powershell
git add -- docs/superpowers/verification/2026-09-15-interface-visualisation-polish.md
git commit -m "test(ui): verify interface visual polish"
```
