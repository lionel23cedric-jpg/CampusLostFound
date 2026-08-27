# Administrator account management frontend design

## Goal

Issue #41 adds a secure, accessible and responsive administrator account
management workspace at `/admin/accounts`. It consumes the account-management
API delivered by Issue #39 so an active administrator can find student and
staff accounts, review their public access state and perform only the approved
status transitions.

The browser never decides whether a mutation is permitted. The existing API
remains the security boundary, rechecks administrator access and performs the
user update, complete session revocation and audit insert in one transaction.

## In scope

- an active-administrator-only `/admin/accounts` page;
- an account-management link from the Accounts section of `/admin`;
- strict browser-side validation for the existing list and status responses;
- explicit search, role filter, status filter, reset and bounded pagination;
- responsive account cards with public account fields only;
- confirmation flows for suspend, restore and deactivate actions;
- approved reason selection for suspension;
- optimistic concurrency using each account's `updatedAt` value;
- loading, empty, success, retry, conflict, missing-account, access-changed and
  unavailable states;
- stale-request protection for list requests and mutations;
- accessible focus management, status announcements and 320-pixel layout;
- focused browser-client, component, route composition, navigation and
  responsive tests;
- reproducible verification evidence.

## Out of scope

- backend contract, model, query, transaction or audit changes;
- administrator account discovery or modification;
- changing account roles, email addresses, names, passwords or preferences;
- restoring a deactivated account;
- permanent deletion or anonymisation;
- bulk actions;
- audit-log browsing or export;
- sending notifications about account changes;
- report, Claim, category or campus-location administration;
- automatic polling, realtime transport or persisted browser caches;
- new runtime dependencies or MongoDB Atlas test data.

## Existing foundation

The application already provides:

- revocable HttpOnly sessions and the shared `useAuthSession` browser state;
- `AdministratorAccessBoundary`, which mounts children only for an active
  administrator;
- the `/admin` overview and its administrator-only navigation;
- strict `managedAccountSchema`, `managedAccountPageSchema` and status-input
  contracts;
- `GET /api/admin/accounts` with search, role, status and page query support;
- `PATCH /api/admin/accounts/{userId}/status` with optimistic concurrency;
- server-side self-target and administrator-target rejection;
- transactional target-session revocation and immutable audit recording;
- stable no-store and privacy-safe error contracts;
- established CSS tokens, card patterns, focus styles and 320-pixel responsive
  requirements.

The frontend reuses these boundaries instead of creating client-side
authorisation rules or a second data source. It defines a browser-only strict
response schema with the same approved public fields because the existing
server contract imports Mongoose-backed model constants and must not enter the
client bundle.

## Considered approaches

### Selected: dedicated `/admin/accounts` page

The account workflow receives its own page linked from the existing overview.
This keeps the overview focused on operational statistics while giving search,
pagination and sensitive status changes enough space for clear confirmation
and error states. The route is independently testable and can remain small
without introducing nested administrator routing infrastructure.

### Rejected: embed management in `/admin`

Embedding the full workflow below the overview would mix read-only system
statistics with account mutations, lengthen the page and couple unrelated
request states. It would also make mobile navigation and failure recovery less
clear.

### Rejected: modal or drawer from the overview

A modal or drawer would hide pagination and filters in a constrained surface,
complicate focus trapping and create avoidable mobile overflow risk. It offers
no benefit when account management is a complete workflow rather than a single
quick action.

## Permission boundary

`/admin/accounts` uses `AdministratorAccessBoundary` around the account client.
The boundary is the browser-side usability gate; both API routes independently
repeat the active-administrator check.

| Session state | Page behaviour | Account API request |
| --- | --- | --- |
| Loading | Accessible session-check state | Never |
| Unavailable | Safe retry state | Never |
| Unauthenticated | Redirect to `/login` | Never |
| Active student | Permission explanation | Never |
| Active staff | Permission explanation | Never |
| Suspended/deactivated administrator | Permission explanation | Never |
| Active administrator | Mount account client | Allowed |

