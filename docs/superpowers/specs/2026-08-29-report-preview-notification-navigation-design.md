# Report Preview, Notification Read, and Navigation Consistency Design

## Context

Manual verification exposed three user-facing defects. A newly selected report image is counted but its local preview is broken in the development app. Notification cards load, but marking one as read fails and leaves the unread badge unchanged. Application return links also use several unrelated styles and positions, making them difficult to find.

## Scope

This is a focused course-project quality repair. It adds no dependency, database field, API route, role, upload provider, browser-history abstraction, animation system, or global breadcrumb framework. Existing report-image validation and upload behaviour, notification privacy rules, route permissions, and Campus Find visual language remain unchanged.

## Design

### Reliable local image previews

Each selected image preview will create its `blob:` URL inside the component effect that owns its lifetime and revoke that exact URL when the file changes or the preview unmounts. The preview URL will no longer be created once in a state initializer and then revoked by React development Strict Mode before the component's second setup pass.

The picker will retain the existing five-file limit, JPEG/PNG/WebP validation, 3 MB limit, remove action, accessible image alternative text, and client-only file handling. A Strict Mode regression test will prove that the currently rendered image uses the live URL created by the latest effect setup and that stale URLs are revoked.

### Mongoose 9-compatible notification updates

The existing atomic update pipeline will remain idempotent: an unread notification receives the current time, while an already-read notification keeps its original `readAt`. The `findOneAndUpdate` options will explicitly enable update pipelines and request the document after the update using the Mongoose 9 option names.

Ownership remains enforced by the existing combined `_id` and `recipientId` filter. Missing or foreign notifications continue returning the privacy-safe not-found response. Service tests will assert the pipeline and exact options so a future Mongoose upgrade cannot silently reintroduce this failure.

### One application return control

A shared `PageBackLink` component will provide the same arrow, 44-pixel minimum target, typography, focus ring, and wrapping behaviour for application return links. It will be rendered as the first navigation control in the page content area, aligned to the top-left below the site header.

Each page will retain its deterministic parent destination and contextual label, including notification-origin report and claim details. The component will use a normal Next.js link, not `history.back()` or `router.back()`, so it remains correct after refresh, direct navigation, and opening a page in a new tab. Existing action links that are not page-return controls will not be restyled.

## Data Flow and Failure Behaviour

1. Selecting a valid local file creates a preview URL, renders it, and revokes it only when that preview is replaced or removed.
2. Submitting a report continues through the existing upload and report-creation flow; this repair does not change persistence.
3. Marking a notification read sends the existing protected request. The service atomically updates only the signed-in recipient's record and returns the updated public notification.
4. The provider updates the card and unread count through the existing client state path.
5. Every shared return control navigates to an authored parent route. Authentication, permission, database, and network failures retain their existing safe states and retry actions.

## Verification

- Report-image picker tests run inside React Strict Mode and verify live URL creation, replacement, removal, and cleanup.
- Notification service tests verify the ownership filter, idempotent pipeline, `updatePipeline: true`, and `returnDocument: "after"`.
- Shared return-control tests verify accessible naming, deterministic `href`, visible arrow, and reusable styling.
- Representative report, claim, notification, staff, and administrator component tests verify the correct parent route and top-of-content placement.
- Run focused tests, the full test suite, lint, TypeScript without emit, production build, dependency audit, and the UI design detector for changed interface files.
