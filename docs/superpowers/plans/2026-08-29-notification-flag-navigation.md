# Notification, Flagging, and Navigation Verification Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make notification actions clear their unread badge, make report flag submission complete under React Strict Mode, and give drill-down pages deterministic in-application return links.

**Architecture:** Reuse the existing notification provider, flag API client, Next.js search parameters, and established back-link styles. Carry only the trusted `returnTo=/notifications` source marker; all other navigation falls back to fixed parent routes selected from existing ownership context.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS Modules, Vitest, Testing Library.

## Global Constraints

- Add no dependencies, database fields, API routes, roles, global breadcrumbs, or browser-history abstraction.
- Accept only the exact application-controlled return marker `/notifications`; never follow arbitrary return URLs.
- Preserve existing protected access, notification persistence, report flagging, and page styling.
- Keep every interactive target keyboard accessible and at least 44 pixels high.

---

## File Structure

- `web/src/components/notifications/notification-centre.tsx`: mark unread notification actions and append the trusted source marker.
- `web/src/components/notifications/notification-centre.test.tsx`: cover action destinations and mark-as-read behaviour.
- `web/src/components/reports/report-flag-panel.tsx`: correct mounted-state setup under React Strict Mode.
- `web/src/components/reports/report-flag-panel.test.tsx`: reproduce and prevent the Strict Mode loading regression.
- `web/src/components/reports/report-detail-client.tsx`: choose the report detail return route from trusted source and report ownership.
- `web/src/components/reports/report-detail-client.test.tsx`: cover notification, owned-report, and public-report return links.
- `web/src/components/claims/claim-detail-client.tsx`: choose notification or My claims return navigation.
- `web/src/components/claims/claim-detail-client.test.tsx`: cover claim return-link selection.
- `web/src/components/admin/admin-overview-client.tsx`: expose the dashboard parent route in the ready state.
- `web/src/components/admin/admin-overview.module.css`: apply the existing 44-pixel accessible link treatment to the new return link.
- `web/src/components/admin/admin-overview-client.test.tsx`: cover the administrator return link.

### Task 1: Notification action read state and source marker

**Files:**
- Modify: `web/src/components/notifications/notification-centre.test.tsx`
- Modify: `web/src/components/notifications/notification-centre.tsx`

**Interfaces:**
- Consumes: `NotificationContextValue.markRead(id: string): Promise<void>` and each notification's internal `action.href`.
- Produces: action links ending in `?returnTo=%2Fnotifications` and an action click that calls `markRead` only for unread notifications.

- [ ] **Step 1: Write failing action tests**

Change the safe-action assertion and replace the previous no-auto-mark test with:

```tsx
expect(screen.getByRole("link", { name: "View claim" }).getAttribute("href")).toBe(
  `${unreadClaim.action.href}?returnTo=%2Fnotifications`,
);

it("marks an unread notification from its action link", () => {
  renderCentre({ notifications: [unreadClaim] });
  const link = screen.getByRole("link", { name: "View claim" });
  link.addEventListener("click", (event) => event.preventDefault());
  fireEvent.click(link);
  expect(actions.markRead).toHaveBeenCalledWith(unreadClaim.id);
});

it("does not mark an already-read action again", () => {
  renderCentre({ notifications: [readReport], unreadCount: 0 });
  const link = screen.getByRole("link", { name: "View report" });
  link.addEventListener("click", (event) => event.preventDefault());
  fireEvent.click(link);
  expect(actions.markRead).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run from `web`: `npm test -- src/components/notifications/notification-centre.test.tsx`

Expected: FAIL because the link has no source marker and does not call `markRead`.

- [ ] **Step 3: Implement the minimal action behaviour**

Use the existing provider operation directly on the link:

```tsx
<Link
  className={styles.detailLink}
  href={`${notification.action.href}?returnTo=%2Fnotifications`}
  onClick={() => {
    if (!notification.isRead) void notifications.markRead(notification.id);
  }}
>
  {notification.action.label}
</Link>
```

- [ ] **Step 4: Run the focused test and confirm success**

Run: `npm test -- src/components/notifications/notification-centre.test.tsx`

Expected: all notification-centre tests PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/notifications/notification-centre.tsx web/src/components/notifications/notification-centre.test.tsx
git commit -m "fix: read notifications from actions"
```

### Task 2: Report flag Strict Mode lifecycle

**Files:**
- Modify: `web/src/components/reports/report-flag-panel.test.tsx`
- Modify: `web/src/components/reports/report-flag-panel.tsx`

**Interfaces:**
- Consumes: existing `submitBrowserReportFlag(reportId, input, signal)` and `AbortController` guards.
- Produces: mounted state that is true during every active effect setup and false only after cleanup.

