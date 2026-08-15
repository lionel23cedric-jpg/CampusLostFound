# Report Submission Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an accessible, responsive `/reports/new` experience that lets an authenticated student submit a complete lost or found report through the existing tested API.

**Architecture:** Follow the existing authentication frontend boundaries: a strict browser API client owns HTTP and runtime response validation, a pure form-validation module converts browser values into the existing report contract, a focused form owns field interaction, and a submission client owns session, reference-data and success states. Reuse React, Zod, native controls, CSS Modules and the existing HttpOnly-cookie APIs without adding dependencies.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod 4, CSS Modules, Vitest 4, Testing Library and native Fetch.

## Global Constraints

- Work only on `feature/issue-16-report-submission-frontend` and reference Issue #16 in implementation commits.
- Do not add npm dependencies or change existing API contracts.
- Reuse `AuthSessionProvider`; never read, copy or store the HttpOnly session token in browser code.
- Image input is HTTPS URL only, with at most five URLs; do not add upload or cloud-storage code.
- Only active students may see and submit the form; server authorisation remains authoritative.
- Keep public report details visually and semantically separate from private ownership-verification evidence.
- Never render raw HTML, raw response bodies, database errors, private answers or credentials.
- Automated tests must mock Fetch and session state; do not read `.env.local`, connect to Atlas or create real records.
- Use native form controls, visible labels, keyboard-operable controls, `aria-invalid`, `aria-describedby`, focus recovery and live status messages.
- Support 320, 375, 768 and 1440 CSS-pixel widths without horizontal overflow.
- Preserve the existing application visual language and New Zealand English copy.

---

### Task 1: Strict report browser API client

**Files:**
- Create: `web/src/lib/reports/browser-client.ts`
- Test: `web/src/lib/reports/browser-client.test.ts`

**Interfaces:**
- Consumes: `CreateReportInput` from `@/lib/reports/validation` and the existing `/api/categories`, `/api/campus-locations`, `/api/reports` response contracts.
- Produces: `ReportCategory`, `ReportCampusLocation`, `CreatedReport`, `BrowserReportError`, `getReportCategories()`, `getReportCampusLocations()` and `submitReport(input)`.

- [ ] **Step 1: Write the failing browser-client tests**

Create node-environment tests that mock `global.fetch` and assert:

- Category and campus-location GET requests use `credentials: "same-origin"`.
- Report submission sends `POST`, JSON content type and the exact validated body.
- Strict valid responses return typed values.
- Unknown fields or malformed dates in successful responses cause `REQUEST_FAILED`.
- Exact public API errors preserve `status`, `code`, `message` and `fields`.
- Non-JSON errors and malformed public errors become generic `REQUEST_FAILED` errors.
- Rejected Fetch becomes `NETWORK_ERROR` without exposing the thrown message.

Use concrete fixtures such as:

```ts
const category = {
  id: "507f1f77bcf86cd799439011",
  name: "Electronics",
  description: "Phones, laptops and chargers",
};

const campusLocation = {
  id: "507f191e810c19729de860ea",
  campusName: "Auckland",
  locationName: "Library",
  description: null,
};
```

- [ ] **Step 2: Run the focused tests to verify the red state**

Run:

```powershell
cd web
npm.cmd test -- src/lib/reports/browser-client.test.ts
```

Expected: FAIL because `browser-client.ts` does not exist.

- [ ] **Step 3: Implement strict runtime contracts and request helpers**

Implement strict Zod schemas for both reference responses, the owner-safe created report and the public error envelope. Define the public interface exactly:

```ts
export type ReportCategory = {
  id: string;
  name: string;
  description: string | null;
};

export type ReportCampusLocation = {
  id: string;
  campusName: string;
  locationName: string;
  description: string | null;
};

export type CreatedReport = {
  id: string;
  reporterId: string;
  reportType: "lost" | "found";
  title: string;
  publicDescription: string;
  categoryId: string;
  campusLocationId: string;
  occurredAt: string;
  colors: string[];
  tags: string[];
  photoUrls: string[];
  status: "draft" | "open" | "claim_pending" | "resolved" | "closed";
  privacySettings: {
    showPhoto: boolean;
    showEventDate: boolean;
    showCampusLocation: boolean;
  };
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export class BrowserReportError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields?: Record<string, string[]>;
}

export async function getReportCategories(): Promise<ReportCategory[]>;
export async function getReportCampusLocations(): Promise<ReportCampusLocation[]>;
export async function submitReport(
  input: CreateReportInput,
): Promise<CreatedReport>;
```

