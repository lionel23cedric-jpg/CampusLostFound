# Owner Report History Design

**Date:** 2026-08-29
**Status:** Approved for specification
**Target branch:** `feature/owner-report-history`

## Course alignment

The course brief requires accounts and profiles to retain report history and
requires students to manage their lost-and-found activity. The application can
create and browse reports, but it has no owner-only history view. This feature
closes that core workflow gap without adding a new subsystem.

The feature is deliberately read-only. Report editing, deletion, manual status
changes, chat, storage management, and recovery decisions each introduce
separate lifecycle or security rules and are not required to make report
history usable.

## Goal

Give an authenticated account one private, responsive page that lists every
report it owns, including reports that ordinary member browsing does not show,
with simple type and status filters and links to the existing report detail
page.

## Success criteria

- An authenticated active account can open `/reports/mine` and see only reports
  whose `reporterId` matches the server-authenticated user.
- The history includes `draft`, `open`, `claim_pending`, `resolved`, and
  `closed` reports, plus both visible and hidden moderation states.
- Results are ordered newest first and use fixed-size pagination.
- The user can filter by report type and status without a free-text search or
  advanced query builder.
- Each item shows its title, report type, lifecycle status, moderation notice,
  event date, creation date, and photo count.
- The first uploaded same-origin image may be shown as a thumbnail; legacy
  external URLs are never embedded automatically.
- Every history item links to the existing authorised report detail route.
- Loading, empty, invalid-query, unavailable, retry, authentication-expiry,
  stale-request, and narrow-screen states are usable and accessible.
- The API never returns another user's report or private verification data.
- No schema migration, dependency, external service, or real Atlas access is
  introduced.

## Non-goals

- Editing report content, privacy settings, photos, or verification evidence
- Deleting, archiving, reopening, closing, or resolving reports
- Staff storage or inventory management
- Claim actions, claim history, or handover actions
- Messaging or contact exchange
- Search by keyword, category, location, date range, colour, or photo presence
- Dashboard statistics, exports, analytics, badges, or charts
- Public or anonymous access
- A new database collection, database field, package, or external API

## Approaches considered

### Selected: owner-only vertical slice

Add one protected list endpoint, a strict browser client contract, one history
page, and navigation from the existing authenticated interface. Reuse the
current report model, owner serializer, authentication boundary, pagination
shape, report detail page, photo-reference rules, and responsive component
patterns.

This is the smallest approach that produces a complete assessed workflow.

### Extend the public report browser with a “mine” switch

This would reuse more visible UI, but it mixes two different privacy contracts:
public browsing excludes drafts and hidden reports, while owner history must
include them. A client-controlled switch also makes authorisation intent less
clear. This approach is rejected.

### Build editable report management

Editing and lifecycle actions could be useful later, but they require
concurrency rules, claim-state restrictions, notification decisions, image
replacement rules, and additional destructive-action safeguards. They are not
needed to satisfy the current report-history gap and are deferred.

## Existing foundations

The implementation reuses:

- `ItemReportModel` and its `{ reporterId: 1, createdAt: -1 }` index;
- all five values in `REPORT_STATUSES`;
- `toOwnerReport()` and the safe `OwnerReport` representation;
- `getCurrentUser()` and the same-origin session-cookie boundary;
- the existing report pagination response shape;
- strict Zod browser response validation and safe report error mapping;
- `isInternalReportImagePath()` for same-origin uploaded-image detection;
- `/reports/[id]` for authorised report details;
- current loading, retry, empty-state, access-boundary, focus, and responsive
  interface patterns.

`PrivateVerificationDetailsModel` is never queried by this feature.

## HTTP contract

### `GET /api/reports/mine`

The endpoint accepts exactly these optional query parameters:

```ts
type OwnerReportHistoryQuery = {
  reportType?: "lost" | "found";
  status?: "draft" | "open" | "claim_pending" | "resolved" | "closed";
  page?: number;
};
```

Rules:

- unknown or repeated parameters are rejected;
- `page` defaults to `1` and must be a canonical positive integer no greater
  than `10_000`;
- the server fixes `pageSize` at `10`; the client cannot change it;
- empty strings are treated as absent only for the two select filters;
- authentication is resolved before the query is parsed;
- the route never accepts `reporterId`, `userId`, ownership flags, moderation
  filters, sort fields, projections, or database operators.

The successful response is:

```ts
type OwnerReportHistoryPage = {
  reports: OwnerReport[];
  pagination: {
    page: number;
    pageSize: 10;
    total: number;
    totalPages: number;
  };
};
```

`OwnerReport` is the existing safe representation containing report public
content, owner-visible dates and privacy settings, lifecycle and moderation
status, photo references, and timestamps. It contains no passwords, session
data, claim evidence, verification answers, exact private location, serial
number, private notes, reviewer notes, or MongoDB metadata.

