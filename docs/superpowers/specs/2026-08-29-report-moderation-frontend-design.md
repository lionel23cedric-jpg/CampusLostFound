# Report flagging and administrator moderation frontend design

**Date:** 2026-08-29
**Proposed issue:** Build accessible report flagging and administrator moderation frontend

## 1. Goal

Complete the existing report-moderation workflow with a member-facing flag
form and an administrator-facing moderation workspace. The work exposes the
already delivered moderation APIs through accessible, responsive interfaces;
it does not add another moderation model, policy engine, or communication
system.

This is the smallest remaining feature that turns the course brief's
"administrators manage reports and flagged content" requirement into a
complete demonstrable flow.

## 2. Context and chosen approach

The project already provides:

- authenticated active-member and active-administrator access boundaries;
- privacy-safe report detail pages with reliable ownership information;
- member flag submission and administrator report/flag APIs;
- transactional dismiss, hide, and restore decisions with optimistic
  concurrency and immutable audit evidence;
- established browser-client, strict Zod response, loading, retry, stale
  request, accessibility, and responsive-layout patterns.

Three approaches were considered:

1. **Complete member-to-administrator workflow — chosen.** Add a report-detail
   flag form and a single administrator workspace for pending flags and report
   visibility. This gives the clearest assessed demonstration while reusing all
   existing backend rules.
2. **Administrator workspace only.** Smaller, but it leaves ordinary members
   unable to create the flagged content the administrator must manage.
3. **Messaging or AI-assisted moderation.** Broader and more complex, but not
   necessary for this requirement and more difficult to justify within the
   course scope.

The chosen approach adds no dependency and makes no database-schema or backend
scoring change.

## 3. Scope

### In scope

- Show a `Report this listing` action to an active member viewing another
  member's submitted, visible report.
- Collect one controlled reason and an optional explanation of at most 500
  characters; `Other concern` requires an explanation.
- Submit through `POST /api/reports/{reportId}/flags` only after deliberate
  activation and confirmation.
- Show success, duplicate-pending, validation, unavailable, authentication,
  permission, and retry states without exposing raw server errors.
- Add `/admin/moderation`, protected by the existing administrator boundary.
- Let an administrator filter and paginate the report-flag queue.
- Let an administrator filter, search, and paginate submitted reports.
- Let an administrator dismiss a pending flag, hide its report, hide a report
  directly, or restore a hidden report.
- Supply the exact `updatedAt` values already returned by the APIs so stale
  actions fail safely and trigger a reload path.
- Link the administrator overview and authenticated navigation to the new
  workspace.
- Update `PRODUCT.md` so its delivered-capability summary is no longer stale.
- Add browser-client, component, page, integration, and regression tests.

### Out of scope

- New backend endpoints, collections, indexes, audit event types, or
  notification kinds.
- Permanent report or flag deletion.
- Editing report content for its owner.
- Bulk moderation, appeals, chat, email, AI classification, automatic hiding,
  or uploaded-image analysis.
- Member flag history, administrator audit-log browsing, dashboards, charts,
  or exports.
- Changes to intelligent matching, Claim, storage, handover, or account policy.

## 4. Member flagging experience

The existing report detail page supplies `isOwner`, recovery status, and
moderation status. For any active member viewing a report that is not their
own, the page shows a secondary `Report this listing` button after the report
content. The owner never sees this control. The backend remains the final
authority for visibility, ownership, and duplicate-pending checks.

Activating the button expands an inline section rather than opening a custom
modal. The section contains:

- a labelled reason selector using the five backend-controlled reasons;
- a labelled details textarea with a visible 500-character limit;
- plain text explaining that reports should be used for safety, privacy,
  fraud, or duplicate concerns rather than ownership Claims;
- `Submit report` and `Cancel` actions.

The action remains disabled while a request is in flight. A successful
submission replaces the form with a polite status confirming that an
administrator can review it. A duplicate-pending response explains that the
concern is already awaiting review. Field validation is associated with the
relevant control. Authentication expiry redirects to sign-in; changed account
access returns to the existing safe permission state. Network and malformed
response failures use one generic retryable message.

The component does not list earlier flags or expose flag, member, or
administrator identities.

## 5. Administrator moderation workspace

`/admin/moderation` uses the existing `AdministratorAccessBoundary` and one
page heading, `Report moderation`. It contains two clearly labelled sections.

### 5.1 Flag queue

The queue defaults to `pending` because this is the administrator's actionable
work. Filters cover status and reason; pagination uses the existing fixed page
size of 20. Every card shows:

- report title, type, recovery status, and current moderation status;
- flag reason, optional details, submitted date, and resolved information when
  present;
- a link to the ordinary safe report detail when it is visible.

A pending flag has two actions:

- **Dismiss concern** requires a short confirmation panel with an optional
  internal note.
- **Hide report** requires the same confirmation and supplies both the flag and
  report timestamps from the loaded record.

After success, the workspace reloads the active page. If the result removes the
last item from a page after page 1, it loads the previous page. A `409` stale
response keeps the action reversible, announces that the record changed, and
offers `Reload moderation data`.