If access changes after mount, the client removes account data, refreshes the
shared session and redirects or shows the existing permission state. Hiding a
link or component is never treated as the server-side security boundary.

## Architecture and component boundaries

### Route shell

`web/src/app/admin/accounts/page.tsx` provides metadata and a semantic main
region. It composes `AdministratorAccessBoundary` with the account client and
contains no fetch, filter or mutation logic.

### Account browser client

`web/src/lib/admin/account-browser-client.ts` owns the two same-origin HTTP
contracts:

- `listAdministratorAccounts(query, signal)` calls
  `GET /api/admin/accounts`;
- `updateAdministratorAccountStatus(userId, input, signal)` calls
  `PATCH /api/admin/accounts/{userId}/status`.

The client builds query strings only from the approved `q`, `role`, `status`
and `page` fields, sends credentials to the same origin, disables caching and
  forwards an optional `AbortSignal`. Successful bodies must pass a
  browser-only strict schema that mirrors the existing public response before
  reaching components. This schema imports only Zod; it does not import the
  server account contract or any Mongoose model.

The client accepts only the exact approved error codes and matching statuses:

- `AUTHENTICATION_REQUIRED` (`401`);
- `ADMINISTRATOR_REQUIRED` (`403`);
- `ACCOUNT_ACTION_FORBIDDEN` (`403`);
- `ACCOUNT_NOT_FOUND` (`404`);
- `ACCOUNT_STATE_CONFLICT` (`409`);
- `ACCOUNT_OPERATION_FAILED` (`500`);
- `VALIDATION_ERROR` (`400`).

Malformed JSON, mismatched codes/messages, unknown properties, schema failure,
network errors and raw response text become one generic browser-safe unavailable
error. Abort remains distinguishable so superseded requests can end silently.

### Account management client

`web/src/components/admin/admin-account-management-client.tsx` owns filters,
pagination, request lifecycle, confirmation state and row replacement. It does
not inspect cookies or infer server permission.

The client keeps committed query values separate from form draft values.
Typing does not fetch. Submitting search or filters commits one normalized
query, returns to page 1 and starts one request. Reset restores the unfiltered
first page. Previous and next controls use the validated pagination object and
cannot move below page 1 or above `totalPages`.

Each list request has a monotonically increasing identity and its own
`AbortController`. Starting another request or unmounting aborts the prior one;
an older completion cannot replace newer data or errors even if a mock or
browser ignores abort.

Only one confirmation form can be open at a time. Only one status mutation can
be active, which prevents conflicting actions from the same page while keeping
the rest of the account list readable.

### Presentation styles

`web/src/components/admin/admin-account-management.module.css` owns the search
form, filters, account cards, status badges, confirmation panels, pagination
and responsive states. It reuses existing design tokens and adds no UI library.

### Navigation integration

The Accounts section of `AdminOverviewClient` gains a `Manage accounts` link to
`/admin/accounts`. The global header keeps its single `Admin overview` entry so
mobile navigation does not gain a second administrator-only link. The account
page includes a clear link back to `/admin`.

## Public data contract

The browser schema accepts only the existing strict `ManagedAccount` fields:

```ts
type ManagedAccount = {
  id: string;
  email: string;
  displayName: string;
  role: "student" | "staff";
  status: "active" | "suspended" | "deactivated";
  createdAt: string;
  lastLoginAt: string | null;
  updatedAt: string;
};
```

The list accepts at most 20 accounts and validated pagination capped at page
500. The browser-only schema deliberately repeats these public literals rather
than importing the Mongoose-bearing server contract. Contract tests use the
same representative response fixtures on both boundaries so drift fails
verification. No component accepts a looser record or spreads unknown server
fields into rendered output.

## Information architecture

### Page header