The current serializer includes the authenticated account's own `reporterId`
for the report-creation response. The history browser contract does not use or
render that value. A later cleanup may remove it from both owner responses only
if the creation contract is versioned and all callers are updated together;
that unrelated response change is not part of this feature.

## Service and query behaviour

`listOwnReports(user, query)` performs one bounded owner query and one count:

```ts
const filter = {
  reporterId: user.id,
  ...(query.reportType ? { reportType: query.reportType } : {}),
  ...(query.status ? { status: query.status } : {}),
};
```

The query:

1. connects through the existing database helper;
2. filters by `reporterId` from `PublicUser`, never request input;
3. intentionally does not filter `moderationStatus`;
4. projects only fields required by `toOwnerReport()`;
5. sorts by `{ createdAt: -1, _id: -1 }` for deterministic newest-first order;
6. skips `(page - 1) * 10` and limits to `10`;
7. counts with the identical filter;
8. maps each document through `toOwnerReport()`;
9. returns `totalPages: Math.ceil(total / 10)`.

A requested page beyond the last page returns an empty `reports` array with
accurate pagination rather than silently changing the requested page.

The existing owner index supports the unfiltered query and deterministic sort
well enough for coursework scale. No speculative compound indexes are added
for the optional filters.

## Authentication and privacy boundary

- Missing, expired, suspended, deactivated, or internally inconsistent
  sessions use the existing authentication-required response.
- Any active authenticated role may retrieve its own historical records. New
  report creation remains restricted to active students, but allowing an
  account to retain history after a legitimate role change avoids orphaning
  its reports.
- The service receives the authenticated `PublicUser`; it never receives a
  caller-supplied owner identifier.
- Draft and hidden reports are visible only because the database filter proves
  ownership.
- Browser-side filtering is presentation only and is never an access control.
- The history response never queries or joins private verification, claim, user,
  profile, or moderation-event collections.
- Internal uploaded images continue through their existing authenticated image
  endpoint and privacy checks.
- External HTTPS photo references are counted but not embedded, preventing an
  automatic request to a third-party host.

## Validation and error boundary

Use a strict report-history query schema separate from the broad public browse
schema. Successful and error responses remain JSON.

| Condition | Status | Public result |
|---|---:|---|
| Invalid, repeated, unknown, or out-of-range query | 400 | Existing safe invalid-report-query shape |
| Missing or invalid session | 401 | Existing authentication-required response |
| Unexpected service or database failure | 500 | `REPORT_BROWSE_FAILED` / `Unable to load reports` |

Arbitrary exceptions, Mongoose details, forged error-shaped objects, rejected
route parameters, and parser failures are reduced to these approved public
messages. No stack, filter, collection, index, session, or owner identifier is
returned.

## Browser contract

Add an `OwnerReportHistoryPage` response schema to the existing report browser
client. It strictly validates:

- the complete `OwnerReport` shape and exact report/moderation enums;
- ISO timestamps with offsets;
- approved HTTPS or internal photo references;
- positive page and page-size values;
- non-negative totals;
- `pageSize === 10`;
- `totalPages === Math.ceil(total / pageSize)`;
- no unknown response keys.

`fetchOwnReports(input, signal?)` constructs same-origin query parameters from
the three approved inputs, uses `credentials: "same-origin"`, passes an abort
signal, validates the complete response, and maps only known safe error
contracts. It never falls back to an unvalidated payload.

## Page architecture

### Route and access boundary

`/reports/mine` renders a server page with metadata and a client component. The
client uses `AuthSessionProvider` before loading history:

- unauthenticated sessions redirect to `/login` with history replacement;
- session-check failure offers a session retry;
- inactive accounts receive the established unavailable state;
- active authenticated accounts load their first history page;
- no report content renders before access is established.

Authentication expiry during a history request redirects safely to `/login`.
Other request failures preserve selected filters and offer `Retry`.

### Filters and URL state

The page uses two native labelled `<select>` controls:

- `Report type`: All, Lost, Found;
- `Status`: All, Draft, Open, Claim pending, Resolved, Closed.

The filters and page number are represented in the page URL. Changing either
filter resets the page to `1`. Invalid URL values are reported accessibly and
are not sent to the API. A single `Clear filters` action restores the default
history.

No automatic request is sent for every keystroke because this feature has no
text input.

### History list

Each semantic list item contains:

- an optional first same-origin uploaded-image thumbnail with generated alt
  text; otherwise a text placeholder;
- report title linked to `/reports/{id}`;
- Lost or Found label;
- lifecycle status label;
- a clear `Hidden by moderation` notice when applicable;
- formatted event and creation dates using `en-NZ`;
- a photo count that includes internal and legacy HTTPS references.

The UI does not expose `reporterId`, raw IDs other than the destination URL,
privacy-setting booleans, or private data. It does not embed legacy external
images.

### Loading, empty, stale, and pagination states

- Initial and filter loading use a labelled status region and stable skeletons.
- Empty history explains that no reports have been submitted and links to
  `/reports/new` only for an active student account.
