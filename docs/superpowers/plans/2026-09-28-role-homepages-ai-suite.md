# Role-aware Homepages and AI Feature Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a visual public homepage, distinct Student/Staff/Administrator home experiences, and the four remaining course-listed AI features without weakening privacy or core workflows.

**Architecture:** Existing Next.js routes, authentication, report contracts and moderation workflows remain authoritative. Role-specific React views reuse the shared session provider, while a small server-only AI layer reuses the current MiniLM embedding model and adds one pinned CLIP zero-shot image classifier; every AI mutation remains human-confirmed and every model failure has a safe fallback.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS Modules, MongoDB/Mongoose, Zod, Vitest, Testing Library, `@huggingface/transformers` 4.3.0, Sharp.

## Global Constraints

- Work only in `D:/Massey/CampusLostFound-project-quality-polish`.
- Keep the existing Student dashboard functionally unchanged.
- Do not add dependencies or paid/external AI credentials.
- Do not change an existing database schema or create an AI-output collection.
- Use only public report fields for AI input; never include private verification evidence, serial numbers, contact details, exact private locations or reporter identifiers.
- Label model results `AI-assisted`; label the deterministic alternative `Fallback` or `Keyword fallback`.
- AI suggestions never submit, hide, flag or modify data without a user or Administrator confirmation.
- Preserve WCAG 2.2 AA basics, 44-pixel targets, keyboard operation, reduced motion and 320 CSS-pixel layouts.
- Reuse existing assets under `web/public`; do not invent statistics, testimonials, endorsements or institutional claims.
- Use strict Zod request/response contracts and safe public error messages.

---

## File responsibility map

- `web/src/components/site-header.tsx`: role-specific account navigation.
- `web/src/components/dashboard/dashboard-client.tsx`: session state and role dispatch only.
- `web/src/components/dashboard/student-dashboard.tsx`: the extracted existing Student dashboard.
- `web/src/components/dashboard/staff-dashboard.tsx`: Staff recovery operations homepage.
- `web/src/components/dashboard/dashboard.module.css`: Student/Staff layout and responsive styling.
- `web/src/components/admin/admin-overview-client.tsx`: Administrator operations copy and existing overview behaviour.
- `web/src/components/admin/admin-overview.module.css`: visually distinct Administrator control-centre surface.
- `web/src/app/page.tsx` and `web/src/app/page.module.css`: public homepage content and presentation.
- `web/src/lib/reports/local-embedding.ts`: existing pinned MiniLM loader shared by text features.
- `web/src/lib/reports/semantic-score.ts`: reusable cosine similarity.
- `web/src/lib/ai/contracts.ts`: strict AI request/response contracts.
- `web/src/lib/ai/report-assistant.ts`: public-description formatting and semantic tag selection.
- `web/src/lib/ai/image-classifier.ts`: pinned CLIP loader and category classification.
- `web/src/lib/ai/duplicate-detection.ts`: bounded same-type report-pair scoring.
- `web/src/app/api/ai/report-assistant/route.ts`: authenticated report-assistant endpoint.
- `web/src/app/api/ai/image-category/route.ts`: authenticated in-memory image-classification endpoint.
- `web/src/app/api/admin/ai/duplicates/route.ts`: Administrator-only duplicate scan.
- `web/src/lib/reports/browse-validation.ts`, `browse-service.ts`, `browser-client.ts`: smart-search contract, service and browser parsing.
- `web/src/components/reports/report-browser.tsx`: natural-language search UI.
- `web/src/components/reports/report-form.tsx`: description and image suggestion review UI.
- `web/src/lib/moderation/browser-client.ts`: duplicate-scan browser request plus reuse of `submitBrowserReportFlag`.
- `web/src/components/admin/admin-moderation-client.tsx`: duplicate scan and confirmation UI.

---

### Task 1: Make account navigation role-specific

**Files:**
- Modify: `web/src/components/site-header.tsx`
- Modify: `web/src/components/site-header.test.tsx`
- Modify: `web/src/components/site-header.module.css`

**Interfaces:**
- Consumes: `AuthSessionContextValue.user.role`, `.status`, notification unread state.
- Produces: Student, Staff and Administrator link sets rendered by `SiteHeader`.

- [ ] **Step 1: Replace broad navigation expectations with role-specific failing tests**

Add assertions equivalent to:

