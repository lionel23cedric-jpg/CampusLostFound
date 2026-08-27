# Administrator reference data management frontend design

**Date:** 2026-08-28
**Issue:** #42
**Status:** Approved for implementation planning

## Goal

Expose the administrator reference-data backend delivered by Issue #40 through
one secure, accessible and responsive workspace. An active administrator can
find, create, edit, deactivate and restore report categories and campus
locations without permanently deleting records or changing existing member
workflows.

## Context

The application already provides:

- an active-administrator-only `/admin` overview;
- an `AdministratorAccessBoundary` shared by administrator pages;
- account management at `/admin/accounts`;
- category management APIs at `/api/admin/categories`;
- campus-location management APIs at `/api/admin/campus-locations`;
- strict list, create, update and response schemas;
- optimistic concurrency through each record's `updatedAt` value;
- fixed safe error contracts and `Cache-Control: no-store` responses;
- existing member endpoints that expose only active reference data.

The missing capability is a browser interface for these existing operations.
The frontend remains a usability boundary only. The backend independently
authorises every request and remains the source of truth for validation,
duplicates, record existence and concurrency.

## Approved approach

Add one `/admin/reference-data` page with two accessible tabs:

- `Categories`;
- `Campus locations`.

The category panel mounts on first render. The campus-location panel mounts
only when the administrator first selects it. After a panel has mounted it
stays mounted but is hidden while inactive, preserving its page-local filters
and drafts. Each panel owns its own filters, page, request lifecycle, create
form, editor and announcements. New records are created from a form above the
list. Existing records are edited in an expanded region inside their
responsive card.

This design deliberately avoids modal dialogs, wide tables, a generic CRUD
framework, browser persistence and new dependencies.

## Alternatives considered

### Two stacked sections

Showing both resources on one long page would be simple to render but would
mix two filter sets, two pagination controls and two mutation workflows. It
would also load data that the administrator may not need and produce a long
mobile page.

### Separate category and campus-location pages

Dedicated subpages would isolate the resources, but they would duplicate page
composition, access, navigation and shared explanatory content. The workflows
are similar enough to share a workspace while keeping their panels explicit.

### Modal or drawer editing

A modal or drawer would add focus trapping, dismissal and mobile-overflow
complexity. Inline editors keep the record and the proposed changes visible
together and use the page's existing focus order.

## Scope

Issue #42 includes:

- an active-administrator-only `/admin/reference-data` page;
- a link from the administrator overview;
- an accessible tab interface for the two resource panels;
- strict browser-side validation of existing API responses;
- search, active-state filtering, reset and fixed-size pagination;
- category creation and controlled editing;
- campus-location creation and controlled editing;
- explicit deactivate and restore actions;
- optimistic-concurrency conflict handling;
- loading, empty, success, retry, duplicate, stale, missing, access-changed and
  unavailable states;
- stale-request and duplicate-submission protection;
- keyboard, focus, status-announcement and 320-pixel responsive behaviour;
- focused browser-client, component, page, navigation and regression tests;
- final verification evidence.

Issue #42 excludes:

- backend API, service, model or database-schema changes;
- permanent deletion;
- bulk operations;
- import, export or seed-data workflows;
- drag-and-drop ordering;
- automatic polling or realtime transport;
- persisted browser caches or drafts;
- new runtime dependencies;
- live MongoDB Atlas access during tests.

## Permission boundary

`/admin/reference-data` wraps the workspace in the existing
`AdministratorAccessBoundary`. The browser boundary mounts the client only
when the current session is authenticated, active and has the administrator
role.

The page never sends an administrator ID, role or account state. Both API
domains repeat the same server-side active-administrator check before parsing
business input or accessing MongoDB.

| Session state | Page behaviour | API request |
| --- | --- | --- |
| Loading | Existing access-boundary loading state | Never |
| Signed out | Existing sign-in guidance | Never |
| Student or staff | Administrator access unavailable | Never |
| Suspended or deactivated administrator | Administrator access unavailable | Never |
| Active administrator | Mount reference-data workspace | Allowed |

An API 401 or 403 after the page mounts means the session changed. The client
refreshes the shared session. A 401 safely redirects to `/login`; a 403
removes the management workspace and shows an access-changed state.

## Route and navigation

`web/src/app/admin/reference-data/page.tsx` supplies metadata and a semantic
main region. It composes `AdministratorAccessBoundary` with the reference-data
client and contains no fetch or mutation logic.

