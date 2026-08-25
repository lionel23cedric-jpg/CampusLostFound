# Explainable Intelligent Matching Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an accessible owner-only panel to open report details that requests, validates and displays the Issue #25 explainable match results.

**Architecture:** Extend the existing report browser client with a closed Zod contract, keep matching request state inside a focused `ReportMatchesPanel`, and let `ReportDetailClient` control only owner/open visibility. The panel is user-triggered, renders server explanations as plain text and links candidates to existing report details.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Zod 4, CSS Modules, Vitest 4, Testing Library and the existing report-detail/session patterns.

## Global Constraints

- Implement only Issue #27; do not change backend scoring, queries, errors or thresholds.
- Make no request before the user activates `Find possible matches`.
- Render the panel only for a report with `isOwner === true` and `status === "open"`.
- Accept at most five matches with scores from 35 through 100 and strict, internally consistent factors.
- Treat results as suggestions, never ownership proof or an automatic claim.
- Never render reporter identity, privacy settings, verification evidence, contacts or authentication data.
- Add no dependency, external request, persisted state, image recognition or new route page.
- Preserve existing report detail, claim, session, focus and responsive behaviours.
- Native interactive controls must remain at least 44 CSS pixels high and usable at 320 CSS pixels.
- Tests mock fetch and do not connect to Atlas or read `.env.local`.
- Every commit references Issue #27.

## File Structure

- Modify `web/src/lib/reports/browser-client.ts`: matching types, strict schemas and `getReportMatches`.
- Modify `web/src/lib/reports/browser-client.test.ts`: request, parsing, consistency, privacy and error tests.
- Create `web/src/components/reports/report-matches-panel.tsx`: isolated matching state machine and semantic results.
- Create `web/src/components/reports/report-matches-panel.test.tsx`: interaction, race, access, privacy and accessibility tests.
- Create `web/src/components/reports/report-matches.module.css`: matching-panel responsive presentation.
- Modify `web/src/components/reports/report-detail-client.tsx`: owner/open visibility integration only.
- Modify `web/src/components/reports/report-detail-client.test.tsx`: integration matrix and no-eager-request proof.
- Create `docs/superpowers/verification/2026-08-25-explainable-matching-frontend.md`: exact quality, accessibility and privacy evidence.

---

### Task 1: Strict Matching Browser Client

**Files:**
- Modify: `web/src/lib/reports/browser-client.test.ts`
- Modify: `web/src/lib/reports/browser-client.ts`

**Interfaces:**
- Consumes: existing `memberReportSchema`, `fetchSameOrigin`, `parseResponse` and `BrowserReportError`.
- Produces: `MatchFactorKey`, `MatchFactor`, `ReportMatch`, `ReportMatches` and `getReportMatches(id: string): Promise<ReportMatches>`.

- [ ] **Step 1: Add failing browser-client tests**

Add a valid fixture:

```ts
const reportMatches = {
  sourceReportId: "source-report",
  matches: [{
    report: {
      id: "candidate-report",
      reportType: "found",
      title: "Black laptop charger",
      publicDescription: "Found beside the library desk.",
      categoryId: "electronics",
      campusLocationId: null,
      occurredAt: "2026-08-24T02:00:00.000Z",
      colors: ["black"],
      tags: ["laptop", "charger"],
      photoUrls: [],
      status: "open",
      resolvedAt: null,
      createdAt: "2026-08-24T03:00:00.000Z",
      updatedAt: "2026-08-24T03:00:00.000Z",
      isOwner: false,
    },
    score: 40,
    factors: [
      { key: "category", points: 25, maximum: 25, explanation: "Same category" },
      { key: "location", points: 15, maximum: 15, explanation: "Same public campus location" },
    ],
  }],
};
```

Assert:

```ts
fetchMock.mockResolvedValue(jsonResponse(reportMatches));
await expect(getReportMatches("source/report")).resolves.toEqual(reportMatches);
expect(fetchMock).toHaveBeenCalledWith(
  "/api/reports/source%2Freport/matches",
  { method: "GET", credentials: "same-origin" },
);
```

Add table tests that clone and mutate the fixture to reject:

- score 34 or 101;
- factor points 0, above maximum or non-integer;
- incorrect maximum for a factor key;
- duplicate factor keys;
- score unequal to the factor sum;
- duplicate candidate IDs;
- six matches;
- unknown top-level, match, factor or report field;
- `reporterId`, `privacySettings`, `expectedAnswer`, `email` and `tokenHash` injections.

Reuse existing browser-client helpers to assert malformed JSON becomes exact
`REQUEST_FAILED`, a structured non-2xx error remains a `BrowserReportError`,
and rejected `fetch` becomes exact `NETWORK_ERROR`.

- [ ] **Step 2: Run the focused browser-client test and confirm red**

```powershell
npm.cmd test -- src/lib/reports/browser-client.test.ts
```

Expected: FAIL because `getReportMatches` and matching types do not exist.

- [ ] **Step 3: Add matching types and strict schemas**

Add exported contracts:

```ts
export type MatchFactorKey =
  | "category" | "location" | "date" | "colors" | "tags" | "text";
export type MatchFactor = {
  key: MatchFactorKey;
  points: number;
  maximum: number;
  explanation: string;
};
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

Define exact maximums:

```ts
const matchFactorMaximums = {
  category: 25,
  location: 15,
  date: 15,
  colors: 15,
  tags: 10,
  text: 20,
} as const;
```

Build a `z.strictObject` factor schema and use `superRefine` to require
`maximum === matchFactorMaximums[key]` and `points <= maximum`. Build a strict
match schema requiring score 35–100, one through six factors, unique factor
keys and exact point-sum equality. Build a strict response with a maximum of
five matches and unique report IDs.

- [ ] **Step 4: Add the matching request**

```ts
export async function getReportMatches(id: string): Promise<ReportMatches> {
  const response = await fetchSameOrigin(
    `/api/reports/${encodeURIComponent(id)}/matches`,
    { method: "GET" },
  );
  return parseResponse(response, reportMatchesSchema);
}
```

- [ ] **Step 5: Run focused client validation**

```powershell
npm.cmd test -- src/lib/reports/browser-client.test.ts
npx.cmd eslint src/lib/reports/browser-client.ts src/lib/reports/browser-client.test.ts
npx.cmd tsc --noEmit --incremental false
```

Expected: browser-client tests, ESLint and TypeScript pass.

- [ ] **Step 6: Commit Task 1**

```powershell
git add web/src/lib/reports/browser-client.ts web/src/lib/reports/browser-client.test.ts
git diff --cached --check
git commit -m "feat(match-ui): validate matching responses" -m "Refs #27"
```

---

### Task 2: Accessible Matching Panel

**Files:**
- Create: `web/src/components/reports/report-matches-panel.test.tsx`
- Create: `web/src/components/reports/report-matches-panel.tsx`
- Create: `web/src/components/reports/report-matches.module.css`

**Interfaces:**
- Consumes: `getReportMatches`, `BrowserReportError`, `ReportMatch`, `useRouter` and one `reportId` prop.
- Produces: `ReportMatchesPanel({ reportId }: { reportId: string })` with no eager request.

- [ ] **Step 1: Write the failing component interaction tests**

Use `jsdom`, mock `next/navigation` and mock only `getReportMatches` from the
browser client while retaining actual types and errors. Assert the initial UI:

```ts
render(<ReportMatchesPanel reportId="source-report" />);
expect(screen.getByRole("heading", { name: "Possible matches" })).toBeTruthy();
expect(screen.getByRole("button", { name: "Find possible matches" })).toBeTruthy();
expect(getReportMatches).not.toHaveBeenCalled();
```

After activation, use a deferred promise to assert the disabled
`Finding possible matches` button and polite status. Resolve with two matches
and assert ordered list order, `72/100`, title, explanation, `+25`, public
colour/tag tokens and `/reports/candidate%2Fid` link.

Add exact tests for:

- empty results show `No strong matches yet` and `Check again`;
- network/500/malformed response shows a generic alert and `Retry matches`;
- 404 and 409 share `Matching is no longer available for this report`;
- 401 calls `router.replace("/login")`;
- a second request wins if the first resolves later;
- a changed `reportId` resets idle state and invalidates an old request;
- unmount prevents state updates;
- factors render as text and injected HTML-like explanation remains text;
- semantic section heading, ordered results and nested explanation lists have
  no duplicate IDs.

- [ ] **Step 2: Run the panel test and confirm red**

```powershell
npm.cmd test -- src/components/reports/report-matches-panel.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the state machine**