```tsx
it("shows only operational links to active staff", () => {
  mockSession({
    status: "authenticated",
    user: { ...safeUser, role: "staff", status: "active" },
  });
  render(<SiteHeader />);

  expect(screen.getByRole("link", { name: "Report handling" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Claim reviews" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "My reports" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Report item" })).toBeNull();
});

it("shows only administration links to an active administrator", () => {
  mockSession({
    status: "authenticated",
    user: { ...safeUser, role: "administrator", status: "active" },
  });
  render(<SiteHeader />);

  for (const name of ["Overview", "Accounts and staff", "Reference data", "Moderation"]) {
    expect(screen.getByRole("link", { name })).toBeTruthy();
  }
  expect(screen.queryByRole("link", { name: "Browse" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Claim reviews" })).toBeNull();
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm test -- src/components/site-header.test.tsx`

Expected: FAIL because Staff and Administrator currently inherit Student/general links.

- [ ] **Step 3: Implement explicit role branches inside `SiteHeader`**

Use the existing role and activity checks. Render these exact destinations:

```tsx
const studentLinks = [
  ["Browse", "/reports"],
  ["My reports", "/reports/mine"],
  ["My claims", "/claims"],
  ["Report item", "/reports/new"],
  ["Dashboard", "/dashboard"],
  ["Profile", "/profile"],
] as const;

const staffLinks = [
  ["Report handling", "/staff/reports"],
  ["Claim reviews", "/staff/claims"],
  ["Dashboard", "/dashboard"],
  ["Profile", "/profile"],
] as const;

const administratorLinks = [
  ["Overview", "/admin"],
  ["Accounts and staff", "/admin/accounts"],
  ["Reference data", "/admin/reference-data"],
  ["Moderation", "/admin/moderation"],
] as const;
```

Keep Notifications for active Students and Staff. Do not add it to the Administrator navigation because it is not an overview responsibility.

- [ ] **Step 4: Keep the header usable at narrow widths**

Update existing wrapping/gap rules rather than hiding links. Retain 44-pixel minimum target assertions.

- [ ] **Step 5: Run the focused tests**

Run: `npm test -- src/components/site-header.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/site-header.tsx web/src/components/site-header.test.tsx web/src/components/site-header.module.css
git commit -m "feat(navigation): tailor links to account roles"
```

---

### Task 2: Split Student and Staff dashboard experiences

**Files:**
- Create: `web/src/components/dashboard/student-dashboard.tsx`
- Create: `web/src/components/dashboard/staff-dashboard.tsx`
- Modify: `web/src/components/dashboard/dashboard-client.tsx`
- Modify: `web/src/components/dashboard/dashboard-client.test.tsx`
- Modify: `web/src/components/dashboard/dashboard.module.css`

**Interfaces:**
- Consumes: authenticated `PublicUser` from `useAuthSession`.
- Produces: `StudentDashboard({ user })` and `StaffDashboard({ user })`; Administrator navigation calls `router.replace("/admin")`.

- [ ] **Step 1: Add failing Staff and Administrator routing tests**

```tsx
it("renders a recovery operations desk for staff", () => {
  mockSession({
    status: "authenticated",
    user: { ...safeUser, role: "staff", status: "active" },
  });
  render(<DashboardClient />);

  expect(screen.getByRole("heading", { name: "Recovery Operations Desk" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open report handling" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open Claim reviews" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Report an item" })).toBeNull();
});

it("routes an active administrator to Campus Find Operations", async () => {
  mockSession({
    status: "authenticated",
    user: { ...safeUser, role: "administrator", status: "active" },
  });
  render(<DashboardClient />);
  await waitFor(() => expect(replace).toHaveBeenCalledWith("/admin"));
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npm test -- src/components/dashboard/dashboard-client.test.tsx`

Expected: FAIL because every active role currently shares the recovery workflow.

- [ ] **Step 3: Extract the Student dashboard without changing its behaviour**

Move the current active Student account summary and these five workflow actions into the new component without changing their labels or destinations:

```tsx
export function StudentDashboard({ user }: { user: PublicUser }) {
  const actions = [
    ["Report an item", "/reports/new", "Submit lost or found item details with private ownership evidence."],
    ["Search possible matches", "/reports", "Search privacy-safe lost and found reports across campus."],
    ["Review my report history", "/reports/mine", "Review every report submitted by this account."],
    ["Manage recovery requests", "/claims", "Track verification, handover arrangements and recovery progress."],
    ["Manage profile settings", "/profile", "Update contact, campus and notification preferences."],
  ] as const;

  return (
    <div className={styles.dashboard}>
      <section className={styles.introduction}>
        <p className={styles.kicker}>Your campus account</p>
        <h1>Welcome, {user.profile.displayName}</h1>
        <p>Review your account status and see what is coming next in Campus Find.</p>
      </section>
      <ContextIllustration kind="notifications" variant="banner" priority />
      <section className={styles.account} aria-labelledby="account-heading">
        <h2 id="account-heading">Account summary</h2>
        <AccountFacts user={user} />
      </section>
      <section className={styles.upcoming} aria-labelledby="student-workflow-heading">
        <h2 id="student-workflow-heading">Recovery workflow</h2>
        <div className={styles.upcomingGrid}>
          {actions.map(([title, href, description]) => (
            <article key={href}>
              <p className={styles.availableLabel}>Available now</p>
              <h3><Link className={styles.workflowLink} href={href}>{title}</Link></h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
```

Define `AccountFacts` in `student-dashboard.tsx` with the current five-field `<dl>`; it must keep Email, Role, Status, Email verification and Last sign-in exactly as they are now. The Staff view keeps its smaller role/status summary inline instead of introducing another shared abstraction.

- [ ] **Step 4: Implement `StaffDashboard`**

Render the exact operational actions:

```tsx
const staffActions = [
  {
    title: "Report handling",
    label: "Open report handling",
    href: "/staff/reports",
    description: "Verify reports and record secure storage details.",
  },
  {
    title: "Claim reviews",
    label: "Open Claim reviews",
    href: "/staff/claims",
    description: "Review ownership evidence and coordinate handovers.",
  },
  {
    title: "Recovery notifications",
    label: "Open notifications",
    href: "/notifications",
    description: "Follow status changes that need operational attention.",
  },
] as const;
```

Use `<ContextIllustration kind="claims" variant="banner" priority />` and retain a compact role/status/last-sign-in summary.

- [ ] **Step 5: Reduce `DashboardClient` to state handling and role dispatch**

Add an effect that redirects only active Administrators to `/admin`. Render `StaffDashboard` for active Staff and `StudentDashboard` for Students. Preserve existing unavailable, loading, unauthenticated and inactive-account states.

- [ ] **Step 6: Style and verify responsive layouts**

Use a maximum three-column Staff action grid, two columns below 48rem and one below 32rem. Do not alter Student action destinations.

- [ ] **Step 7: Run the focused tests**

Run: `npm test -- src/components/dashboard/dashboard-client.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/dashboard
git commit -m "feat(dashboard): separate student and staff workspaces"
```

---

### Task 3: Redesign the Administrator homepage around existing overview data

**Files:**
- Modify: `web/src/components/admin/admin-overview-client.tsx`
- Modify: `web/src/components/admin/admin-overview.module.css`
- Modify: `web/src/components/admin/admin-overview-client.test.tsx`
- Modify: `web/src/app/admin/admin-page.test.tsx`

**Interfaces:**
- Consumes: unchanged `getAdministratorOverview()` and `AdministratorOverview`.
- Produces: `/admin` titled `Campus Find Operations`, using the same validated totals, charts and refresh function.

- [ ] **Step 1: Add failing copy and responsibility tests**

```tsx
expect(
  screen.getByRole("heading", { level: 1, name: "Campus Find Operations" }),
).toBeTruthy();
expect(screen.getByText("System oversight, access control and report integrity.")).toBeTruthy();
expect(screen.getByRole("link", { name: "Manage accounts and staff" })).toBeTruthy();
expect(screen.getByRole("link", { name: "Manage reference data" })).toBeTruthy();
expect(screen.getByRole("link", { name: "Review report moderation" })).toBeTruthy();
expect(screen.queryByText(/welcome admin/i)).toBeNull();
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- src/components/admin/admin-overview-client.test.tsx src/app/admin/admin-page.test.tsx`

Expected: FAIL on the new title and responsibility links.

- [ ] **Step 3: Update the overview header and links without duplicating data fetching**

Keep `loadOverview`, `OverviewDonut`, `MetricList`, refresh/error states and the protected API unchanged. Replace the heading copy and make the existing destinations explicit:

```tsx
<h1>Campus Find Operations</h1>
<p>System oversight, access control and report integrity.</p>
<Link href="/admin/accounts">Manage accounts and staff</Link>
<Link href="/admin/reference-data">Manage reference data</Link>
<Link href="/admin/moderation">Review report moderation</Link>
```

