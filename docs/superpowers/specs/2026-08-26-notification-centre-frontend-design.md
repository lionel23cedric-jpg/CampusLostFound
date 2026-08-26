# Accessible Notification Centre Frontend Design

**Date:** 2026-08-26
**Issue:** #37
**Proposed title:** Add accessible notification centre frontend

## Goal

Expose the existing secure in-app notification backend through an accessible,
responsive notification centre. Active authenticated users must be able to find
their unread count, review their own notifications, load older entries and mark
individual entries read without exposing private Claim or report data.

## Scope

This issue will:

- add a strict browser client for the existing notification list and mark-read
  endpoints;
- add a small authenticated notification state provider shared by navigation and
  the notification page;
- add an active-account-only `/notifications` page;
- show the unread count in the authenticated site navigation;
- render controlled notification copy, read state, timestamps and safe actions;
- support refresh, cursor-based loading and individual mark-read actions;
- cover loading, empty, partial, error, retry, forbidden and expired-session
  states;
- remain keyboard accessible and usable at a 320-pixel viewport;
- add focused browser-client, provider, component, page and navigation tests.

## Out of scope

- Polling, WebSockets, server-sent events or push delivery.
- Email, SMS or other external channels.
- Mark-all-read, deletion, retention or notification administration.
- Possible-match delivery or changes to matching scores.
- Free-form messages, chat or handover scheduling.
- Editing notification preferences, which remains owned by `/profile`.
- New runtime dependencies.

## Considered approaches

### Chosen: dedicated page with a shared navigation count

Add `/notifications` for the complete workflow and show its unread count beside
a visible `Notifications` navigation link. A small provider owns the already
validated page data so the header and page cannot drift after a mark-read action.
This provides strong discoverability while keeping pagination and error handling
out of the compact header.

### Rejected: header dropdown only

A dropdown saves a route but becomes cramped at 320 pixels, makes cursor loading
and retry states harder to understand, and creates fragile focus-management
requirements. It is not the shortest reliable solution.

### Rejected: page without an unread navigation count

This is smaller but leaves new notifications difficult to discover and weakens
the value of the persisted unread state already supplied by the backend.

## Architecture

### Browser client

Add `web/src/lib/notifications/browser-client.ts`. It will:

- call only `GET /api/notifications` and
  `PATCH /api/notifications/{id}/read`;
- send same-origin credentials;
- build the optional `cursor` and `pageSize` query through
  `URLSearchParams`;
- validate every success and error response through strict Zod schemas;
- accept only the seven closed notification kinds, controlled relative action
  links, canonical identifiers and bounded cursors;
- map malformed, mismatched or non-JSON responses to a generic browser error;
- expose no server error detail or private fields.

The browser client does not import the Mongoose-backed model module. Its light
client schema repeats the closed public transport contract, following the
existing authentication, report and Claim browser-client pattern.

### Notification provider

Add `web/src/components/notifications/notification-provider.tsx` inside the
existing authentication provider in `layout.tsx`.

The provider owns:

- the first page of notifications;
- appended older notifications;
- `unreadCount`, `nextCursor` and `hasMore`;
- initial loading, refresh, load-more and per-item mark-read state;
- safe error state and retry actions.

It exposes a narrow context consumed only by the site header and notification
centre. No third-party state library or speculative repository abstraction is
introduced.

The provider starts its first request only when the authentication session is
resolved, contains a user and that user's status is `active`. It clears all
notification data when the user logs out, becomes inactive or changes account.

Every asynchronous operation receives a monotonically increasing request token
and captures the current account ID. Responses are ignored when the token or
account no longer matches. Refresh replaces the list; load-more appends the next
page only once; mark-read replaces only the returned item and uses the server's
authoritative unread count adjustment.

No automatic interval, visibility listener or background refresh is added.

### Page and navigation

Add:

- `web/src/app/notifications/page.tsx`;
- `web/src/components/notifications/notification-centre.tsx`;
- one notification-specific CSS module;
- a `Notifications` link and unread count in `SiteHeader`.

The page uses the provider rather than issuing a second initial request. All
active roles—student, staff and administrator—may open it. Signed-out users are
redirected to `/login`; inactive accounts receive a safe unavailable state and
never mount notification content.

The navigation link is visible only to active authenticated users. Its count is
textual and accessible rather than colour-only. Values above 99 render as `99+`
visually while the accessible label retains the real unread meaning. A failed
notification request never breaks the rest of the header; the link remains
available without a count.

## Data flow

### Initial load and refresh

1. Authentication resolves an active account.
2. The provider requests the first 20 notifications without a cursor.
3. A valid response replaces notifications, pagination and unread count.
4. Explicit refresh repeats this request and invalidates any older request.
5. A refresh failure keeps already loaded items and exposes a retry state.

### Load more