- [ ] **Step 1: Write the Strict Mode regression test**

Import `StrictMode` and render the successful submission inside it:

```tsx
it("completes submission under React Strict Mode", async () => {
  const user = userEvent.setup();
  render(
    <StrictMode>
      <ReportFlagPanel reportId={reportId} />
    </StrictMode>,
  );

  await user.click(screen.getByRole("button", { name: "Report this listing" }));
  await user.selectOptions(screen.getByLabelText("Reason"), "privacy_concern");
  await user.click(screen.getByRole("button", { name: "Submit report" }));

  expect((await screen.findByRole("status")).textContent).toContain(
    "Your concern has been sent for administrator review",
  );
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npm test -- src/components/reports/report-flag-panel.test.tsx`

Expected: FAIL because Strict Mode cleanup leaves `mounted.current` false and the component remains submitting.

- [ ] **Step 3: Fix effect setup and cleanup**

Replace the cleanup-only effect with:

```tsx
useEffect(() => {
  mounted.current = true;
  return () => {
    mounted.current = false;
    controller.current?.abort();
  };
}, []);
```

- [ ] **Step 4: Run the focused test and confirm success**

Run: `npm test -- src/components/reports/report-flag-panel.test.tsx`

Expected: all report-flag-panel tests PASS, including unmount abort coverage.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/reports/report-flag-panel.tsx web/src/components/reports/report-flag-panel.test.tsx
git commit -m "fix: complete report flags in strict mode"
```

### Task 3: Context-aware report and claim return links

**Files:**
- Modify: `web/src/components/reports/report-detail-client.test.tsx`
- Modify: `web/src/components/reports/report-detail-client.tsx`
- Modify: `web/src/components/claims/claim-detail-client.test.tsx`
- Modify: `web/src/components/claims/claim-detail-client.tsx`

**Interfaces:**
- Consumes: `useSearchParams().get("returnTo")`, report `isOwner`, and fixed routes `/notifications`, `/reports/mine`, `/reports`, and `/claims`.
- Produces: `{ href: string; label: string }` values selected locally in each detail component; no shared helper or arbitrary redirect support.

- [ ] **Step 1: Mock search parameters and write report return-link tests**

Extend the Next navigation mock and default setup:

```tsx
vi.mock("next/navigation", () => ({ useRouter: vi.fn(), useSearchParams: vi.fn() }));
import { useRouter, useSearchParams } from "next/navigation";

beforeEach(() => {
  vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams() as never);
});
```

Assert the default owner link is `/reports/mine`, a non-owner link is `/reports`, and the trusted marker wins:

```tsx
vi.mocked(useSearchParams).mockReturnValue(
  new URLSearchParams("returnTo=%2Fnotifications") as never,
);
render(<ReportDetailClient reportId={memberReport.id} />);
expect(
  (await screen.findByRole("link", { name: "Back to notifications" })).getAttribute("href"),
).toBe("/notifications");
```

Also pass `returnTo=https://example.com` with a non-owner report and assert the link remains `Back to reports` with `/reports`.

- [ ] **Step 2: Run the report detail test and confirm failure**

Run: `npm test -- src/components/reports/report-detail-client.test.tsx`

Expected: FAIL because `useSearchParams` is not consumed and the ready state always links to `/reports`.

- [ ] **Step 3: Implement report return-link selection**

Import and read `useSearchParams`, then select only fixed values after the report loads:

```tsx
const searchParams = useSearchParams();
const fromNotifications = searchParams.get("returnTo") === "/notifications";

const backLink = fromNotifications
  ? { href: "/notifications", label: "Back to notifications" }
  : report.isOwner
    ? { href: "/reports/mine", label: "Back to My reports" }
    : { href: "/reports", label: "Back to reports" };
```

Render `backLink.href` and `backLink.label` through the existing `styles.backLink` anchor.

- [ ] **Step 4: Run the report detail test and confirm success**

Run: `npm test -- src/components/reports/report-detail-client.test.tsx`

Expected: all report-detail tests PASS.

- [ ] **Step 5: Mock search parameters and write claim return-link tests**

Apply the same `useSearchParams` mock default in `claim-detail-client.test.tsx`. Keep the existing `/claims` assertion, and add:

```tsx
vi.mocked(useSearchParams).mockReturnValue(
  new URLSearchParams("returnTo=%2Fnotifications") as never,
);
render(<ClaimDetailClient claimId={claimantClaim.id} />);
expect(
  (await screen.findByRole("link", { name: "Back to notifications" })).getAttribute("href"),
).toBe("/notifications");
```

- [ ] **Step 6: Run the claim detail test and confirm failure**

Run: `npm test -- src/components/claims/claim-detail-client.test.tsx`