Use one same-origin Fetch helper, one safe JSON reader and one error parser. `submitReport` may receive a `Date` in `occurredAt`; `JSON.stringify` must emit the existing ISO request value. Keep error copy stable:

```ts
const GENERIC_MESSAGE = "We could not complete that request. Please try again.";
const NETWORK_MESSAGE = "We could not reach the service. Please try again.";
```

- [ ] **Step 4: Run focused tests and lint**

Run:

```powershell
npm.cmd test -- src/lib/reports/browser-client.test.ts
npx.cmd eslint src/lib/reports/browser-client.ts src/lib/reports/browser-client.test.ts
```

Expected: all focused tests pass and ESLint exits 0.

- [ ] **Step 5: Commit Task 1**

```powershell
git add web/src/lib/reports/browser-client.ts web/src/lib/reports/browser-client.test.ts
git diff --cached --check
git commit -m "feat(report-ui): add strict report browser client" -m "Refs #16"
```

---

### Task 2: Browser form contract and transformation

**Files:**
- Create: `web/src/lib/reports/form-validation.ts`
- Test: `web/src/lib/reports/form-validation.test.ts`

**Interfaces:**
- Consumes: the existing `CreateReportInput` server type for the successful output boundary.
- Produces: `ReportFormValues`, `ReportFormErrors`, `createInitialReportFormValues()` and `validateReportForm(values)`.

- [ ] **Step 1: Write table-driven failing validation tests**

Cover every approved group with explicit boundary cases:

- `lost` and `found`; reject any other type.
- Trimmed title 5-120 and public description 10-2000.
- Valid ObjectId category/location values.
- Required local date/time, invalid date and future date.
- Comma-separated colours normalised to 1-5 trimmed entries of at most 32 characters.
- Comma-separated tags normalised to at most 10 trimmed lowercase entries of at most 40 characters.
- Blank photo rows omitted; non-HTTPS, malformed and more than five nonblank URLs rejected.
- All three privacy defaults initially true and retained as booleans.
- 1-10 distinguishing features with the 200-character limit.
- Blank optional private fields normalised to `null`; enforce 500/200/2000-character maxima.
- 1-5 strict verification pairs with question 5-200 and answer 1-500.
- UI-only row identifiers never appear in the result.
- Errors use stable dotted keys such as `photoUrls.0` and `privateVerification.verificationQuestions.0.question`.

Define UI rows explicitly in the test fixtures:

```ts
export type TextFormRow = { id: string; value: string };
export type VerificationFormRow = {
  id: string;
  question: string;
  expectedAnswer: string;
};
```

- [ ] **Step 2: Run the focused tests to verify the red state**

```powershell
npm.cmd test -- src/lib/reports/form-validation.test.ts
```

Expected: FAIL because the form-validation module does not exist.

- [ ] **Step 3: Implement the form schema and deterministic transformations**

Define the browser state shape:

```ts
export type ReportFormValues = {
  reportType: "lost" | "found";
  title: string;
  publicDescription: string;
  categoryId: string;
  campusLocationId: string;
  occurredAt: string;
  colors: string;
  tags: string;
  photoUrls: TextFormRow[];
  privacySettings: {
    showPhoto: boolean;
    showEventDate: boolean;
    showCampusLocation: boolean;
  };
  privateVerification: {
    distinguishingFeatures: TextFormRow[];
    exactLocationDetails: string;
    serialNumber: string;
    verificationQuestions: VerificationFormRow[];
    privateNotes: string;
  };
};
```

Use a pure Zod schema and a small issue-to-dotted-path reducer. Return a discriminated union:

```ts
export type ReportFormValidation =
  | { success: true; data: CreateReportInput }
  | { success: false; errors: ReportFormErrors };
```

`createInitialReportFormValues()` accepts an optional ID creator so tests remain deterministic while production uses `crypto.randomUUID`:

```ts
export function createInitialReportFormValues(
  createId: () => string = () => crypto.randomUUID(),
): ReportFormValues;
```

- [ ] **Step 4: Run focused tests and lint**

```powershell
npm.cmd test -- src/lib/reports/form-validation.test.ts
npx.cmd eslint src/lib/reports/form-validation.ts src/lib/reports/form-validation.test.ts
```

Expected: all boundary and transformation tests pass; ESLint exits 0.