1. The user activates `Load more` only when `hasMore` and `nextCursor` exist.
2. The provider locks the action and requests the next page with that cursor.
3. A valid current-account response appends its items and adopts its next
   pagination state and unread count.
4. Failure preserves the current list and cursor so the operation can be retried.

### Mark one read

1. Only an unread item exposes `Mark as read`.
2. The provider locks that item and calls its mark-read endpoint.
3. Success replaces the item with the server-authoritative read state.
4. If the transition changed unread to read, the shared local unread count decreases by
   one, never below zero. A repeated server response cannot decrement it twice.
5. Failure leaves the item unread and exposes a retryable per-item message.

Clicking `View claim` or `View report` does not implicitly mark an item read.
Explicit mutation avoids ambiguous state when either navigation or the PATCH
request fails.

## Interface design

The page contains:

- a `Notifications` heading;
- a short explanation and the current unread count;
- a `Refresh` button;
- a newest-first list of notification cards;
- a `Load more` action when older entries exist.

Each card displays:

- an explicit `Unread` or `Read` label;
- controlled title and summary from the API;
- a formatted `Pacific/Auckland` date and time;
- the API-provided `View claim` or `View report` link;
- `Mark as read` only when the item remains unread.

Read state uses text and semantic labelling in addition to visual styling. The
list has a descriptive heading, status announcements use polite live regions,
errors use alerts, and all interactive targets are at least 44 pixels high.

At 320 pixels the layout is one column, long text wraps, action rows stack and no
component uses a fixed content width. The header may wrap its existing account
navigation but must not hide the notification link.

## State and error handling

- Session loading: show a neutral account-check state without requesting data.
- Signed out or API `401`: clear notification state and navigate to `/login`.
- Inactive account or API `403`: show a safe unavailable state.
- Initial network/service failure: show a page-level retry action.
- Refresh failure after success: retain the list and announce the failure.
- Load-more failure: retain the list and cursor, and allow retry.
- Mark-read failure: retain the unread item and allow retry.
- Empty success: show that there are no notifications yet and link to the
  dashboard.
- Malformed responses and unexpected errors: use one generic message with no raw
  response, cursor, identifier or database detail.

Concurrent refresh, load-more and mark-read operations cannot commit stale data
after account changes. Controls are disabled only for their relevant operation,
so one failed item does not make the full page unusable.

## Security and privacy

- Requests begin only after the existing authenticated active-account boundary.
- The page never receives or renders `recipientId`, `eventKey`, actor identity,
  report titles, review notes, verification evidence or contact data.
- Action URLs must match the existing safe relative Claim/report path contract.
- Notification strings render as React text, never HTML.
- Browser errors expose only closed safe codes and messages.
- Logout and account changes synchronously clear provider state before new data
  can render.
- Tests mock `fetch` and session state and never read `.env.local` or contact the
  real MongoDB Atlas cluster.

## Testing strategy

### Browser-client tests

- same-origin GET and PATCH requests;
- default and cursor queries;
- strict successful list and mark-read responses;
- invalid JSON, unknown fields, invalid kinds, unsafe links and inconsistent read
  state;
- safe 400, 401, 403, 404, 500 and network-error mapping;
- absence of private response fields.

### Provider tests

- no request while loading, signed out or inactive;
- initial active-account load;
- logout, inactivity and account-switch clearing;
- stale initial, refresh, load-more and mark-read response isolation;
- refresh replacement, cursor append and operation locks;
- successful and failed mark-read count behaviour;
- preservation of loaded data on recoverable failures.

### Page and navigation tests

- active-role access and all blocked session states;
- loading, empty, ready, partial and failure presentation;
- read state conveyed without colour alone;
- refresh, load-more, mark-read and safe action interactions;
- header link/count visibility for all active roles and exclusion for inactive or
  signed-out accounts;
- keyboard-reachable controls, live status announcements and 44-pixel targets;
- 320-pixel CSS rules without hidden navigation or fixed-width overflow.

### Quality gates

```powershell
npm test
npm run lint
npm exec -- tsc --noEmit --incremental false
npm run build
npm audit
```

## Acceptance criteria

- An active authenticated account can open `/notifications` and see only its
  validated notifications.
- The header exposes an accessible unread count shared with the page.
- Empty, loading, refresh, load-more, error, retry and expired-session states are
  complete.
- Cursor pagination appends older entries without duplicate requests.
- Individual mark-read operations are ownership-safe through the existing API,
  update the item and count consistently, and retain state on failure.
- Notification content and actions remain privacy-safe and free of raw HTML.
- Student, staff and administrator accounts are supported; inactive and signed-
  out accounts cannot load notification data.
- The interface remains usable at 320 pixels and meets existing keyboard, focus
  and touch-target conventions.
- Focused and full tests, lint, TypeScript, production build and audit pass
  without real Atlas access.

## Deferred work

Realtime delivery, external channels, possible-match events, mark-all-read,
deletion, retention and free-form communication remain independent future work.