The page begins with `Manage accounts`, a short explanation of the permitted
student/staff scope and a link back to the administrator overview. It states
that status changes revoke existing sessions and are recorded for
accountability.

### Search and filters

A single labelled form contains:

- `Search accounts` for display name or email;
- `Role` with All, Student and Staff;
- `Status` with All, Active, Suspended and Deactivated;
- `Apply filters`;
- `Reset filters`.

Search validation mirrors the backend: normalized non-empty text of at most 80
characters with control and format characters rejected. Invalid local input is
announced without sending a request.

### Account results

Results use a semantic list of account cards. Each card displays display name,
email, role, textual status, joined date, last login or `Never`, and the
available status actions. Dates use one deterministic `en-NZ` formatter.

Cards are preferred over a wide table because the same label-value structure
remains readable at 320 pixels without horizontal scrolling. Status never
depends on colour alone.

### Pagination and empty results

The page reports the current item range and total count. Previous and next
buttons include the target page in their accessible names. A valid zero-result
response shows `No accounts match these filters` with a reset action; it is not
treated as an error.

## Status actions

The UI exposes only transitions supported by the backend:

| Current status | Action | New status | Reason |
| --- | --- | --- | --- |
| Active | Suspend | Suspended | Administrator selects `security_concern`, `policy_violation` or `administrative_review` |
| Active | Deactivate | Deactivated | `account_closed` |
| Suspended | Restore | Active | `account_restored` |
| Suspended | Deactivate | Deactivated | `account_closed` |
| Deactivated | None | None | None |

Choosing an action expands an inline confirmation panel in that account card.
The panel identifies the account and target state, explains that all current
sessions will be revoked, and offers `Confirm` and `Cancel`. Suspension also
requires a labelled reason selection with plain-English labels. The browser
sends only the closed reason value, target status and the card's exact
`updatedAt` timestamp.

Cancel leaves the account unchanged. Success replaces only the matching card
with the strictly validated response, closes the panel, returns focus to the
action area and announces the new state. No full-page reload is required.

## Request and state flow

1. The access boundary waits for the shared session check.
2. Only an active administrator mounts the account client.
3. The client requests page 1 with no filters and shows a live loading state.
4. A valid response atomically replaces the complete result page.
5. Search, filter, reset or pagination cancels the preceding list request.
6. Selecting an account action opens one inline confirmation panel without a
   network request.
7. Confirm sends the exact target status, reason and `updatedAt` snapshot.
8. Success replaces the account card and announces that existing sessions were
   revoked.
9. Conflict or missing-account results close the stale action, announce that
   the list changed and reload the current committed query.
10. Authentication or administrator-access failure clears account data before
    refreshing the shared session.

The page performs no polling and stores no account response outside React
state.

## Error handling

| Condition | Behaviour |
| --- | --- |
| Invalid local search | Field error; request is not sent |
| Initial list failure | Full safe retry panel |
| Filter/page refresh failure | Retain prior validated results and show retry alert |
| 400 validation response | Generic request-invalid message; retain current results |
| 401 authentication required | Clear data, refresh session and redirect to `/login` |
| 403 administrator required | Clear data, refresh session and show access-changed state |
| 403 action forbidden | Close confirmation and show safe action-not-permitted alert |
| 404 account missing | Close confirmation, announce change and reload current list |
| 409 state conflict | Close confirmation, announce stale data and reload current list |
| 500/network/schema failure | Safe retry state; no raw details |
| Aborted or stale completion | Ignore silently |

An unsuccessful mutation never modifies the displayed account. A list refresh
failure after valid results preserves those results but labels them as the last
successfully loaded state.

## Accessibility and responsive behaviour

- The page has one `h1`, ordered section headings and one clearly labelled
  search/filter form.
- Account results use a semantic list; each card uses labelled values and an
  accessible status name.
- Loading, result totals, updates and conflict reloads use polite status
  announcements; blocking failures use alerts.