- [ ] **Step 5: Commit Task 2**

```powershell
git add web/src/lib/reports/form-validation.ts web/src/lib/reports/form-validation.test.ts
git diff --cached --check
git commit -m "feat(report-ui): validate report form input" -m "Refs #16"
```

---

### Task 3: Accessible grouped report form

**Files:**
- Create: `web/src/components/reports/report-form.tsx`
- Create: `web/src/components/reports/report-form.module.css`
- Test: `web/src/components/reports/report-form.test.tsx`

**Interfaces:**
- Consumes: `ReportCategory`, `ReportCampusLocation`, `BrowserReportError`, `submitReport`, `ReportFormValues` and `validateReportForm`.
- Produces: `ReportForm` with callbacks for success, expired authentication, changed permission and unavailable references.

```ts
type ReportFormProps = {
  categories: ReportCategory[];
  campusLocations: ReportCampusLocation[];
  onSuccess: (report: CreatedReport) => void;
  onAuthenticationRequired: () => void;
  onPermissionLost: () => void;
  onReferenceUnavailable: () => Promise<void>;
};
```

- [ ] **Step 1: Write the failing accessible form tests**

Add `// @vitest-environment jsdom` and mock the report browser client. Verify:

- Four named groups render with semantic `fieldset` and `legend` elements.
- Lost/found radios, all fixed fields and the three default-checked privacy controls are labelled.
- Reference selectors use category name and `campusName - locationName` text.
- One photo row, distinguishing-feature row and verification pair render initially.
- Add/remove controls preserve stable row IDs, enforce minimum required rows and disable at server maxima.
- Submit with invalid data focuses the summary, lists errors, sets `aria-invalid` and links each error via `aria-describedby`.
- Editing an invalid field removes its stale error.
- A valid submission calls `submitReport` once with the exact transformed payload.
- The submit button is disabled and labelled while pending; a second submit is ignored.
- 400 field errors merge into the summary without displaying submitted private values.
- 401, 403 and 422 invoke the appropriate callbacks; 422 marks the matching selector.
- Network and 500 errors show only generic retryable copy.

Use Testing Library queries by role and accessible name. Do not assert CSS class names.

- [ ] **Step 2: Run the focused tests to verify the red state**

```powershell
npm.cmd test -- src/components/reports/report-form.test.tsx
```

Expected: FAIL because `report-form.tsx` does not exist.

- [ ] **Step 3: Implement the grouped form with native controls**

Use one `useState(() => createInitialReportFormValues())`, one `isPending` flag, one safe form alert and one error-summary ref. Implement small local update helpers rather than a generic form framework.

Dynamic rows must use their `id` as the React key and as part of the input ID:

```tsx
<input
  id={`photo-${row.id}`}
  value={row.value}
  onChange={(event) => updatePhoto(row.id, event.target.value)}
/>
```

The validation summary uses `role="alert"`, `tabIndex={-1}` and receives focus after failed submission. Focus the first invalid field after the summary is announced. Render user data only through ordinary JSX text.

Map public API errors exactly:

```ts
if (error.code === "AUTHENTICATION_REQUIRED") onAuthenticationRequired();
else if (error.code === "REPORT_CREATION_FORBIDDEN") onPermissionLost();
else if (error.code === "CATEGORY_UNAVAILABLE") {
  setErrors({ categoryId: [error.message] });
  await onReferenceUnavailable();
} else if (error.code === "CAMPUS_LOCATION_UNAVAILABLE") {
  setErrors({ campusLocationId: [error.message] });
  await onReferenceUnavailable();
}
```

Style a single-column mobile form first. At wider breakpoints, place only short related fields side-by-side. Keep all controls at least 44 CSS pixels high, preserve visible focus and ensure repeated groups never overflow.

- [ ] **Step 4: Run focused tests and lint**

```powershell
npm.cmd test -- src/components/reports/report-form.test.tsx src/lib/reports/form-validation.test.ts
npx.cmd eslint src/components/reports/report-form.tsx src/components/reports/report-form.test.tsx
```

Expected: all form and validation tests pass; ESLint exits 0.

- [ ] **Step 5: Commit Task 3**

```powershell
git add web/src/components/reports/report-form.tsx web/src/components/reports/report-form.module.css web/src/components/reports/report-form.test.tsx
git diff --cached --check
git commit -m "feat(report-ui): build accessible report form" -m "Refs #16"
```

---

### Task 4: Protected submission flow and safe success state

