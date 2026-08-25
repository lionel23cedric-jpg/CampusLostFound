# Administrator overview frontend design

## Goal

Issue #33 adds a secure, accessible and responsive administrator overview at
`/admin`. The page consumes the existing read-only
`GET /api/admin/overview` endpoint and presents the operational statistics
required by the project brief without exposing account identities, report
contents or private ownership evidence.

This is the frontend half of the administrator overview. It does not add new
statistics, database queries or administrator mutations.

## In scope

- an active-administrator-only `/admin` page;
- strict browser-side validation of the existing overview response;
- report, Claim and account metric groups with plain-language definitions;
- loading, zero-data, success, refresh, failure and expired-session states;
- an explicit refresh action with stale-request protection;
- administrator-only navigation from the shared header and account dashboard;
- semantic, keyboard-accessible and 320-pixel responsive presentation;
- focused browser-client, component, access and integration tests;
- reproducible verification evidence.

## Out of scope

- changes to `GET /api/admin/overview` or its metric definitions;
- user, role, status, category, campus-location, report or Claim mutations;
- report deletion, flagged-content moderation or audit logging;
- persisted statistics, caching, background work or automatic polling;
- charts, trends, date ranges or third-party visualisation libraries;
- notification delivery;
- new database models, dependencies or MongoDB Atlas data;
- exposing individual users, reports, Claims or private verification data.

## Existing foundation

The application already provides:

- a revocable HttpOnly session and `useAuthSession` browser state;
- active student, staff and administrator roles;
- an active-staff/administrator Claim review workspace;
- a strict `administratorOverviewSchema` shared with the backend;
- an active-administrator-only `GET /api/admin/overview` endpoint;
- stable no-cache, permission and error contracts;
- shared header, dashboard, colour tokens and accessible interaction patterns.

The frontend must reuse these boundaries rather than introducing a second
administrator data source or accepting client-provided identity or role data.

## Considered approaches

### Selected: dedicated `/admin` overview page

Create one administrator workspace that consumes the existing endpoint. This
keeps system-level statistics separate from the personal account dashboard,
gives the permission boundary a clear route and provides direct evidence for
the administrator-dashboard requirement.

### Rejected: embed statistics in `/dashboard`

The existing Dashboard is a role-aware personal account and workflow page.
Embedding system-wide statistics there would mix account facts with
administrator operations, complicate its loading states and make the
administrator permission boundary less obvious.

### Rejected: server-render by calling the overview service directly

Calling the database service from the page would bypass the completed API
contract and duplicate permission/error integration. Calling the API from a
server component would add request-origin and cookie-forwarding complexity
without improving this small same-origin dashboard. The selected browser flow
keeps the endpoint testable end to end.

## Permission boundary

The page uses the current revocable session as its only identity source.

| Session state | Page behaviour | Overview request |
| --- | --- | --- |
| Loading | Accessible loading state | Never |
| Unavailable | Safe session error and retry | Never |
| Unauthenticated | Redirect to `/login` | Never |
| Active student | Permission explanation | Never |
| Active staff | Permission explanation | Never |
| Suspended/deactivated administrator | Permission explanation | Never |
| Active administrator | Mount overview client | Allowed |

The API independently repeats the active-administrator check. Hiding a link or
blocking a component is usability support, not the security boundary.

## Architecture and component boundaries

### Route shell

`web/src/app/admin/page.tsx` supplies page metadata and a semantic main region.
It renders the administrator access boundary and contains no data-fetching or
permission logic.

### Administrator access boundary

`web/src/components/admin/administrator-access-boundary.tsx` owns only session
state and role/status gating. It redirects an unauthenticated visitor, exposes
a retry for unavailable session checks and mounts children only for an active
administrator. Blocked authenticated users receive a clear permission message
and a route back to `/dashboard`.

Keeping this boundary separate proves that unauthorised sessions never mount
the component capable of calling the overview endpoint.

### Browser client

`web/src/lib/admin/browser-client.ts` owns the same-origin HTTP contract:

- call `GET /api/admin/overview` with `Accept: application/json` and
  `cache: "no-store"`;
- accept an optional `AbortSignal`;
- parse successful JSON through the existing strict
  `administratorOverviewSchema`;