Expected: FAIL because the detail always links to `/claims`.

- [ ] **Step 7: Implement claim return-link selection**

Read the exact safe marker and switch the existing link:

```tsx
const searchParams = useSearchParams();
const fromNotifications = searchParams.get("returnTo") === "/notifications";
const backHref = fromNotifications ? "/notifications" : "/claims";
const backLabel = fromNotifications ? "Back to notifications" : "Back to My claims";
```

Render `backHref` and `backLabel` through the existing `styles.backLink` anchor.

- [ ] **Step 8: Run both detail test files**

Run: `npm test -- src/components/reports/report-detail-client.test.tsx src/components/claims/claim-detail-client.test.tsx`

Expected: both suites PASS, including arbitrary `returnTo` fallback coverage.

- [ ] **Step 9: Commit**

```bash
git add web/src/components/reports/report-detail-client.tsx web/src/components/reports/report-detail-client.test.tsx web/src/components/claims/claim-detail-client.tsx web/src/components/claims/claim-detail-client.test.tsx
git commit -m "fix: add deterministic detail navigation"
```

### Task 4: Administrator overview return link

**Files:**
- Modify: `web/src/components/admin/admin-overview-client.test.tsx`
- Modify: `web/src/components/admin/admin-overview-client.tsx`
- Modify: `web/src/components/admin/admin-overview.module.css`

**Interfaces:**
- Consumes: fixed parent route `/dashboard` and existing administrator overview CSS tokens.
- Produces: a ready-state `Back to dashboard` link with the existing minimum target and focus treatment.

- [ ] **Step 1: Write the failing ready-state link assertion**

Add to the main overview rendering test:

```tsx
expect(
  screen.getByRole("link", { name: "Back to dashboard" }).getAttribute("href"),
).toBe("/dashboard");
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `npm test -- src/components/admin/admin-overview-client.test.tsx`

Expected: FAIL because only the access-changed state currently exposes that link.

- [ ] **Step 3: Add the ready-state link and style it**

Place the link before the overview header:

```tsx
<Link className={styles.backLink} href="/dashboard">
  Back to dashboard
</Link>
```

Add a compact style that matches existing detail return links:

```css
.backLink {
  display: inline-flex;
  width: fit-content;
  min-height: 44px;
  align-items: center;
  color: var(--campus-green-dark);
  font-weight: 750;
}

.backLink:focus-visible {
  outline: 3px solid var(--campus-green-dark);
  outline-offset: 3px;
}
```

- [ ] **Step 4: Run the focused test and confirm success**

Run: `npm test -- src/components/admin/admin-overview-client.test.tsx`

Expected: all administrator overview tests PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/admin/admin-overview-client.tsx web/src/components/admin/admin-overview-client.test.tsx web/src/components/admin/admin-overview.module.css
git commit -m "fix: add administrator return navigation"
```

### Task 5: Full verification and documentation

**Files:**
- Create: `docs/testing/2026-08-29-notification-flag-navigation-verification.md`

**Interfaces:**
- Consumes: all completed changes and the repository's existing quality commands.
- Produces: a reproducible verification record with exact pass counts and any environment-limited audit result.

- [ ] **Step 1: Run all focused suites together**

Run from `web`:

```bash
npm test -- src/components/notifications/notification-centre.test.tsx src/components/reports/report-flag-panel.test.tsx src/components/reports/report-detail-client.test.tsx src/components/claims/claim-detail-client.test.tsx src/components/admin/admin-overview-client.test.tsx
```

Expected: all five files PASS.

- [ ] **Step 2: Run the full automated gate**

Run:

```bash
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
npm audit
```

Expected: tests, lint, TypeScript, and build PASS. Record the exact `npm audit` result; a registry/network failure is an environment limitation, not a passing audit.

- [ ] **Step 3: Run the design detector once**

Run the Impeccable detector against the changed UI files and resolve any relevant accessibility, responsive, or interaction findings in one bounded pass.

- [ ] **Step 4: Write the verification record**

Record the branch, changed behaviours, exact test totals, lint/type/build outcomes, audit result, and the remaining manual checks:

```markdown
# Notification, Flagging, and Navigation Verification

- Notification action: unread badge updates through the existing provider.
- Report concern: submission reaches success under React Strict Mode.
- Return navigation: notification, owner, public, claimant, and administrator routes are deterministic.
- Automated checks: record every command, pass count, and exit result from the verification steps above.
- Manual follow-up: hard-refresh the running app and repeat validation from step 12.
```

- [ ] **Step 5: Commit the verification record and any bounded detector fixes**

```bash
git add docs/testing/2026-08-29-notification-flag-navigation-verification.md web/src
git commit -m "docs: verify notification and navigation fixes"
```