**Files:**
- Create: `web/src/components/reports/report-submission-client.tsx`
- Create: `web/src/components/reports/report-submission.module.css`
- Create: `web/src/components/reports/report-success.tsx`
- Test: `web/src/components/reports/report-submission-client.test.tsx`

**Interfaces:**
- Consumes: `useAuthSession`, `getReportCategories`, `getReportCampusLocations`, `ReportForm` and `CreatedReport`.
- Produces: `ReportSubmissionClient`, the complete protected page body used by the App Router page.

- [ ] **Step 1: Write failing state-machine and success tests**

Mock `next/navigation`, `useAuthSession`, reference requests and `ReportForm`. Assert:

- Loading session renders a polite status and makes no reference request.
- Unauthenticated state calls `router.replace("/login")` and makes no reference request.
- Unavailable session renders Retry and calls `refreshSession`.
- Authenticated staff and administrator users see the permission state and make no reference request.
- An authenticated student loads categories and locations in parallel exactly once.
- Reference loading, empty lists and request failure render safe states.
- Retry reruns both reference calls and restores the form after success.
- The ready state passes exact options and callbacks to `ReportForm`.
- Authentication loss redirects to login; permission loss replaces the form.
- A created report replaces the form with the confirmation card.
- Confirmation includes type, title, status and ID but contains none of the fixture's distinguishing feature, exact location, serial number, question, answer or private notes.
- “Submit another report” mounts a fresh form; “Back to dashboard” links to `/dashboard`.

- [ ] **Step 2: Run the focused tests to verify the red state**

```powershell
npm.cmd test -- src/components/reports/report-submission-client.test.tsx
```

Expected: FAIL because the submission client does not exist.

- [ ] **Step 3: Implement the protected state flow**

Use explicit state rather than a general state-machine dependency:

```ts
type ReferenceState =
  | { status: "idle" | "loading" }
  | { status: "ready"; categories: ReportCategory[]; campusLocations: ReportCampusLocation[] }
  | { status: "error" };
```

Load both lists with `Promise.all` only after `status === "authenticated"`, `user` exists and `user.role === "student"`. Ignore stale async completion during unmount or session changes. Treat either empty list as the same retryable unavailable state.

The success component accepts only `CreatedReport`; it cannot receive private verification data:

```ts
export function ReportSuccess({
  report,
  onSubmitAnother,
}: {
  report: CreatedReport;
  onSubmitAnother: () => void;
})
```

Use a `key` counter when resetting so every private input returns to a new empty initial state.

- [ ] **Step 4: Run focused tests and lint**

```powershell
npm.cmd test -- src/components/reports/report-submission-client.test.tsx src/components/reports/report-form.test.tsx
npx.cmd eslint src/components/reports/report-submission-client.tsx src/components/reports/report-success.tsx src/components/reports/report-submission-client.test.tsx
```

Expected: all focused component tests pass and ESLint exits 0.

- [ ] **Step 5: Commit Task 4**

```powershell
git add web/src/components/reports/report-submission-client.tsx web/src/components/reports/report-submission.module.css web/src/components/reports/report-success.tsx web/src/components/reports/report-submission-client.test.tsx
git diff --cached --check
git commit -m "feat(report-ui): add protected submission flow" -m "Refs #16"
```

---

### Task 5: Route and application navigation integration

**Files:**
- Create: `web/src/app/reports/new/page.tsx`
- Modify: `web/src/components/dashboard/dashboard-client.tsx`
- Modify: `web/src/components/dashboard/dashboard.module.css`
- Modify: `web/src/components/dashboard/dashboard-client.test.tsx`
- Modify: `web/src/components/site-header.tsx`
- Modify: `web/src/components/site-header.module.css`
- Modify: `web/src/components/site-header.test.tsx`

**Interfaces:**
- Consumes: `ReportSubmissionClient` and the existing authenticated shell.
- Produces: public route `/reports/new` plus authenticated dashboard/header entry points.

- [ ] **Step 1: Add failing route and navigation tests**

Assert:

- The new page exports metadata title `Report an item` and renders `ReportSubmissionClient` inside `<main id="main-content">`.
- The dashboard renders `Report an item` as an available link to `/reports/new`, while later workflow cards remain labelled upcoming.
- The authenticated header contains one concise `Report item` link to `/reports/new`.
- Unauthenticated, loading and unavailable header states do not expose the report link.
- Existing dashboard redirect, session retry and sign-out behaviour remain unchanged.