- reduce approved error responses to a small browser-safe error class;
- convert malformed JSON, unknown errors and unexpected server messages to a
  generic unavailable error;
- never return raw response text, stack data or endpoint internals.

The existing schema already rejects unknown properties, negative, fractional,
infinite and unsafe counts, malformed timestamps and inconsistent totals. It
is reused rather than duplicated so browser and server contracts cannot drift.

### Overview client

`web/src/components/admin/admin-overview-client.tsx` owns request lifecycle and
rendered statistics. It does not inspect cookies or decide whether a user is an
administrator.

Each load receives a monotonically increasing request identity and an
`AbortController`. Starting a refresh aborts the previous request. An older
completion cannot replace newer data or error state, including when an ignored
mock or browser implementation resolves after abort.

### Presentation styles

`web/src/components/admin/admin-overview.module.css` owns the overview grid,
cards, definition text, status panels and responsive rules. It reuses existing
CSS custom properties and does not add a component or chart library.

### Navigation integration

- `web/src/components/site-header.tsx` adds `Admin overview` only for an active
  administrator.
- `web/src/components/dashboard/dashboard-client.tsx` adds an available
  administrator workflow action linking to `/admin`.
- Student, staff and inactive-account navigation remains unchanged.

## Data contract

The browser accepts exactly the existing response:

```ts
type AdministratorOverview = {
  generatedAt: string;
  reports: {
    submittedLost: number;
    submittedFound: number;
    submittedTotal: number;
    unresolved: number;
    recovered: number;
    matched: number;
  };
  claims: {
    pending: number;
    approved: number;
    rejected: number;
    withdrawn: number;
    completed: number;
    total: number;
  };
  accounts: {
    active: number;
    suspended: number;
    deactivated: number;
    total: number;
  };
};
```

The frontend derives no alternative totals and does not infer trends. It
displays values only after the complete object passes strict validation.

## Information architecture

### Introduction and freshness

The page begins with the `Administrator overview` heading, a short explanation
that values are current read-only operational counts and the formatted
`Last generated` timestamp. An explicit `Refresh overview` button requests a
fresh snapshot.

The timestamp uses a deterministic `en-NZ` formatter and retains the source
time semantics. Invalid dates cannot reach rendering because schema parsing
fails first.

### Report operations

The primary metric group uses a semantic definition list and displays:

- `Lost submitted` — non-draft submitted lost reports;
- `Found submitted` — non-draft submitted found reports;
- `Total submitted` — the validated submitted total;
- `Unresolved` — open or claim-pending cases;
- `Recovered` — resolved reports;
- `Matched` — distinct reports with an approved or completed Claim.

These are the five operational concepts explicitly required by the brief.
Short definitions remain visible so administrators do not have to infer what
each number means.

### Claim workflow

A secondary definition list presents pending, approved, rejected, withdrawn,
completed and total Claims. It links to the existing `/staff/claims` workspace
for permitted follow-up but does not mutate a Claim from the overview.

### Accounts

A final definition list presents active, suspended, deactivated and total
accounts. Counts are informational only. No account identity, email or
management action is present.

### Zero activity

An overview whose validated counts are all zero is successful, not an error.
The page displays every zero-valued metric and an informational
`No activity recorded yet` message. This prevents an empty database from being
mistaken for a failed request.

## Request and state flow

1. The access boundary waits for the existing session check.
2. Only an active administrator mounts the overview client.
3. The client starts one no-cache request and renders an accessible loading
   state.
4. The browser client validates the entire response before returning it.
5. A valid response replaces loading with all metric groups and freshness
   information.
6. Refresh keeps the last valid snapshot visible, marks the button busy and
   starts a new protected request.
7. A successful refresh atomically replaces the full snapshot.
8. A failed refresh retains the last valid snapshot and adds a safe retry
   alert; an initial failure renders a full retry panel.

No timer or background polling starts. Data changes only on initial authorised
mount or explicit administrator refresh.

## Error handling

