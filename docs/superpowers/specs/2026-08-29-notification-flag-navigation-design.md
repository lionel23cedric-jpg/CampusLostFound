# Notification, Flagging, and Navigation Verification Fixes Design

## Context

Manual verification stopped at step 12 because following a notification leaves its unread badge visible, submitting a report concern can remain stuck in its loading state during development, and several drill-down pages do not provide a clear in-application route back to their parent workspace.

## Scope

This is a focused course-project quality fix. It adds no dependencies, database fields, API routes, roles, global breadcrumbs, or browser-history abstraction. Existing protected access, notification persistence, report flagging, and page styling remain in place.

## Design

### Notification actions

Selecting the action of an unread notification will call the existing mark-as-read operation while allowing navigation to continue. The shared notification provider remains responsible for the server request and unread-count update; the link will not invent a successful read state if that request fails.

Notification action links will add the exact, application-controlled source marker `returnTo=/notifications`. Detail pages will accept only that known value. Arbitrary return URLs will not be followed.

### Report flag submission

The report flag panel will set its mounted reference to `true` whenever its effect is established and reset it to `false` during cleanup. This keeps the existing abort and stale-response guards but makes them correct under React Strict Mode's development setup-cleanup-setup cycle. Successful submissions, server errors, and authentication expiry will therefore leave the loading state normally.

### Deterministic return navigation

Drill-down pages will use stable parent routes rather than `router.back()`:

- a report opened from a notification shows `Back to notifications`;
- otherwise, an owned report shows `Back to My reports`;
- otherwise, a public report shows `Back to reports`;
- a claim opened from a notification shows `Back to notifications`, with `Back to My claims` as its normal fallback;
- the administrator overview ready state shows `Back to dashboard`;
- existing staff, administrator, loading, error, and access-boundary parent links remain unchanged.

This makes navigation predictable when a page is refreshed, opened in a new tab, or reached directly. It also avoids accepting user-controlled redirect destinations.

## Data Flow and Failure Behaviour

1. The notification action starts the existing mark-as-read request and navigates to its existing protected destination with the safe source marker.
2. The layout-level notification provider updates the badge only after the request succeeds. Existing retry and error behaviour continues to handle failure.
3. The destination selects its return label and route from the trusted marker and loaded ownership context.
4. Report flag submission continues through the existing API. The component updates success or error state only while the current mounted request is active.

## Verification

- Notification component tests verify unread actions invoke `markRead`, read actions do not repeat the request, and action destinations include the safe source marker.
- Report and claim detail tests verify notification-source links and their deterministic fallback links.
- The administrator overview test verifies the ready state exposes `Back to dashboard`.
- A report flag panel regression test renders under `React.StrictMode` and verifies submission reaches its success state.
- Existing authentication, access-control, notification, report, claim, and moderation tests must remain green.
- Run the focused tests, full test suite, lint, TypeScript without emit, production build, dependency audit, and the design detector for changed UI files.