### 5.2 Report visibility

The report section supports keyword, report type, recovery status, moderation
status, and page controls that map directly to the existing endpoint. Each
summary shows only fields already approved by the administrator contract.

A visible report exposes `Hide report`; the confirmation requires one approved
direct-administration reason and an optional internal note. A hidden report
exposes `Restore report` with an optional note. Every mutation supplies the
loaded report's exact `updatedAt` value. No free-form role, actor, owner, or
state field is accepted from the browser.

## 6. Client architecture and data flow

Add a focused moderation browser client beside the existing moderation domain:

```text
Report detail flag form
  -> moderation browser client
  -> existing member flag endpoint

Administrator moderation page
  -> administrator access boundary
  -> moderation workspace client
  -> moderation browser client
  -> existing administrator list and mutation endpoints
```

The browser client owns strict response schemas, same-origin requests, safe
error translation, URL query construction, and request/response contracts. The
React components own transient form, filter, pagination, request cancellation,
focus, and status-announcement state. The existing backend domain remains the
only source of authorisation and transition rules.

List requests use `AbortController` and monotonically increasing request IDs so
late responses cannot replace newer filter results. Mutations disable their
own controls while pending. A successful mutation always reloads server state;
the client does not attempt an optimistic state rewrite.

## 7. Error and privacy rules

- Strict browser schemas reject malformed success or error responses.
- Only approved codes influence user-visible branching; unexpected messages
  are replaced by generic safe copy.
- `401` refreshes the session and redirects to `/login`.
- `403` refreshes the session and shows the existing access-changed state.
- `404` indicates that the target is no longer available.
- `409` duplicate flag and stale mutation responses receive specific safe
  recovery guidance.
- No response or rendered component may expose reporter IDs, flagger IDs,
  administrator IDs, verification evidence, serial numbers, exact private
  locations, passwords, sessions, or audit internals.
- Legacy external photo URLs remain links; the moderation UI does not embed or
  fetch them automatically.

## 8. Accessibility and responsive behaviour

- Use native headings, forms, labels, selects, textareas, buttons, lists, and
  links; no custom dialog widget is introduced.
- Validation and action errors use `role="alert"`; loading and successful
  outcomes use polite status announcements.
- When an action fails, focus moves to the relevant error heading. When an
  inline confirmation opens, focus moves to its heading.
- Every control retains a minimum 44-by-44 CSS-pixel target and visible focus.
- Cards and filters become a single column at 320 CSS pixels without horizontal
  scrolling; long titles, notes, and identifiers wrap safely.
- Loading, empty, error, retry, access-changed, stale, and page-boundary states
  remain usable with keyboard and screen-reader navigation.
- Motion is unnecessary for this workflow and is not added.

## 9. Testing and verification

### Browser client

- Strict schemas accept every valid endpoint response and reject missing,
  unknown, malformed, or privacy-shaped fields.
- Query construction covers defaults, filters, encoding, and pagination.
- Request bodies contain only approved fields and exact timestamps.
- Network, non-JSON, authentication, permission, not-found, duplicate, stale,
  validation, and unknown errors map to safe browser errors.

### Member flagging component

- Hidden for owners and shown for eligible non-owners.
- Reason/detail validation, `Other concern`, cancellation, pending lock,
  success, duplicate, retry, session expiry, and unmount behaviour.
- No Claim action is confused with the moderation action.

### Administrator workspace

- Access boundary, initial load, filters, pagination, empty pages, retries, and
  stale request suppression.
- Dismiss, flag-led hide, direct hide, and restore bodies use current server
  timestamps.
- Successful reload, last-item previous-page handling, `409` recovery, safe
  error copy, focus, and live announcements.
- Privacy assertions prohibit restricted identity and verification fields.

### Repository gates

- Focused Vitest suites.
- Full `npm test`.
- `npm run lint`.
- `npx tsc --noEmit --incremental false`.
- `npm run build`.
- `npm audit`.
- Signed-out browser checks for `/reports/{id}` and `/admin/moderation`, plus
  responsive and accessibility review at 320 CSS pixels without performing a
  real moderation mutation.

## 10. Acceptance criteria

The feature is complete when:

- an active non-owner can submit one controlled concern from report detail;
- owners cannot see or use that entry point through the interface;
- only an active administrator can open the moderation workspace;
- administrators can filter and paginate flags and submitted reports;
- administrators can dismiss flags, hide reports, and restore reports through
  deliberate confirmation flows;
- all mutations use exact server timestamps and recover safely from conflicts;
- loading, empty, error, retry, authentication-expiry, access-change, stale,
  and page-boundary states are implemented;
- the interface remains keyboard accessible and usable at 320 CSS pixels;
- no restricted identities, verification data, or raw errors are exposed;
- no dependency, database-schema, backend-policy, AI, chat, or destructive
  deletion work is added;
- focused and repository-wide quality gates pass and verification evidence is
  recorded.