- Filtered-empty history offers `Clear filters` without implying that records
  were deleted.
- The most recent request owns the rendered result. Changing filters, page,
  account, or unmounting aborts the previous request and ignores stale
  completion.
- Previous and Next are native links or buttons with descriptive accessible
  names and are disabled at the boundaries.
- Pagination reports `Page n of m`; zero-result history does not invent page
  one of zero.
- The list and controls remain usable at 320 CSS pixels without horizontal
  scrolling.

## Navigation

- Add `My reports` to the active authenticated site-header navigation.
- Add `Review my report history` to the active account dashboard.
- Keep `Report an item` as a separate creation action.
- Inactive accounts receive no link to owner history.
- Existing role-specific claim, staff, and administrator links are unchanged.

## Accessibility and responsive behaviour

- Use native select, link, and button semantics with visible labels.
- Loading and successful result counts use polite status announcements;
  failures use alert semantics.
- Focus moves to the page heading after client-side invalid URL recovery and to
  the result heading after an explicit filter submission only when this does
  not disrupt normal keyboard navigation.
- Interactive targets retain at least 44-by-44 CSS pixels and visible focus.
- Thumbnail dimensions are reserved to prevent layout shift.
- Status and moderation are expressed in text, not colour alone.
- Reduced-motion preferences require no special animation because none is
  added.

## Testing strategy

### Query validation tests

- accept absent filters and default page one;
- accept each report type and all five statuses;
- accept canonical pages from 1 through 10,000;
- reject zero, negative, decimal, signed, padded, exponent, repeated, unknown,
  and out-of-range values;
- reject caller-supplied ownership, moderation, sort, page-size, or projection
  parameters.

### Service tests

- always filter by authenticated `user.id`;
- include draft, hidden, resolved, and closed records when unfiltered;
- apply optional type and status filters without removing ownership;
- project no private verification or unrelated collection fields;
- use deterministic newest-first order and fixed pagination;
- count with the identical filter and calculate total pages;
- return an empty out-of-range page without changing its number;
- reduce database failures to the safe browse failure.

All service tests mock Mongoose operations and never connect to MongoDB Atlas.

### Route tests

- authenticate before parsing query input;
- accept active student, staff, and administrator accounts for their own
  history;
- reject missing, expired, suspended, and deactivated sessions safely;
- reject unknown and repeated query parameters;
- pass only authenticated identity and validated filters to the service;
- return the exact strict page response;
- redact arbitrary, forged, parser, and database failures;
- scan responses for passwords, tokens, verification evidence, review notes,
  raw database metadata, and other users' identifiers.

### Browser and component tests

- construct the exact same-origin request and validate the full response;
- reject malformed, inconsistent, or over-broad responses;
- cover loading, ready, empty, filtered-empty, error, retry, and auth-expiry
  states;
- synchronise filters and page with the URL and reset pagination on filter
  changes;
- abort or ignore stale requests after filters, pages, accounts, and unmounts;
- show every lifecycle and moderation label;
- render only an internal image thumbnail and never embed external HTTPS URLs;
- link every item to its report detail;
- verify session, role, inactive-account, header, and dashboard navigation
  gates;
- verify headings, list semantics, announcements, focus, touch targets, and a
  320-pixel layout.

### Regression and final gates

Run focused tests after each implementation task, then:

```powershell
npm test
npm run lint
npm exec -- tsc --noEmit --incremental false
npm run build
npm audit
git diff --check
```

Confirm `.env.local` remains ignored, no dependency or database schema changed,
and no test accessed a real Atlas database.

## Documentation and evidence

The verification record must include:

- the course report-history requirement and implemented workflow;
- the owner-only access-control and private-data checks;
- screenshots or a short demonstration of unfiltered history, filtered history,
  a hidden report notice, empty history, and the 320-pixel layout;
- exact focused and repository-wide verification results;
- confirmation that edit, delete, lifecycle actions, messaging, storage, and
  analytics remain deferred.

## Deferred course work

After this bounded feature, the next core requirement to assess is staff item
storage and report verification. Controlled communication should extend the
existing notifications and handover workflow with structured, minimal content
only if a concrete course workflow remains incomplete; a general chat system
is not justified.

## Acceptance criteria

- [ ] Add an authenticated owner-only report history endpoint with strict type,
      status, and page validation.
- [ ] Return only reports belonging to the server-authenticated account,
      including draft and hidden records.
- [ ] Use fixed-size deterministic pagination without a schema or dependency
      change.
- [ ] Add an accessible responsive `/reports/mine` page with filters, complete
      state handling, and detail links.
- [ ] Embed only same-origin uploaded-image thumbnails and never legacy external
      images.
- [ ] Add active-account header and dashboard navigation without changing
      role-specific destinations.
- [ ] Preserve report browsing, submission, image privacy, matching, claims,
      moderation, notifications, and authentication behaviour.
- [ ] Pass all focused, repository-wide, privacy, dependency, and whitespace
      verification gates.
