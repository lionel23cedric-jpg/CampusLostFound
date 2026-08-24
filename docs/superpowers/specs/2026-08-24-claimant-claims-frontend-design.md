# Claimant Claims Frontend Design

**Issue:** #21
**Status:** Approved for implementation planning
**Date:** 2026-08-24

## 1. Purpose

This feature gives an authenticated active student the complete claimant-side recovery flow: start a claim from an eligible found report, answer its verification questions, track only their own claims and safely withdraw a pending or approved claim. It is the frontend counterpart to the Claim Management Backend delivered by Issue #19.

The implementation follows the existing frontend architecture:

- Next.js App Router page shells;
- client components protected by the existing authentication session provider;
- same-origin JSON requests through a strict Zod-validated browser client;
- native form controls, Next.js links, React state and CSS Modules;
- explicit loading, empty, permission, not-found, conflict and retry states;
- Vitest and Testing Library with mocked requests and sessions;
- no new dependency, global state library or backend contract.

## 2. Scope

### Included

- A protected `/reports/[id]/claim` verification-answer page.
- A protected `/claims` page for the current student's claim history.
- A protected `/claims/[id]` page for one owned claim.
- Claim submission, manual status refresh and safe withdrawal.
- Status filtering and pagination stored in the `/claims` URL.
- A conditional `Claim this item` entry from an eligible report detail.
- `My claims` entries in the active-student header and dashboard.
- Strict browser-side validation for every Claim API response.
- Loading, empty, unavailable, permission, not-found, conflict and retry states.
- Responsive and WCAG 2.2 AA-oriented interaction contracts.
- Automated client, component, navigation, privacy and responsive-contract tests.

### Excluded

- Staff or administrator claim review, approval, rejection or completion pages.
- Notifications, background polling, WebSockets or other realtime infrastructure.
- Claim editing, answer replacement or claim resubmission.
- Correct-answer, match-count or per-answer match-result display to a claimant.
- Chat, handover scheduling, direct contact messaging or reporter contact details.
- AI matching, fuzzy verification or automatic claim decisions.
- Claim API, database model, MongoDB Atlas or authentication changes.
- Image upload, analytics, deployment, CI or a new design system.

The staff review frontend is a separate feature so both interfaces remain independently testable and reviewable.

## 3. Chosen Approach

Use a thin Claim browser client plus focused page components.

- The browser client owns same-origin fetches, strict runtime response schemas, URL construction and safe public errors.
- One access boundary owns the repeated active-student session states.
- Submission, list and detail components each own only their page state and actions.
- A single Claim CSS Module supplies the responsive visual vocabulary.
- Existing report-detail, header and dashboard components receive only the navigation changes required by this feature.

Rejected alternatives:

- One large Claim component would mix three routes, unrelated request lifecycles and withdrawal state.
- Embedding the complete workflow in the dashboard would weaken deep links, pagination and browser history.
- An inline report-detail form would overload an existing privacy-safe detail surface and complicate failure ownership.
- A modal would add focus trapping and small-screen complexity without a product benefit.
- Server-first data fetching would conflict with the current client session architecture and make mutations more complex.
- A form, query or global-state dependency would duplicate native controls, `fetch`, URL state and React state already in use.

## 4. Access Boundary

All three pages require an authenticated account whose status is `active` and whose role is exactly `student`.

The shared claimant access boundary behaves as follows:

- `loading`: render one polite status while the session is checked;
- `unauthenticated`: redirect to `/login` and render a short transition status;
- `unavailable`: preserve the possibility of an active session and offer `Retry session check`;
- authenticated but suspended, staff or administrator: render a safe permission alert and a route back to the dashboard;
- active student: mount the page component keyed by user ID so account changes cannot retain claimant state.

The browser client still treats API authentication and permission responses as authoritative. A later `401` redirects to `/login`; a later `403` replaces the active surface with the permission state.

No client-side role or report check is a security boundary. The existing Claim backend remains authoritative for every read and mutation.

## 5. Route and Component Design

### 5.1 `/reports/[id]/claim`

The page shell passes the asynchronous route ID to `ClaimSubmissionClient` inside the claimant access boundary.

The component requests `GET /api/reports/[id]/claim-questions` and renders:

- a back link to the report detail;
- the safe report title and found-item context returned by the endpoint;
- one labelled answer field for each server question, ordered by `questionIndex`;
- privacy copy explaining that answers go to authorised staff for ownership review;
- a primary `Submit claim` action and a secondary cancel link.

Questions use one `<fieldset>` with a descriptive `<legend>`. Every answer has a visible `<label>`, a 500-character maximum matching the server boundary and a nonblank client check. The submission body is constructed only from the current server question indexes.

While a submission is in flight, controls are disabled and a second submission is impossible. A failure retains the current in-memory answers. A success clears no external storage because answers are never written to URL parameters, local storage or session storage; the component navigates directly to `/claims/[claimId]`.

The page handles:

- report not claimable;
- an existing active claim, with a link to `My claims`;
- malformed or unavailable question data;
- field validation failures;
- authentication or permission changes;
- generic retryable service failures.

It never renders expected answers, match indicators, staff notes or another claimant.

### 5.2 `/claims`

`ClaimListClient` reads only `status` and `page` from `useSearchParams`.

- Missing status means all statuses.
- Accepted statuses are `pending`, `approved`, `rejected`, `withdrawn` and `completed`.
- Missing page means page 1.
- Duplicate, non-integer, non-positive, unsafe or unknown values recover to the safe defaults.
- Changing the status resets the page to 1.
- Search state is written with `router.push`, so reload, Back/Forward and copied URLs preserve the view.

The native status select contains `All statuses` plus all five states. Results use concise claim cards with:

- the report title and type;
- a non-colour-only Claim status label;
- created and last-updated dates;
- a link to `/claims/[id]`;
- no claimant evidence, reviewer identity or internal state.

The API default page size is retained; the UI does not invent a page-size control. Previous and Next links preserve the status filter and respect the returned pagination bounds.

Explicit states cover initial loading, successful results, an empty claim history, no claims for the selected status, request failure and retry. Empty history links back to `/reports`.

Request IDs or an equivalent abort mechanism prevent an older response from overwriting a newer URL or account state. An out-of-range nonempty page recovers to the last valid page with URL replacement; a genuinely empty collection remains on page 1.

### 5.3 `/claims/[id]`

`ClaimDetailClient` requests `GET /api/claims/[id]` and displays only the claimant-safe representation:

- report title, report type and public report status;
- Claim status and a short plain-language explanation;
- created and updated dates;
- reviewed, withdrawn and completed dates when present;
- links back to `My claims` and the privacy-safe report detail;
- a `Refresh status` button.

Only `pending` and `approved` claims show `Withdraw claim`. The first activation reveals an inline confirmation region explaining that withdrawal cannot be undone. `Keep claim` closes the region. `Confirm withdrawal` posts an empty JSON object to `/api/claims/[id]/withdraw`, disables both confirmation controls while pending and replaces the displayed Claim with the returned safe representation.

A `CLAIM_STATE_CONFLICT` keeps the existing detail visible, closes unsafe assumptions and asks the student to refresh. `CLAIM_NOT_FOUND` uses the same not-found surface for another student's or a missing claim. Generic failures never expose raw backend messages.

## 6. Report and Navigation Integration

The existing report detail adds `Claim this item` only when the loaded member report is:

- `found`;
- `open`;
- not owned by the signed-in user;
- viewed by an active student.

This is a discoverability rule, not authorisation. If eligibility changes after the detail request, the question endpoint supplies the authoritative error. The detail page does not prefetch private verification questions or perform a duplicate-claim lookup.

For an active student:

- the authenticated header adds `My claims` linking to `/claims`;
- the dashboard `Manage recovery requests` card becomes `Available now` and links to `/claims`.

Staff, administrators, inactive accounts and unauthenticated states do not receive a claimant navigation destination. Existing Browse, Report item and Dashboard destinations remain.

## 7. Browser Client Contract

Create `web/src/lib/claims/browser-client.ts` with strict schemas and these public operations:

- `getClaimQuestionsForReport(reportId: string)`;
- `submitClaim(reportId: string, responses: ClaimAnswer[])`;
- `getMyClaims({ status?, page? })`;
- `getMyClaim(claimId: string)`;
- `withdrawMyClaim(claimId: string)`.

The public types are browser-local structural types derived from strict schemas:

- `ClaimStatus`;
- `ClaimReportSummary`;
- `ClaimantClaim`;
- `ClaimPage` and pagination;
- `ClaimQuestion` and `ClaimQuestions`;
- `ClaimAnswer`.

IDs are encoded with `encodeURIComponent`. List query parameters are generated from accepted typed values only. Requests use `credentials: "same-origin"`; mutations send JSON with `content-type: application/json`.

Successful response schemas reject unknown fields. This deliberately rejects accidental claimant exposure of `expectedAnswer`, answers, `matched`, match counts, review notes, reviewer IDs, active keys, credentials or other server fields rather than silently discarding them.

`ClaimBrowserError` contains only a safe code, HTTP status, safe message and optional validation-field map. Network, non-JSON and malformed-success responses become local generic errors. Components map known codes to approved claimant copy instead of rendering arbitrary server text.

## 8. State and Concurrency

Each page owns a discriminated state union rather than independent booleans.

- Initial request: `loading | ready | not-found | unavailable` as applicable.
- Mutations: `idle | submitting` or `idle | withdrawing` plus one safe error state.
- An incrementing request ID or abort controller prevents stale loads from winning.
- Unmount and authenticated-user changes invalidate outstanding work.
- A mutation result replaces the currently displayed server representation.
- Manual refresh starts a new detail request and does not poll in the background.

No Claim state is cached globally. The backend remains the source of truth and the implementation introduces no speculative cache invalidation layer.