| Condition | Behaviour |
| --- | --- |
| 401 `AUTHENTICATION_REQUIRED` | Refresh session and redirect safely to `/login` when unauthenticated |
| 403 `ADMINISTRATOR_REQUIRED` | Refresh session and show permission state; never disclose expected role details from the server |
| 400 unexpected query error | Generic overview unavailable state; the frontend never sends a query |
| 500 approved unavailable error | Safe retry state |
| Malformed JSON or response schema | Safe retry state |
| Network failure | Safe retry state |
| Aborted or stale request | Silently ignored when superseded or unmounted |

The rendered UI never includes raw response text, exception messages, URLs,
MongoDB information or stack traces.

## Accessibility and responsive behaviour

- The page has one `h1`, ordered section headings and semantic `dl`, `dt` and
  `dd` metric structures.
- Loading and refresh updates use `role="status"` and polite live regions;
  failures use `role="alert"` without repeatedly announcing retained data.
- The refresh control exposes a clear busy/disabled state and preserves an
  accessible name.
- Links and buttons retain at least a 44-by-44-pixel target.
- Keyboard focus remains on the refresh control after an ordinary refresh and
  moves only when an authentication redirect changes the route.
- No information depends only on colour, icons, hover or animation.
- Reduced-motion preferences disable nonessential skeleton animation.
- Wide layouts may use a compact multi-column metric grid; at 320 pixels every
  metric and action becomes a single readable column with no horizontal
  overflow.

Charts are intentionally omitted. The endpoint provides one current snapshot,
not a time series, so bars or trend indicators would imply unsupported
comparisons and reduce clarity.

## Privacy and security

- The HttpOnly session remains inaccessible to browser JavaScript.
- The request includes no user ID, role, filters, metric names or query string.
- Only the strict aggregate response schema reaches components.
- No email, display name, account ID, report ID, Claim ID, report content,
  expected answer, claimant response, review note, password or token is part of
  the frontend contract.
- The page uses same-origin requests and does not persist the response in local
  storage, session storage, IndexedDB or a service worker.
- No overview is rendered from an earlier session after logout, role change or
  account deactivation; unmount and request-identity guards prevent stale
  completion.
- Tests use fixtures and mocks only and never connect to MongoDB Atlas.

## Testing strategy

### Browser-client tests

- accept the exact valid response;
- send the exact no-query, no-cache request and forward `AbortSignal`;
- reject unknown keys, malformed timestamps, unsafe counts and inconsistent
  totals;
- preserve only approved 401, 403 and unavailable codes;
- redact malformed JSON, raw server text, URLs and unexpected failures;
- distinguish abort from retryable failure without exposing details.

### Access-boundary tests

- mount children only for an active administrator;
- reject active student, active staff, suspended administrator and deactivated
  administrator without mounting children;
- redirect an unauthenticated session;
- render loading and unavailable-session states;
- retry only through the existing session provider.

### Overview component tests

- render every report, Claim and account metric with its definition;
- show the exact formatted generation time;
- treat all-zero counts as a successful empty state;
- show accessible initial loading and initial-error states;
- refresh successfully without clearing the prior snapshot;
- retain valid data after a refresh failure;
- recover through retry;
- ignore aborted and stale completions;
- handle authentication expiry without leaking prior data;
- contain no private identity or report fields.

### Navigation and integration tests

- active administrators receive `/admin` links in the header and Dashboard;
- students, staff and inactive accounts receive no administrator link;
- existing navigation remains available to its current roles;
- the page composes the access boundary and overview client correctly;
- the layout and controls remain usable at a 320-pixel viewport.

### Full verification

Run focused tests, the full Vitest suite, ESLint, TypeScript without emission,
the Next.js production build and `npm audit`. Verify the route table contains
`/admin`, `.env.local` remains ignored, no real environment file is tracked,
and the Issue diff changes no model or dependency file.

## Acceptance criteria

Issue #33 is complete when:

- only an active administrator can mount the overview data client;
- the page consumes and strictly validates `GET /api/admin/overview`;
- every required report, Claim and account count has a visible definition;
- zero data, loading, refresh, failure, retry and session expiry are safe and
  accessible;
- administrator-only navigation reaches `/admin`;
- the page remains readable and operable at 320 pixels;
- no private or row-level data is exposed or persisted;
- tests never access Atlas;
- all focused and full quality gates pass;
- verification evidence records the exact results.
