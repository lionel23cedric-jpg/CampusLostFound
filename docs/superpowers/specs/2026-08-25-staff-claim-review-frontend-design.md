# Staff Claim Review Frontend Design

**Date:** 2026-08-25
**Issue:** #22
**Branch:** `feature/issue-22-staff-claim-review-frontend`
**Status:** Approved for implementation planning

## 1. Purpose

This feature completes the staff-facing half of the ownership-claim workflow. Active staff and administrators need a controlled workspace where they can review pending Claims, inspect the private evidence already exposed by the staff Claim API, approve or reject a Claim, and record a completed handover.

The frontend must preserve the backend's privacy boundary. Students must never receive staff evidence, internal notes or another claimant's identity. Staff data must remain confined to the dedicated staff browser client and protected staff routes.

## 2. Goals

- Add a protected staff Claim review queue.
- Default the queue to the oldest pending Claims.
- Support all Claim-status filters, bounded pagination and canonical URL history.
- Keep queue cards concise while exposing controlled contact and evidence only on the detail page.
- Support confirmed approve, reject and handover-complete actions.
- Preserve current safe content when a recoverable request fails or state changes concurrently.
- Meet the existing Campus Find visual language, keyboard, focus, 44-pixel target and 320-pixel layout requirements.
- Reuse the existing `/api/staff/claims` contracts without changing the backend, database models or dependencies.

## 3. Non-goals

- Notifications, email, SMS or push delivery.
- Chat, handover scheduling, maps or contact-message delivery.
- Staff statistics, charts or an administrator analytics dashboard.
- AI, semantic or fuzzy answer matching.
- Editing reports, verification questions, accounts or profiles.
- Backend route, service, database model or dependency changes.
- Persisting Claim data in browser storage.

## 4. Users and access

### Active staff or administrator

An authenticated account with `status: "active"` and role `staff` or `administrator` may access the review queue and details, make pending decisions, and complete an approved handover.

### Student or inactive account

Students, suspended accounts, inactive accounts and all other roles receive a safe permission surface. Staff content must not render before the access decision is known.

### Unauthenticated or unavailable session

- An unauthenticated session redirects to `/login` and renders only transition copy.
- An unavailable session renders a retryable session-check error without assuming the user is signed out.
- A successful account change remounts the protected staff workspace so data from one account cannot remain visible to another.

## 5. Architecture

The feature uses dedicated staff routes, components and browser schemas while following the proven claimant frontend patterns.

### Routes

- `/staff/claims`: protected Claim review queue.
- `/staff/claims/[id]`: protected controlled Claim evidence and actions.

Both pages use Next.js App Router metadata, async route parameters where required and the existing root `main-content` convention.

### Modules

- `web/src/lib/claims/staff-browser-client.ts`: strict staff-only response schemas, request types and four browser operations.
- `web/src/lib/claims/staff-list-search.ts`: canonical staff queue URL parsing and generation.
- `web/src/components/claims/staff-claim-access-boundary.tsx`: staff/administrator access gate.
- `web/src/components/claims/staff-claim-list-client.tsx`: URL-driven queue state and cards.
- `web/src/components/claims/staff-claim-detail-client.tsx`: evidence, decision and handover state.
- `web/src/components/claims/staff-claim-review.module.css`: staff review layout, states, confirmation and responsive rules.

The staff browser client may reuse the existing public `ClaimStatus` and `ClaimBrowserError` types, but staff schemas, response types and operations remain outside the claimant browser client. Student components never import the staff module.

## 6. Browser data contracts

### Staff Claim summary

The strict queue schema accepts exactly the backend response:

```ts
type StaffClaimSummary = {
  id: string;
  report: {
    id: string;
    title: string;
    reportType: "lost" | "found";
    status: "open" | "claim_pending" | "resolved" | "closed";
  };
  status: ClaimStatus;
  reviewedAt: string | null;
  withdrawnAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  claimant: {
    id: string;
    email: string;
    displayName: string;
    preferredContactMethod: "in_app" | "email";
  };
  verification: {
    questionCount: number;
    matchedCount: number;
  };
  reviewedBy: string | null;
};
```

The queue API already returns the safe email and contact preference. The client validates them, but queue cards render only the display name. Email and contact preference first become visible on the protected detail page.

### Staff Claim detail

```ts
type StaffClaimDetail = StaffClaimSummary & {
  reviewNote: string | null;
  responses: Array<{
    questionIndex: number;
    question: string;
    answer: string;
    matched: boolean;
  }>;
};
```

Strict validation requires:

- offset-aware ISO date strings;
- 24-character hexadecimal IDs;
- 1–5 responses with unique, contiguous indexes starting at zero;
- `matchedCount` between zero and `questionCount`;
- response count equal to `questionCount`;
- non-empty questions and answers no longer than the backend's 500-character limit;
- an optional internal note no longer than 1000 characters;
- no unknown properties at any level.

The schema rejects expected answers, passwords, session tokens, active keys, raw user/profile documents and any unsupported field.

### Operations

```ts
type StaffClaimsRequest = { status?: ClaimStatus; page?: number };
type StaffClaimDecision = {
  decision: "approve" | "reject";
  reviewNote: string | null;
};

getStaffClaims(input: StaffClaimsRequest): Promise<StaffClaimPage>;
getStaffClaim(claimId: string): Promise<StaffClaimDetail>;
decideStaffClaim(
  claimId: string,
  input: StaffClaimDecision,
): Promise<StaffClaimDetail>;
completeStaffClaim(claimId: string): Promise<StaffClaimDetail>;
```

Requests use `credentials: "same-origin"`, encoded IDs and exact bodies:

- `GET /api/staff/claims[?status=...&page=...]`
- `GET /api/staff/claims/{encodedId}`
- `POST /api/staff/claims/{encodedId}/decision` with only `decision` and `reviewNote`
- `POST /api/staff/claims/{encodedId}/complete` with `{}`

The default pending, page-one queue uses `/api/staff/claims` without redundant query parameters.

## 7. Canonical queue URLs

The page URL is the source of truth.

- `/staff/claims`: pending, page 1.
- `/staff/claims?status=approved`: approved, page 1.
- `/staff/claims?status=completed&page=2`: completed, page 2.

Unknown keys, duplicate keys, unsupported statuses, zero, negative, decimal, unsafe or greater-than-10,000 page values are ignored and replaced with the canonical equivalent. Changing the status uses router navigation and resets the page to one. Back and Forward restore the prior queue.

If the server reports that a requested page exceeds `totalPages`, the client replaces the URL with the last valid page and does not render the out-of-range result. A request generation guard prevents an older response from replacing a newer URL result.

## 8. Review queue interface

The queue contains:

- kicker and `Claim reviews` heading;
- a short explanation that evidence is restricted to authorised reviewers;
- one labelled status selector covering all five Claim statuses;
- a result count and current page description;
- responsive Claim cards;
- preserved-filter Previous and Next links.

Each card renders only:

- report title and report type;
- claimant display name;
- Claim status;
- submitted date/time in `en-NZ`, `Pacific/Auckland`;
- verification summary as text, for example `2 of 3 answers matched`;
- `Review claim` link to `/staff/claims/{encodedClaimId}`.

The queue does not render the email address, preferred contact method, answers, individual match indicators, internal note or reviewer identifier.

State surfaces are distinct: loading, empty pending queue, empty filtered history, unavailable service, permission denied and retryable request failure.

## 9. Review detail interface

The detail page begins with `Back to Claim reviews` and a link to the safe report detail. It presents these sections in order:

1. Claim status and safe workflow explanation.
2. Report title, type and status.
3. Claimant display name, email and preferred contact method.
4. Verification summary.
5. Ordered ownership-evidence responses.
6. Existing internal review note, when non-null.
7. The action appropriate for the current status.

Each response renders the question, claimant answer, and explicit `Matched` or `Not matched` text. Colour or an icon may reinforce the state but never replaces the text. Expected answers are never present.

Raw reviewer IDs are not useful interface content and are not displayed. Reviewed, withdrawn and completed timestamps appear when present.

## 10. Decision workflow

Only a pending Claim exposes the decision form.

- The internal note is optional, trimmed and limited to 1000 characters.
- Choosing Approve or Reject opens an adjacent inline confirmation section.
- Approve confirmation states that all other pending Claims for the report will be rejected automatically.
- Reject confirmation states that the current Claim will become rejected.
- The confirmation action is single-flight and disables the note and both decisions while active.
- Cancel returns focus to the decision button that opened the confirmation.
- Success replaces the detail with the returned strict Claim and moves focus to the updated status heading.

The request body is built only from the selected literal decision and current trimmed note. No Claim evidence is posted back to the server.

## 11. Handover completion workflow

Only an approved Claim exposes `Mark handover complete`.

- Activating it opens an adjacent confirmation explaining that recovery will be recorded as completed.
- Confirmation sends one `{}` request.
- Cancel returns focus to the trigger.
- Success replaces the detail with the returned completed Claim and announces the new status.
- Rejected, withdrawn, completed and pending Claims do not expose completion.