- Opening a confirmation moves focus to its heading. Cancel or completion
  returns focus to the initiating action when it still exists.
- Buttons, selects and inputs retain at least 44-by-44-pixel targets and visible
  focus indicators.
- Disabled and busy states include textual or accessible-name changes.
- No information or action depends only on colour, hover, icons or animation.
- Reduced-motion preferences suppress nonessential transitions.
- At 320 CSS pixels, filters, account values, confirmation controls and
  pagination form one readable column with no horizontal overflow.

## Privacy and security

- The HttpOnly session remains inaccessible to browser JavaScript.
- The request sends no client-supplied administrator identity or role.
- The list and mutation responses pass the strict browser schemas before rendering.
- Administrator accounts are absent from the server response; the browser does
  not attempt to filter them after retrieval.
- The UI never receives or renders password hashes, session/token values,
  email-verification state, hidden Profile preferences, private report data,
  Mongoose internals or audit documents.
- Confirmation copy contains only the target's already-approved public name and
  email.
- Responses are not persisted in local storage, session storage, IndexedDB,
  service workers or URL parameters.
- Search strings are encoded through `URLSearchParams`; raw concatenation is
  prohibited.
- Error rendering uses closed browser-safe copy and never includes response
  text, exception messages, endpoints, database details or stack data.
- Tests use fixtures and mocks and never connect to MongoDB Atlas.

## Testing strategy

### Browser-client tests

- encode exact search, role, status and page values;
- send no-store, same-origin GET and PATCH requests with `AbortSignal`;
- validate exact successful list and mutation responses;
- reject extra keys, malformed timestamps, inconsistent pagination and invalid
  roles/statuses;
- preserve only approved code/status/message combinations;
- redact malformed JSON, raw server text, URLs and unexpected failures;
- distinguish aborted requests without exposing details.

### Account component tests

- render loading, successful, empty and initial-error states;
- submit normalized search and filters only on explicit form submission;
- reset filters and return to page 1;
- render the exact range, total and bounded pagination controls;
- cancel and ignore stale list requests;
- show only legal transitions for each status;
- require a suspension reason;
- confirm and cancel each action with correct focus restoration;
- send the exact `updatedAt` snapshot and closed reason value;
- replace only the updated account after success;
- recover from missing-account and conflict results by reloading;
- retain valid data after recoverable list or mutation failure;
- clear data on authentication or administrator-access failure;
- never render private fields or raw failures.

### Access, page and navigation tests

- reuse the existing access boundary so only active administrators mount the
  account client;
- prove students, staff, inactive administrators and unauthenticated sessions
  never send account requests;
- verify the `/admin/accounts` page composes the boundary and client;
- verify `/admin` exposes `Manage accounts` only inside the authorised overview;
- preserve all existing global navigation behaviour.

### Responsive and quality verification

- verify semantic headings, form labels, status/alert regions and focus order;
- verify controls retain 44-pixel targets;
- verify the account workflow has no horizontal overflow at 320 pixels;
- run focused tests, the full Vitest suite, ESLint, TypeScript without emission,
  the Next.js production build and `npm audit`;
- verify the build includes `/admin/accounts` and the existing account APIs;
- confirm `.env.local` remains ignored and no dependency or model file changes.

## Acceptance criteria

Issue #41 is complete when:

- only an active administrator can mount the account-management client;
- `/admin` links to a dedicated `/admin/accounts` workspace;
- strict browser contracts consume the existing list and status APIs;
- search, role/status filters, reset and bounded pagination work through
  explicit actions;
- only valid suspend, restore and deactivate flows are offered;
- each mutation requires confirmation and uses optimistic concurrency;
- success, cancellation, stale data, missing account, session expiry, access
  loss and service failure are safe and recoverable;
- no private account or server data is exposed or persisted;
- the page is keyboard accessible and usable at 320 pixels;
- tests never access Atlas;
- focused and full quality gates pass;
- verification evidence records the exact results.