- [ ] **Step 4: Apply a distinct control-centre visual system**

Use a dark ink/forest page frame, light statistic surfaces, strong section dividers and restrained warm accents. Keep numeric values and donut legends text-readable. Do not use neon effects, glassmorphism, gradients or continuous animation.

- [ ] **Step 5: Run focused tests**

Run: `npm test -- src/components/admin/admin-overview-client.test.tsx src/app/admin/admin-page.test.tsx src/components/admin/overview-donut.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/admin/admin-overview-client.tsx web/src/components/admin/admin-overview.module.css web/src/components/admin/admin-overview-client.test.tsx web/src/app/admin/admin-page.test.tsx
git commit -m "feat(admin-ui): establish operations control centre"
```

---

### Task 4: Make the public homepage visual and action-oriented

**Files:**
- Modify: `web/src/app/page.tsx`
- Modify: `web/src/app/page.module.css`
- Modify: `web/src/app/home-page.test.tsx`

**Interfaces:**
- Consumes: existing images in `web/public/campus-find-hero.webp` and `web/public/illustrations`.
- Produces: real protected links to `/reports/new` and `/reports`; the existing access boundaries take signed-out visitors to authentication.

- [ ] **Step 1: Add failing action and imagery tests**

```tsx
expect(screen.getByRole("link", { name: "Report a lost item" }).getAttribute("href"))
  .toBe("/reports/new");
expect(screen.getByRole("link", { name: "Report a found item" })).toBeTruthy();
expect(screen.getByRole("link", { name: "Report a found item" }).getAttribute("href"))
  .toBe("/reports/new");
expect(screen.getByRole("link", { name: "Search reports" }).getAttribute("href"))
  .toBe("/reports");
expect(screen.getAllByRole("img")).toHaveLength(4);
expect(screen.queryByText("Illustrative campus notices")).toBeNull();
```

- [ ] **Step 2: Run the homepage test and confirm failure**

Run: `npm test -- src/app/home-page.test.tsx`

Expected: FAIL because the three actions and illustrated steps do not exist.

- [ ] **Step 3: Replace static notices with three illustrated recovery steps**

Use these assets and real destinations:

```tsx
const recoverySteps = [
  {
    title: "Report clearly",
    image: "/illustrations/reports-found-item.webp",
    href: "/reports/new",
  },
  {
    title: "Review AI-assisted matches",
    image: "/illustrations/notifications-campus-match.webp",
    href: "/reports",
  },
  {
    title: "Recover through a controlled handover",
    image: "/illustrations/claims-item-handover.webp",
    href: "/claims",
  },
] as const;
```

Retain the privacy section. Remove the non-interactive sample-notice cards.

- [ ] **Step 4: Implement the visual hierarchy in CSS**

Use one editorial hero, a three-card image strip and a compact privacy panel. Every image uses `object-fit: cover`, an explicit aspect ratio and a meaningful `alt`. At 56rem, stack the hero; at 40rem, stack all action cards.

- [ ] **Step 5: Run the homepage test**

Run: `npm test -- src/app/home-page.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/page.tsx web/src/app/page.module.css web/src/app/home-page.test.tsx
git commit -m "feat(home): add visual recovery pathways"
```

---

### Task 5: Establish shared AI contracts and reusable similarity

**Files:**
- Create: `web/src/lib/ai/contracts.ts`
- Create: `web/src/lib/ai/contracts.test.ts`
- Modify: `web/src/lib/reports/semantic-score.ts`
- Modify: `web/src/lib/reports/semantic-score.test.ts`

**Interfaces:**
- Produces: `cosineSimilarity(left, right): number` in the inclusive range 0–1.
- Produces: `aiMethodSchema`, `reportAssistantRequestSchema`, `reportAssistantResponseSchema`, `imageCategoryResponseSchema`, `duplicateScanResponseSchema`.

- [ ] **Step 1: Add failing cosine and strict-contract tests**

```ts
expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([1, 0])))
  .toBe(1);
expect(cosineSimilarity(new Float32Array([1]), new Float32Array([1, 0])))
  .toBe(0);
expect(() => reportAssistantRequestSchema.parse({ title: "Black charger", extra: true }))
  .toThrow();
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- src/lib/reports/semantic-score.test.ts src/lib/ai/contracts.test.ts`

Expected: FAIL because the shared function and schemas do not exist.

- [ ] **Step 3: Extract cosine similarity and keep existing scoring stable**