Scheduling, messaging and location capture remain outside this feature.

## 12. Error, race and focus handling

The client maps only the existing safe Claim error envelope:

- 401 / `AUTHENTICATION_REQUIRED`: replace with `/login`.
- 403 / `CLAIM_FORBIDDEN`: replace content with a permission state and dashboard link.
- 404 / `CLAIM_NOT_FOUND`: show a safe not-found state and queue link.
- 409 / `CLAIM_STATE_CONFLICT`: close confirmation, retain current safe detail and require a refresh.
- 400 / `VALIDATION_ERROR`: show safe note guidance without raw field or server text.
- 500, network, non-JSON or malformed success: show generic retry copy only.

Initial load failure uses a full-page retry state. Manual refresh failure retains the current safe detail. Queue failure retains the current URL.

Every load and mutation uses a monotonically increasing request generation or equivalent mounted guard. A response is ignored after an account/ID change, a newer request, a conflicting mutation or component unmount. Refresh, decision and completion cannot overlap. Focus moves into inline confirmations, returns on cancel/failure, and moves to safe result headings after terminal state changes.

## 13. Navigation and dashboard integration

For an authenticated active account:

- staff and administrators receive a `Claim reviews` header link;
- students retain `My claims` and never receive the staff link;
- other accounts receive neither link.

The Dashboard recovery workflow adapts by role:

- active students: `Manage recovery requests` links to `/claims`;
- active staff/administrators: `Review ownership claims` links to `/staff/claims`;
- unsupported or inactive accounts see the item as upcoming rather than linked.

All existing Browse, Report item, Dashboard and sign-out behaviour remains unchanged.

## 14. Accessibility and responsive behaviour

- One visible heading hierarchy per page.
- Every selector, textarea and button has an accessible name.
- State changes use `role="alert"` or polite status announcements as appropriate.
- Inline confirmations receive programmatic focus; focus restoration is deterministic.
- All links, buttons, selectors and textarea controls maintain at least a 44-pixel target.
- `:focus-visible` remains obvious against every surface.
- Long email addresses, names, questions, answers, notes and report titles wrap safely.
- 320, 375, 768 and 1440 CSS-pixel layouts have no horizontal overflow or clipped actions.
- Queue cards and detail facts collapse to one column on narrow screens.
- Status and match meaning never depend on colour alone.
- Reduced-motion preferences remain respected by the existing global stylesheet.

## 15. Testing strategy

### Staff browser client

Tests prove exact encoded paths and bodies, strict successful schemas, field rejection, verification-count invariants, ordered response invariants, safe error mapping, non-JSON/malformed responses, rejected fetches and the absence of raw response text.

### Access and navigation

Table tests cover active staff, active administrator, student, inactive, unauthenticated and unavailable sessions. They prove that blocked sessions never render staff children or staff navigation.

### Queue

Tests cover default pending requests, all statuses, canonical recovery, URL navigation, Back/Forward rerender, pending/filtered empty states, pagination links, out-of-range correction, access errors, retries and stale response rejection.

### Detail and actions

Tests cover safe detail rendering, evidence order, match text, optional note handling, approve/reject warnings, exact bodies, completion eligibility, duplicate activation, focus movement/restoration, refresh, 401/403/404/409/500 handling, mutation races, unmount and privacy assertions.

### Final quality gate

```powershell
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
npm audit
```

Production-source privacy scans must find no expected answers, credentials, browser persistence or sensitive logging. The final verification records the exact commit under test, focused/full test outcomes, privacy and scope scans, and bounded responsive/keyboard evidence without performing a real Atlas Claim decision.

## 16. Acceptance criteria

The feature is complete when:

- active staff and administrators can reach a protected queue and detail page;
- the pending queue is oldest-first and all statuses can be filtered with canonical URL history;
- queue cards disclose only the approved concise fields;
- detail presents controlled contact and evidence with explicit match text;
- pending Claims can be approved or rejected through confirmed single-flight actions;
- approved Claims can be completed through a confirmed single-flight action;
- stale, conflicting and failed operations preserve safe state and never expose raw errors;
- keyboard, focus, 44-pixel target and 320-pixel layout requirements pass;
- student pages cannot import or render staff Claim data;
- no dependency, API, database or model change is included;
- automated quality, privacy, audit and scope gates pass.

## 17. Implementation boundary

Issue #22 owns only the staff Claim review frontend and its direct navigation integration. Notifications, AI matching, administrator analytics, chat and handover scheduling require separate designs and Issues.