Use this state union:

```ts
type MatchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; matches: ReportMatch[] }
  | { status: "empty" }
  | { status: "unavailable" }
  | { status: "error" };
```

Use `mounted` and `requestId` refs. `loadMatches` increments the request ID,
sets loading, awaits `getReportMatches(reportId)`, checks both guards and then
sets ready or empty. In the catch path:

```ts
if (
  error instanceof BrowserReportError &&
  (error.status === 401 || error.code === "AUTHENTICATION_REQUIRED")
) {
  router.replace("/login");
  return;
}
if (
  error instanceof BrowserReportError &&
  (error.status === 404 || error.status === 409 ||
   error.code === "REPORT_NOT_FOUND" ||
   error.code === "REPORT_NOT_MATCHABLE")
) {
  setState({ status: "unavailable" });
  return;
}
setState({ status: "error" });
```

On `reportId` change, increment `requestId` and reset idle. On unmount, set
`mounted` false and increment the request ID.

- [ ] **Step 4: Render semantic states and cards**

Use `useId` for the section heading. Render server explanation strings only in
React text nodes. Encode every candidate ID in its link. Results are an `<ol>`;
factors, colours and tags use separate semantic `<ul>` elements with explicit
accessible labels. Provide `Refresh matches`, `Check again` and `Retry matches`
actions for their respective states.

- [ ] **Step 5: Add responsive CSS**

Create a CSS Module using existing global variables. Required rules include:

```css
.panel { width: min(100%, 74rem); margin-inline: auto; }
.action { min-height: 44px; }
.matchList { display: grid; margin: 0; padding: 0; list-style: none; }
.score { font-variant-numeric: tabular-nums; }
.card { min-width: 0; overflow-wrap: anywhere; }
@media (max-width: 20rem) {
  .panel, .card { padding-inline: 0.85rem; }
  .action, .detailLink { width: 100%; }
}
```

Do not add transitions or fixed pixel content widths.

- [ ] **Step 6: Run component verification and commit**

```powershell
npm.cmd test -- src/components/reports/report-matches-panel.test.tsx src/lib/reports/browser-client.test.ts
npx.cmd eslint src/components/reports/report-matches-panel.tsx src/components/reports/report-matches-panel.test.tsx
npx.cmd tsc --noEmit --incremental false
git add web/src/components/reports/report-matches-panel.tsx web/src/components/reports/report-matches-panel.test.tsx web/src/components/reports/report-matches.module.css
git diff --cached --check
git commit -m "feat(match-ui): add explainable matching panel" -m "Refs #27"
```

---

### Task 3: Report Detail Integration

**Files:**
- Modify: `web/src/components/reports/report-detail-client.test.tsx`
- Modify: `web/src/components/reports/report-detail-client.tsx`

**Interfaces:**
- Consumes: `ReportMatchesPanel` and the existing loaded `MemberReport`.
- Produces: exact owner/open panel visibility on `/reports/[id]` without changing existing report/claim behaviour.

- [ ] **Step 1: Add failing integration tests**

Mock `ReportMatchesPanel` as a visible marker that records its `reportId`.
Extend the existing detail tests to assert:

```ts
mockReadyResponses({ ...memberReport, isOwner: true, status: "open" });
render(<ReportDetailClient reportId={memberReport.id} />);
expect(await screen.findByTestId("matching-panel")).toHaveAttribute(
  "data-report-id", memberReport.id,
);
```

Use a table for `claim_pending`, `resolved` and `closed`, plus a non-owner open
report, and assert the marker is absent. Retain the real browser-client mock and
assert `getReportMatches` is not called merely because report details loaded.
Run the complete existing file so report loading, reference data, claims,
session redirects, stale responses and narrow layout assertions remain green.

- [ ] **Step 2: Run the report detail test and confirm red**

```powershell
npm.cmd test -- src/components/reports/report-detail-client.test.tsx
```

Expected: the owner/open marker test fails because the panel is not integrated.

- [ ] **Step 3: Add the exact integration**