```ts
export function cosineSimilarity(left: Float32Array, right: Float32Array) {
  if (left.length === 0 || left.length !== right.length) return 0;
  let dot = 0;
  let leftLength = 0;
  let rightLength = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftLength += left[index] ** 2;
    rightLength += right[index] ** 2;
  }
  if (!Number.isFinite(dot) || leftLength <= 0 || rightLength <= 0) return 0;
  return Math.max(0, Math.min(1, dot / Math.sqrt(leftLength * rightLength)));
}
```

Make `semanticTextPoints` call `cosineSimilarity` so matching scores do not change.

- [ ] **Step 4: Define strict AI envelopes**

Use `z.strictObject` for every object. Use the exact method values:

```ts
export const aiMethodSchema = z.enum(["model_assisted", "fallback"]);
```

Limit title to 120, description to 2000, tags to ten values of 40 characters, image suggestions to three, duplicate pairs to twenty and all confidence/similarity values to 0–1.

- [ ] **Step 5: Run tests**

Run: `npm test -- src/lib/reports/semantic-score.test.ts src/lib/ai/contracts.test.ts`

Expected: PASS with existing matching score expectations unchanged.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/ai web/src/lib/reports/semantic-score.ts web/src/lib/reports/semantic-score.test.ts
git commit -m "feat(ai): define shared safe contracts"
```

---

### Task 6: Add privacy-safe semantic smart search

**Files:**
- Modify: `web/src/lib/reports/browse-validation.ts`
- Modify: `web/src/lib/reports/browse-validation.test.ts`
- Modify: `web/src/lib/reports/browse-service.ts`
- Modify: `web/src/lib/reports/browse-service.test.ts`
- Modify: `web/src/lib/reports/browser-client.ts`
- Modify: `web/src/lib/reports/browser-client.test.ts`
- Modify: `web/src/components/reports/report-browser.tsx`
- Modify: `web/src/components/reports/report-browser.test.tsx`
- Modify: `web/src/components/reports/report-browsing.module.css`

**Interfaces:**
- Consumes: `embedPublicText(text)`, `cosineSimilarity(left, right)` and existing structured browse filters.
- Produces: optional query property `smartQuery: string`; result property `searchMethod: "model_assisted" | "fallback"` when smart search is used.

- [ ] **Step 1: Add failing validation, privacy and ranking tests**

Test that `smartQuery` is normalized to 3–240 visible characters, unknown fields are rejected, semantic ranking uses only `title`, `publicDescription` and `tags`, and a mocked embedding failure returns keyword results with `searchMethod: "fallback"`.

Use this model-input assertion:

```ts
expect(embedPublicText).toHaveBeenCalledWith(
  "Black laptop charger. USB-C charger near library. charger usb-c black",
);
expect(JSON.stringify(embedPublicText.mock.calls)).not.toMatch(
  /serial|verification|exactLocation|reporterId/i,
);
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `npm test -- src/lib/reports/browse-validation.test.ts src/lib/reports/browse-service.test.ts src/lib/reports/browser-client.test.ts src/components/reports/report-browser.test.tsx`

Expected: FAIL because `smartQuery` and `searchMethod` are absent.

- [ ] **Step 3: Extend validation and browser URL construction**

Add optional `smartQuery` to the existing query schema. Include it in `reportListHref` and browser response parsing without changing existing structured filter names.

- [ ] **Step 4: Implement bounded semantic ranking in `browse-service.ts`**

When `smartQuery` is present, fetch at most 100 reports satisfying structured visibility filters. Embed the query and public text, sort by cosine similarity then creation date, and paginate the sorted array. On any model exception, run the existing keyword search using `smartQuery` and return `fallback`.

- [ ] **Step 5: Add the natural-language field and status copy**

```tsx
<label htmlFor="smart-query">
  Describe what you are looking for
  <input id="smart-query" name="smartQuery" maxLength={240} />
</label>
```

Show `AI-assisted search` for `model_assisted`, `Keyword fallback` for fallback, and no AI label for ordinary structured searches.

- [ ] **Step 6: Run focused tests**

Run: `npm test -- src/lib/reports/browse-validation.test.ts src/lib/reports/browse-service.test.ts src/lib/reports/browser-client.test.ts src/components/reports/report-browser.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/reports web/src/components/reports/report-browser.tsx web/src/components/reports/report-browser.test.tsx web/src/components/reports/report-browsing.module.css
git commit -m "feat(ai-search): add semantic report discovery"
```