The existing administrator overview adds one `Manage reference data` link.
The shared site header remains concise: it continues to link to the
administrator overview, which is the hub for administrator workflows.

No new nested layout or administrator routing framework is introduced.

## Tab interface

The workspace heading and description remain visible for both resources. The
resource selector uses:

- a labelled `tablist`;
- two buttons with `role="tab"` and `aria-selected`;
- one visible matching `tabpanel` at a time;
- stable tab and panel IDs;
- Left and Right Arrow navigation;
- Home and End navigation;
- Enter and Space activation.

The first visit selects `Categories`. Selection is local page state rather
than a URL or stored preference. This avoids introducing a second navigation
contract for a two-option control. After first selection, an inactive panel
uses the native `hidden` attribute instead of unmounting, so its state remains
available while the workspace stays mounted.

## Browser contract and client

The existing `reference-data-contract.ts` module is browser-safe: it depends
on Zod but not Mongoose models. The frontend reuses its public record and page
schemas instead of duplicating them.

A dedicated reference-data browser client exposes explicit operations:

- list categories;
- create a category;
- update a category;
- list campus locations;
- create a campus location;
- update a campus location.

Every request uses same-origin credentials, `Accept: application/json`,
`cache: no-store` and an optional abort signal. POST and PATCH also set
`Content-Type: application/json`.

Success bodies are accepted only when they match the existing strict schemas.
Error bodies are accepted only when the status, code and fixed message match
the Issue #40 contract. Malformed JSON, a mismatched error, an invalid success
shape or a network failure becomes a generic browser operation error. Abort
errors remain distinguishable and never render as user failures.

No generic fetch framework is extracted from the existing account client.
The reference-data error domain and response schemas remain explicit.

## Panel state and list flow

Each resource panel owns:

- a draft search value;
- submitted `q`, `status` and `page` values;
- the last valid page response;
- initial loading, refresh and refresh-failure state;
- one create-form state;
- at most one expanded record editor;
- request ID and `AbortController` refs for list work;
- mutation identity and `AbortController` refs for writes.

The panel requests page 1 on first mount. Search requests occur only when the
administrator submits the search form. Changing the status filter or resetting
the filters returns to page 1. Previous and Next controls use the backend's
fixed page size of 20 and returned pagination bounds.

Starting a new list request aborts the previous request and increments a
request ID. Only the current, mounted request may update state. The panel
retains its last valid page during refresh and shows a non-destructive warning
if the refresh fails.

An empty filtered result explains that no matching records exist and offers a
reset action. An empty unfiltered result points to the create form.

## Create flow

The category form accepts `name` and optional `description`. The campus-
location form accepts `campusName`, `locationName` and optional `description`.
The UI mirrors the backend limits and validates before sending, but the server
remains authoritative.

Only one create request per panel may run. While pending, the submit button is
disabled and labelled with the operation state. A successful create:

1. announces the new record by name;
2. clears the form;
3. resets the filters to the unfiltered first page;
4. reloads the list;
5. moves focus to the success message or new-record region when available.

A duplicate response preserves the draft and identifies the need for a unique
name or campus/location pair. Validation and unavailable responses also
preserve the draft.

## Edit, deactivate and restore flow

Selecting Edit expands a form inside that record's card. The form is
initialised from the displayed record and carries its exact `updatedAt` value.
It exposes only the fields approved by Issue #40.

Deactivate and Restore are explicit state-change actions in the same editor.
Before submission the page displays a plain-language confirmation containing
the record name and the effect on future member selections. There is no
permanent delete action and no `DELETE` request.

Only one mutation per panel may run. Successful updates replace the record
with the validated response, close the editor, announce the result and return
focus to the updated record heading.

If the server reports `REFERENCE_DATA_STATE_CONFLICT`, the client:

- retains the administrator's draft;
- disables further save attempts with the stale token;
- announces that another update occurred;
- offers `Reload latest` and `Cancel`;
- fetches the current list only after `Reload latest` is selected;
- replaces the editor values and token with the current record before edits
  can continue.

The client never silently retries a stale mutation. A missing-record response
announces that the item no longer exists, closes the editor and refreshes the
current page. Duplicate responses keep the editor open. Unexpected failures
keep the last valid list and allow an explicit retry.

## Error presentation