Import `ReportMatchesPanel` and append after the closing report `article`:

```tsx
{report.isOwner && report.status === "open" ? (
  <ReportMatchesPanel reportId={report.id} />
) : null}
```

Do not pass session user, reference data, source report text or scoring values.
Do not change the existing Claim action condition.

- [ ] **Step 4: Run all Issue #27 focused checks**

```powershell
npm.cmd test -- src/lib/reports/browser-client.test.ts src/components/reports/report-matches-panel.test.tsx src/components/reports/report-detail-client.test.tsx
npx.cmd eslint src/lib/reports/browser-client.ts src/components/reports/report-matches-panel.tsx src/components/reports/report-detail-client.tsx
npx.cmd tsc --noEmit --incremental false
```

Expected: all client, panel and detail integration tests pass.

- [ ] **Step 5: Commit integration**

```powershell
git add web/src/components/reports/report-detail-client.tsx web/src/components/reports/report-detail-client.test.tsx
git diff --cached --check
git commit -m "feat(match-ui): integrate owner report matches" -m "Refs #27"
```

---

### Task 4: Complete Quality, Accessibility and Privacy Verification

**Files:**
- Create: `docs/superpowers/verification/2026-08-25-explainable-matching-frontend.md`

**Interfaces:**
- Consumes: completed Issue #27 browser client, panel, styling and integration.
- Produces: exact reproducible evidence for review and the academic report.

- [ ] **Step 1: Run all automated tests**

```powershell
npm.cmd test
```

Expected: every Vitest file passes. Copy the exact `Test Files` and `Tests`
lines into the verification document.

- [ ] **Step 2: Run static and production checks**

```powershell
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd run build
```

Expected: all exit 0; existing routes remain and no new page route appears.

- [ ] **Step 3: Run dependency audit**

```powershell
npm.cmd audit
```

Expected: `found 0 vulnerabilities`. Do not run a force fix.

- [ ] **Step 4: Verify environment privacy and production scope**

```powershell
git status --short --ignored web/.env.local
rg -n "reporterId|privacySettings|expectedAnswer|serialNumber|exactLocationDetails|privateNotes|passwordHash|tokenHash|dangerouslySetInnerHTML" web/src/components/reports/report-matches-panel.tsx web/src/lib/reports/browser-client.ts
rg -n "https?://|openai|embedding|MatchModel|new Schema" web/src/components/reports/report-matches-panel.tsx web/src/lib/reports/browser-client.ts
rg -n "min-height: 44px|max-width: 20rem|min-width: 0|overflow-wrap" web/src/components/reports/report-matches.module.css
```

Expected: `.env.local` is ignored; private terms occur only in strict rejection
schemas/tests rather than rendered production fields; no external AI or
persistence exists; required narrow-layout rules are present.

- [ ] **Step 5: Verify branch scope and commits**

```powershell
git diff --check develop...HEAD
git status --short --branch
git diff --name-status develop...HEAD
git log --format="%h %s%n%b" develop..HEAD
```

Expected: changes are limited to Issue #27 design, plan, verification, browser
client, matching component/style/tests and report-detail integration; every
commit contains `Refs #27`.

- [ ] **Step 6: Write the verification record**

Record exact observed command results plus:

- browser-client strict-response rejection evidence;
- no eager matching request;
- owner/open visibility matrix;
- loading, ordered results, empty, unavailable, error and retry states;
- 401 redirect and stale/unmounted response protection;
- semantic lists, live regions, 44-pixel controls and 320-pixel CSS evidence;
- no private fields, unsafe HTML, external API or Atlas access.

- [ ] **Step 7: Commit the verification record**

```powershell
git add docs/superpowers/verification/2026-08-25-explainable-matching-frontend.md
git diff --cached --check
git commit -m "docs: record matching frontend verification" -m "Refs #27"
```

- [ ] **Step 8: Push and prepare the Pull Request**

```powershell
git push -u origin feature/issue-27-intelligent-matching-frontend
```

Prepare a pull request into `develop` with `Closes #27`, the owner/open
visibility rule, user-triggered interaction, accessibility/privacy guarantees
and exact verification counts. Do not merge or delete branches before GitHub
confirms the pull request is merged.