---

### Task 7: Add the AI-assisted description and tag review panel

**Files:**
- Create: `web/src/lib/ai/report-assistant.ts`
- Create: `web/src/lib/ai/report-assistant.test.ts`
- Create: `web/src/app/api/ai/report-assistant/route.ts`
- Create: `web/src/app/api/ai/report-assistant/route.test.ts`
- Modify: `web/src/lib/reports/browser-client.ts`
- Modify: `web/src/lib/reports/browser-client.test.ts`
- Modify: `web/src/components/reports/report-form.tsx`
- Modify: `web/src/components/reports/report-form.test.tsx`
- Modify: `web/src/components/reports/report-form.module.css`

**Interfaces:**
- Consumes: `{ title, publicDescription, colors, reportType }` only.
- Produces: `{ method, suggestedDescription, suggestedTags }` validated by `reportAssistantResponseSchema`.

- [ ] **Step 1: Add failing service and privacy tests**

Use a fixed controlled tag vocabulary including `backpack`, `bag`, `charger`, `phone`, `keys`, `wallet`, `bottle`, `book`, `clothing`, `laptop`, `headphones`, `card`, `black`, `blue`, `red`, `silver`, `library`, `student-centre`, `gym` and `bus-stop`.

Assert that the mocked embedding receives only the four public request properties and returns at most five unique tags.

- [ ] **Step 2: Add failing route and component tests**

Verify 401 for no session, 403 for inactive accounts, 400 for strict validation failure, safe 200 fallback on model failure, and that form values change only after `Apply suggestion`.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `npm test -- src/lib/ai/report-assistant.test.ts src/app/api/ai/report-assistant/route.test.ts src/components/reports/report-form.test.tsx`

Expected: FAIL because the service, route and controls are absent.

- [ ] **Step 4: Implement semantic tag selection and deterministic description formatting**

Embed `${title}. ${publicDescription}. ${colors.join(" ")}` and each controlled tag phrase. Rank by cosine similarity, keep up to five above 0.25, and fall back to normalized user tags/words when inference fails.

Build the suggested description from user-provided public text only:

```ts
const suggestedDescription = `${normalizedDescription.replace(/[.!?]*$/, ".")} ` +
  `The item is ${colors.join(" and ").toLowerCase()}.`;
```

Never claim the assistant is a free-form generator.

- [ ] **Step 5: Implement the protected route and browser parser**

Use `getCurrentUser`, require an active account, parse strict JSON, call the service and validate the success envelope before returning it.

- [ ] **Step 6: Add review/apply/dismiss UI to `ReportForm`**

Disable `Suggest description and tags` until title and description meet their existing minimums. Keep current form state while loading. Render the suggestion in a labelled region with `Apply suggestion`, `Keep my text` and `Try again`. Applying updates only `publicDescription` and `tags`.

- [ ] **Step 7: Run focused tests**

Run: `npm test -- src/lib/ai/report-assistant.test.ts src/app/api/ai/report-assistant/route.test.ts src/lib/reports/browser-client.test.ts src/components/reports/report-form.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add web/src/lib/ai/report-assistant* web/src/app/api/ai/report-assistant web/src/lib/reports/browser-client* web/src/components/reports/report-form*
git commit -m "feat(ai-assistant): suggest public descriptions and tags"
```

---

### Task 8: Add user-confirmed image category suggestions

**Files:**
- Create: `web/src/lib/ai/image-classifier.ts`
- Create: `web/src/lib/ai/image-classifier.test.ts`
- Create: `web/src/app/api/ai/image-category/route.ts`
- Create: `web/src/app/api/ai/image-category/route.test.ts`
- Modify: `web/src/lib/reports/browser-client.ts`
- Modify: `web/src/lib/reports/browser-client.test.ts`
- Modify: `web/src/components/reports/report-image-picker.tsx`
- Modify: `web/src/components/reports/report-image-picker.test.tsx`
- Modify: `web/src/components/reports/report-form.tsx`
- Modify: `web/src/components/reports/report-form.test.tsx`
- Modify: `web/src/components/reports/report-form.module.css`

**Interfaces:**
- Consumes: one `File` and server-loaded active category IDs/names.
- Produces: `{ method, suggestions: Array<{ categoryId, categoryName, confidence }> }` with at most three suggestions.

- [ ] **Step 1: Add failing model-wrapper tests**

Mock the Transformers pipeline and assert this exact configuration:

```ts
expect(pipeline).toHaveBeenCalledWith(
  "zero-shot-image-classification",
  "Xenova/clip-vit-base-patch32",
  { dtype: "q4", revision: "d15189d" },
);
```

Verify the wrapper calls `RawImage.fromBlob(file)` and the classifier with active category names plus `{ hypothesis_template: "This is a photo of a {}" }`.

- [ ] **Step 2: Add failing route validation tests**

Cover authenticated active access, inactive rejection, missing file, unsupported MIME, file larger than 3 MB, no active categories, safe model failure and a successful top-three response.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `npm test -- src/lib/ai/image-classifier.test.ts src/app/api/ai/image-category/route.test.ts src/components/reports/report-image-picker.test.tsx src/components/reports/report-form.test.tsx`

Expected: FAIL because the classifier and suggestion controls are absent.

- [ ] **Step 4: Implement the lazy pinned classifier**

Cache one promise. Reset it on load failure. Convert the validated `File` with `RawImage.fromBlob`, run zero-shot classification against active category names, normalize finite confidence values into 0–1, join category IDs and names, then return the best three.

- [ ] **Step 5: Implement the in-memory multipart route**

Read `request.formData()`, validate `image instanceof File`, MIME and `image.size <= 3 * 1024 * 1024`. Query active categories on the server. Do not write a temporary file and do not include image bytes in logs or errors.

- [ ] **Step 6: Expose the first pending image for analysis**

Add an optional `onSuggestCategory(file: File)` callback to `ReportImagePicker`. In `ReportForm`, request suggestions only after the user presses `Suggest category from photo`.

- [ ] **Step 7: Add explicit confirmation controls**

Render category name and percentage. `Use this category` calls `updateValue("categoryId", suggestion.categoryId)`. Dismissal changes no form field. A failure shows retry and preserves the selected image.

- [ ] **Step 8: Run focused tests**

Run: `npm test -- src/lib/ai/image-classifier.test.ts src/app/api/ai/image-category/route.test.ts src/lib/reports/browser-client.test.ts src/components/reports/report-image-picker.test.tsx src/components/reports/report-form.test.tsx`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add web/src/lib/ai/image-classifier* web/src/app/api/ai/image-category web/src/lib/reports/browser-client* web/src/components/reports/report-image-picker* web/src/components/reports/report-form*
git commit -m "feat(ai-image): suggest report categories from photos"
```

---

### Task 9: Add Administrator-confirmed duplicate detection

**Files:**
- Create: `web/src/lib/ai/duplicate-detection.ts`
- Create: `web/src/lib/ai/duplicate-detection.test.ts`
- Create: `web/src/app/api/admin/ai/duplicates/route.ts`
- Create: `web/src/app/api/admin/ai/duplicates/route.test.ts`
- Modify: `web/src/lib/moderation/browser-contract.ts`
- Modify: `web/src/lib/moderation/browser-contract.test.ts`
- Modify: `web/src/lib/moderation/browser-client.ts`
- Modify: `web/src/lib/moderation/browser-client.test.ts`
- Modify: `web/src/components/admin/admin-moderation-client.tsx`
- Modify: `web/src/components/admin/admin-moderation-client.test.tsx`
- Modify: `web/src/components/admin/admin-moderation.module.css`

**Interfaces:**
- Consumes: active Administrator, visible non-draft reports, `embedPublicText`, existing structured matching factors and `submitBrowserReportFlag`.
- Produces: up to twenty `DuplicatePair` values with `leftReport`, `rightReport`, `similarity`, `reasons`, and `method`.

- [ ] **Step 1: Add failing detection tests**

Create fixtures that prove:

- only same-type reports are paired;
- a report is never paired with itself;
- hidden/draft reports are excluded;
- private fields are never projected or embedded;
- pairs below 0.82 combined similarity are excluded;
- duplicate pair ordering is canonical, so `A:B` and `B:A` cannot both appear;
- model failure uses the structured score and marks `fallback`.

- [ ] **Step 2: Add failing Administrator route tests**

Assert 401 for no session, 403 for Student/Staff/inactive Administrator, strict query rejection and validated success for active Administrator.

- [ ] **Step 3: Add failing moderation UI tests**

```tsx
await user.click(screen.getByRole("button", { name: "Scan for possible duplicates" }));
expect(await screen.findByText("AI-assisted duplicate candidates")).toBeTruthy();
await user.click(screen.getByRole("button", { name: "Send to moderation queue" }));
expect(submitBrowserReportFlag).toHaveBeenCalledWith(
  rightReport.id,
  {
    reason: "duplicate_report",
    details: `AI-assisted candidate paired with report ${leftReport.id}`,
  },
  expect.any(AbortSignal),
);
```

- [ ] **Step 4: Run focused tests and confirm failure**

Run: `npm test -- src/lib/ai/duplicate-detection.test.ts src/app/api/admin/ai/duplicates/route.test.ts src/lib/moderation/browser-client.test.ts src/components/admin/admin-moderation-client.test.tsx`

Expected: FAIL because duplicate scanning is absent.

- [ ] **Step 5: Implement bounded pair scoring**

Load at most 200 recent visible, non-draft reports with the same safe projection used by matching. Group by report type. First shortlist using category, location and date; embed only shortlisted public title/description/tag text; combine semantic and structured values; return the best twenty canonical pairs.

- [ ] **Step 6: Implement the protected scan route and browser parser**

Reuse Administrator access checks from existing admin routes. Validate the service response with `duplicateScanResponseSchema` before returning and again in the browser client.

- [ ] **Step 7: Add human confirmation to moderation**

The scan button must not mutate data. Each candidate shows both report titles, type, event dates, similarity, method and explanation. `Send to moderation queue` calls the existing report-flag endpoint for the selected report with reason `duplicate_report`. Refresh the existing flag queue after success. Never auto-hide either report.

- [ ] **Step 8: Run focused tests**

Run: `npm test -- src/lib/ai/duplicate-detection.test.ts src/app/api/admin/ai/duplicates/route.test.ts src/lib/moderation/browser-contract.test.ts src/lib/moderation/browser-client.test.ts src/components/admin/admin-moderation-client.test.tsx`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add web/src/lib/ai/duplicate-detection* web/src/app/api/admin/ai/duplicates web/src/lib/moderation web/src/components/admin/admin-moderation-client* web/src/components/admin/admin-moderation.module.css
git commit -m "feat(ai-moderation): detect administrator-confirmed duplicates"
```