| Condition | Browser behaviour |
| --- | --- |
| Invalid local input | Field errors; no request |
| 400 invalid request | Safe form or filter error; retain input |
| 401 authentication required | Refresh session, show access changed, redirect to login |
| 403 administrator required | Refresh session and remove the workspace |
| 404 record not found | Close stale editor and refresh the current page |
| 409 duplicate | Retain draft and request a unique value |
| 409 stale state | Retain draft; require Reload latest before resubmission |
| 500, malformed response or network failure | Generic safe message and explicit retry |
| Abort or stale response | No user-visible error and no state update |

Raw exception messages, response payloads, database details, endpoint
internals and rejected field values are never rendered.

## Accessibility and responsive behaviour

- Every form control has a visible label, limits and associated error text.
- Resource cards use headings, definition lists and text status badges rather
  than colour alone.
- Status updates use scoped polite live regions; blocking failures use alerts.
- Focus moves only after explicit administrator actions and never during a
  background refresh.
- Action labels include the target record where ambiguity is possible.
- Pending and conflict states disable unsafe repeat submission without
  removing Cancel or safe recovery controls.
- Cards and forms use one column at 320 pixels and avoid page-level horizontal
  scrolling.
- Touch targets, focus rings, spacing and typography reuse existing project
  tokens and administrator patterns.
- Reduced-motion preferences remain respected; no new animation is required.

## Component and file boundaries

The implementation should keep these responsibilities separate:

- page composition and metadata;
- administrator access through the existing boundary;
- tab selection and workspace heading;
- category panel state and rendering;
- campus-location panel state and rendering;
- explicit browser HTTP operations and safe error parsing;
- one shared CSS module for the cohesive workspace;
- focused tests beside each boundary.

A small shared presentational helper is acceptable only when both panels need
the exact same pagination or status control. The implementation must not add a
generic CRUD hook, resource adapter hierarchy, form framework or repository
layer.

## Testing strategy

### Browser client

- exact URLs, methods, headers, credentials and bodies;
- strict valid list, create and update responses for both resources;
- every approved safe error;
- malformed JSON, malformed success and mismatched error responses;
- network failures and abort preservation;
- encoded IDs and canonical query strings.

### Workspace and page

- active-administrator page composition;
- stable tab semantics, IDs and selected panel;
- Arrow, Home, End, Enter and Space keyboard behaviour;
- lazy loading of the inactive panel;
- navigation from the administrator overview;
- no extra administrator header link or routing framework.

### Resource panels

- initial loading, ready, empty and initial-error states;
- explicit search, status filter, reset and bounded pagination;
- last-valid-page retention during refresh failure;
- category and campus-location creation;
- editing, deactivation and restoration;
- client validation and duplicate-submission prevention;
- duplicate, stale, missing, access-changed and unavailable recovery;
- draft retention and Reload latest gating after a conflict;
- stale response, abort and unmount protection;
- focus restoration and live announcements.

### Responsive and regression checks

- 320-pixel card and form layout without page-level overflow;
- accessible labels, names, roles and status messages;
- administrator overview and account-management regressions;
- existing member category and campus-location endpoints;
- report submission reference-data regressions;
- focused tests and the full Vitest suite;
- ESLint and TypeScript without emission;
- Next.js production build with `/admin/reference-data`;
- `npm audit` with zero vulnerabilities;
- clean scope, privacy and credential checks.

Tests use mocked browser requests and fixtures. They do not import `.env.local`,
connect to MongoDB Atlas or mutate real reference data.

## Acceptance criteria

Issue #42 is complete when:

- only an active administrator can mount the workspace;
- the overview links to `/admin/reference-data`;
- keyboard-accessible tabs expose the two resource panels;
- only the active panel loads until the other tab is selected;
- both resources support search, status filtering and bounded pagination;
- valid categories and campus locations can be created;
- approved fields can be edited;
- records can be deactivated and restored without deletion;
- every update uses the current `updatedAt` value;
- stale conflicts preserve drafts and require an explicit reload;
- all server responses are strictly validated and safely presented;
- old requests and duplicate submissions cannot corrupt visible state;
- the workflow remains usable and understandable at 320 pixels;
- no backend, schema, dependency or member-facing behaviour changes;
- all quality gates pass and exact evidence is recorded.

## Delivery sequence

1. Commit this approved Issue #42 design on its feature branch.
2. Write a task-by-task TDD implementation plan.
3. Implement strict browser contracts and clients.
4. Implement and test the workspace tabs and category panel.
5. Implement and test the campus-location panel.
6. Add administrator navigation and page composition.
7. Run full regression, accessibility, scope, privacy, build and audit gates.
8. Record verification evidence and open a pull request that closes Issue #42.