## 9. Status Presentation

Every Claim status uses text in addition to colour:

- `pending`: Awaiting staff review.
- `approved`: Ownership review approved; follow campus handover instructions.
- `rejected`: The ownership claim was not approved.
- `withdrawn`: The student withdrew the claim.
- `completed`: Recovery was recorded as completed.

The interface does not infer a decision from elapsed time, report status or hidden match results. It does not promise notification delivery or direct contact that the current system does not implement.

## 10. Error and Privacy Rules

| Condition | UI behaviour |
|---|---|
| Authentication required | Redirect to `/login` |
| Claim action forbidden | Replace the page with the safe permission state |
| Report not claimable | Explain that the report is no longer available and link back to reports |
| Active claim already exists | Explain that only one active claim is allowed and link to `My claims` |
| Claim not found | Render a claimant-safe not-found page |
| Claim state conflict | Keep safe current data and require a manual refresh |
| Validation error | Associate safe field guidance with the form where possible |
| Network or unknown failure | Render generic retry copy without the raw response |
| Malformed successful response | Treat as a generic service failure |

Claim answers exist only in the submission component's memory until the request completes. They are not logged, persisted or repeated on the detail/list pages. No production claimant frontend source may contain `expectedAnswer`, staff match-result fields, staff review notes, claimant identity records, passwords, tokens or session secrets.

## 11. Accessibility and Responsive Behaviour

The feature targets WCAG 2.2 AA and follows the existing shell.

- One page heading and a logical heading hierarchy.
- Native links, buttons, select, fieldset, legend and labelled textareas.
- Visible focus and no colour-only meaning.
- Blocking errors use one `role="alert"`; loading and success use restrained live regions.
- The withdrawal confirmation is immediately adjacent to its trigger in reading order.
- Disabled mutation controls retain explanatory text.
- Interactive targets are at least 44 by 44 CSS pixels.
- Content wraps without horizontal overflow at 320 CSS pixels.
- List controls stack in normal document order on narrow screens.
- Date text is formatted for `en-NZ` and `Pacific/Auckland` consistently with existing report pages.
- Non-essential transitions respect reduced motion.

Required visual verification covers 320, 375, 768 and 1440 CSS pixels, keyboard-only submission/list/detail navigation, Back/Forward list state and a clean browser console.

## 12. Automated Testing

### Browser-client tests

- exact parsing of question, Claim, page and mutation responses;
- rejection of unknown or privacy-shaped success fields;
- valid query construction and ID encoding;
- mutation method, headers and body;
- safe handling of network, non-JSON, malformed success, 400, 401, 403, 404, 409 and 500 responses;
- no raw internal response leakage.

### Access and navigation tests

- loading, unauthenticated redirect, unavailable-session retry and non-student/inactive permission states;
- user-ID changes remount claimant content;
- active-student header and dashboard links;
- no claimant links for other roles or unavailable states;
- report-detail CTA eligibility matrix.

### Submission tests

- question loading and safe report context;
- labelled fields in stable question order;
- missing/blank client validation;
- duplicate-submit prevention;
- error-after-input preserves answers;
- report-not-claimable, already-exists, authentication and permission handling;
- successful safe body and redirect;
- no expected answers or match indicators rendered.

### List tests

- URL defaults, valid filters, invalid recovery and duplicate-parameter recovery;
- status changes reset the page;
- filter-preserving pagination and Back/Forward updates;
- loading, history-empty, filtered-empty, retry and out-of-range recovery states;
- stale result rejection;
- safe card fields and detail links.

### Detail tests

- every status explanation and applicable timestamp;
- manual refresh and stale-result rejection;
- not-found, permission, authentication, conflict and retry states;
- withdrawal visibility only for pending/approved;
- confirm, cancel, duplicate-action prevention and successful replacement;
- no claimant evidence, match result or staff note display.

### Responsive and complete gate

- CSS contracts for 44-pixel targets, narrow-screen stacking and header overflow safety;
- semantic headings, labels, fieldset and live-region behaviour;
- full `npm test`;
- `npm run lint`;
- `npx tsc --noEmit --incremental false`;
- `npm run build`;
- `npm audit`;
- `git diff --check`, branch-scope review and exact commit review;
- ignored-file confirmation for `.env.local` without reading it;
- production source scans for Claim evidence, expected answers and authentication secrets;
- one bounded desktop/mobile browser review and one focused UI quality review.

All tests mock requests and authentication state. They do not read `.env.local`, connect to Atlas or create real Claim records.

## 13. Delivery Sequence

Implementation will proceed in independently testable slices:

1. Strict Claim browser client and URL helpers.
2. Shared claimant access boundary and navigation integration.
3. Claim submission page and report-detail entry.
4. My claims list, filtering and pagination.
5. Claim detail, manual refresh and withdrawal.
6. Responsive/accessibility hardening and complete verification.

The next claim feature may build the staff review frontend on the same backend contracts, but no staff component or speculative shared abstraction is added here.
