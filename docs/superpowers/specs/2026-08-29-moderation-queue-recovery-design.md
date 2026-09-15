# Moderation Queue Recovery Design

## Context

Manual verification found that member report concerns are accepted but the administrator moderation page cannot display them. Repeating a concern then looks like a failed submission because the server correctly rejects a second pending concern, while the page still leaves the editable form visible. The moderation workspace also has no in-application link back to its administrator parent page.

## Scope

This is a focused course-project quality fix. It adds no dependency, database field, API route, role, global breadcrumb system, or browser-history abstraction. Existing report-flag uniqueness, administrator-only access, moderation decisions, and application styling remain in place.

## Design

### Administrator flag queue

The report-flag aggregation will retain `reportId` in its final private projection. The strict aggregate parser already requires this identifier before producing the privacy-safe browser response, but the current projection removes it and makes every non-empty queue fail closed. The identifier remains an internal validation field and is not added to the public response.

The aggregation test will assert that the projected shape contains every field required by the strict parser. A service regression test will also pass a row shaped exactly like the real aggregation result so that projection/parser drift is detected.

### Existing pending concern state

The server will continue allowing at most one pending concern per member and report. When submission returns `REPORT_FLAG_ALREADY_PENDING`, the report page will replace the editable form with a clear, non-error status stating that the concern is already awaiting administrator review. It will not imply that a new concern was created, and it will not expose the reporter or any moderation data.

This behaviour is identical for lost and found reports. Owners remain unable to report their own listing, as required by the existing access rule.

### Deterministic return navigation

The report moderation workspace will expose `Back to administrator overview`, linking directly to `/admin`. It will use a stable application route rather than browser history, so the link works after refresh, direct navigation, or opening the page in a new tab.

## Data Flow and Failure Behaviour

1. A member submits a concern through the existing protected report-flag endpoint.
2. A first pending concern is stored and the existing success state is shown.
3. A repeated pending concern receives the existing conflict code and is presented as an already-submitted status instead of an editable error state.
4. An administrator opens the moderation workspace. The existing aggregate joins each flag to its safe report projection, validates the internal row, removes private flag fields, and returns the bounded page.
5. Database, authentication, or validation failures continue to fail closed without leaking internal details.

## Verification

- Administrator service tests verify the aggregate projection/parser contract and a non-empty queue response.
- Report flag panel tests verify duplicate pending concerns leave no active submit form and show accurate status text.
- Administrator moderation component tests verify the deterministic link to `/admin`.
- Existing lost-report, found-report, ownership, authentication, moderation, privacy, and decision tests must remain green.
- Run focused tests, the full test suite, lint, TypeScript without emit, production build, dependency audit, and the UI design detector for changed interface files.