- [ ] **Step 2: Run the affected tests to verify the red state**

```powershell
npm.cmd test -- src/components/dashboard/dashboard-client.test.tsx src/components/site-header.test.tsx
```

Expected: FAIL because the report navigation entries are absent.

- [ ] **Step 3: Add the App Router page and real entry points**

Create the route entry:

```tsx
import type { Metadata } from "next";

import { ReportSubmissionClient } from "@/components/reports/report-submission-client";

export const metadata: Metadata = { title: "Report an item" };

export default function NewReportPage() {
  return (
    <main id="main-content">
      <ReportSubmissionClient />
    </main>
  );
}
```

Convert only the first dashboard workflow card into an available action; do not invent list, search or claim destinations. Add the authenticated header link and adjust its existing responsive CSS so 320-pixel width remains usable without clipping.

- [ ] **Step 4: Run affected tests, full tests and lint**

```powershell
npm.cmd test -- src/components/dashboard/dashboard-client.test.tsx src/components/site-header.test.tsx src/components/reports
npm.cmd test
npm.cmd run lint
```

Expected: all test files pass and ESLint exits 0.

- [ ] **Step 5: Commit Task 5**

```powershell
git add web/src/app/reports/new/page.tsx web/src/components/dashboard/dashboard-client.tsx web/src/components/dashboard/dashboard.module.css web/src/components/dashboard/dashboard-client.test.tsx web/src/components/site-header.tsx web/src/components/site-header.module.css web/src/components/site-header.test.tsx
git diff --cached --check
git commit -m "feat(report-ui): integrate report submission route" -m "Refs #16"
```

---

### Task 6: Full quality, security and responsive verification

**Files:**
- Modify only files already named by Tasks 1-5 if a verification failure proves a focused correction is required.

**Interfaces:**
- Consumes: the complete Issue #16 branch.
- Produces: release-ready verification evidence without live Atlas writes.

- [ ] **Step 1: Run the complete automated checks in strict order**

From `web/`, stop at the first substantive failure:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd audit
```

Expected: every command exits 0 and `npm audit` reports 0 vulnerabilities.

- [ ] **Step 2: Verify secret handling, whitespace and branch scope**

From the repository root:

```powershell
git status --short --ignored web/.env.local
git diff --check develop...HEAD
git diff --stat develop...HEAD
git diff --name-status develop...HEAD
git status --short --branch
```

Expected: `.env.local` is reported with `!!`, no secret content is read, diff checks are clean, and only approved Issue #16 docs/plan/frontend files appear.

- [ ] **Step 3: Run local browser checks without submitting a real report**

Start the existing development server:

```powershell
cd web
npm.cmd run dev
```

Use mocked browser responses or stop before the final submit action. Verify at 320, 375, 768 and 1440 CSS pixels:

- No horizontal overflow.
- Header, grouped form, dynamic rows and success fixture remain readable.
- Keyboard order follows visual order.
- Focus moves to the error summary and first invalid field.
- Add/remove controls and all labels have accessible names.
- Private verification copy is clearly separate from public content.
- Browser console contains no errors or warnings.

- [ ] **Step 4: Fix only proven Issue #16 failures and rerun affected checks**

For each failure, first add or strengthen the smallest regression test, confirm it fails, make the minimal fix, rerun the focused test and then rerun the complete check that exposed it. Do not refactor unrelated authentication, report backend or model code.

- [ ] **Step 5: Commit any verified corrections separately**

If no corrections were needed, do not create an empty commit. Otherwise stage only the exact corrected files:

```powershell
git add web/src/app/reports/new/page.tsx web/src/components/reports web/src/components/dashboard/dashboard-client.tsx web/src/components/dashboard/dashboard.module.css web/src/components/dashboard/dashboard-client.test.tsx web/src/components/site-header.tsx web/src/components/site-header.module.css web/src/components/site-header.test.tsx web/src/lib/reports/browser-client.ts web/src/lib/reports/browser-client.test.ts web/src/lib/reports/form-validation.ts web/src/lib/reports/form-validation.test.ts
git diff --cached --check
git commit -m "fix(report-ui): harden submission experience" -m "Refs #16"
```

- [ ] **Step 6: Record final evidence for the pull request**

Record exact test-file/test counts, lint/build/audit results, responsive widths, console result, ignored-secret result and the statement that no live report was submitted and no Atlas record was created during verification.