---

### Task 10: Document, visually verify and run the complete quality gate

**Files:**
- Modify: `PRODUCT.md`
- Modify: `docs/ai-matching-evaluation.md`
- Create: `docs/ai-feature-suite.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: all completed UI and AI features.
- Produces: assessment-ready explanation of data, models, algorithms, fallback, human confirmation, limitations and privacy.

- [ ] **Step 1: Document the five AI functions accurately**

Record:

- MiniLM model ID/revision already used by matching;
- CLIP model `Xenova/clip-vit-base-patch32`, revision `d15189d`;
- inputs and excluded private data for each feature;
- semantic/structured thresholds;
- human-confirmation points;
- first-run model download expectations;
- local-model limitations and safe fallbacks.

State that description formatting is deterministic and semantic tag selection is model-assisted; do not describe it as a general generative model.

- [ ] **Step 2: Run the complete automated suite**

Run:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
npm audit
```

Expected: tests, lint, TypeScript and build exit 0. Audit must have no unresolved high or critical production vulnerability; document any lower-severity advisory instead of changing dependencies outside this scope.

- [ ] **Step 3: Run the AI evaluation checks**

Run:

```bash
npm run evaluate:matching
npm run evaluate:matching:ai
```

Expected: the existing matching baseline/model comparison remains valid and the model-assisted run identifies its method explicitly.

- [ ] **Step 4: Perform one bounded desktop/mobile browser pass**

At desktop and mobile widths verify:

- public homepage action links and image crop;
- unchanged Student dashboard;
- Staff operational dashboard;
- Administrator control-centre navigation, charts and refresh;
- smart-search label and fallback;
- suggestion apply/dismiss behaviour;
- image category confirmation;
- duplicate scan and flag confirmation;
- keyboard focus, error copy and no horizontal overflow.

Fix all findings in one batch, then perform one confirmation pass and stop.

- [ ] **Step 5: Review scope and repository state**

Run:

```bash
git diff --check
git status --short
git diff --stat develop...HEAD
```

Expected: no whitespace errors, no `.env.local`, model cache, uploaded test image, `.next` or `node_modules` files in the diff.

- [ ] **Step 6: Commit documentation and final verification records**

```bash
git add PRODUCT.md README.md docs/ai-matching-evaluation.md docs/ai-feature-suite.md
git commit -m "docs: explain role workspaces and AI feature suite"
```
