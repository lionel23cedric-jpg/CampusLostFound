# Report Browsing and Search Backend Design

## Goal

Add a secure member-only backend that lets authenticated Campus Find users browse, search, filter and inspect lost and found reports without exposing draft records, hidden public fields or private ownership-verification evidence.

## Scope

This change adds:

- `GET /api/reports` for paginated report browsing, keyword search and structured filtering.
- `GET /api/reports/[id]` for one member-visible report detail.
- Strict query validation and stable public error responses.
- A member-visible response mapper that applies every report privacy setting.
- Focused service and Route Handler tests that mock authentication and database boundaries.

This is a complete backend deliverable. The browsing interface will be a separate feature that consumes these endpoints.

## Chosen approach

The implementation will reuse the existing MongoDB text index for keyword search and the existing compound indexes for structured filters. Thin Next.js Route Handlers will authenticate and validate requests, a browsing service will build bounded MongoDB queries, and the existing report response-mapping boundary will gain a member-visible mapper.

This approach adds no dependency, Atlas configuration or database migration.

Rejected alternatives:

- Regular expressions for all keyword search would ignore the existing text index and scale poorly.
- Atlas Search would add deployment-specific configuration that the current requirements do not justify.
- Combining backend and frontend work would make the pull request substantially broader and harder to verify as one unit.

## Authentication and visibility boundary

Both endpoints require a valid, unexpired session belonging to an active account. Active students, staff members and administrators may browse reports through the same member-facing contract.

Ordinary browsing never exposes `draft` reports. A missing report and a draft report both produce the same not-found response, so the endpoint does not reveal whether a draft ID exists.

The member-facing endpoints apply the same privacy rules to every role. Owner and staff management views may later use separate explicitly authorised endpoints; this ordinary browse API does not silently bypass privacy settings.

The browsing service queries only `ItemReport`. It never queries `PrivateVerificationDetails`, so distinguishing features, exact location details, serial numbers, verification questions, expected answers and private notes cannot enter this data flow.

## List and search endpoint

`GET /api/reports` accepts these optional query parameters:

- `q`: trimmed keyword query containing 2-100 characters.
- `reportType`: `lost` or `found`.
- `categoryId`: a valid MongoDB ObjectId string.
- `campusLocationId`: a valid MongoDB ObjectId string.
- `status`: `open`, `claim_pending`, `resolved` or `closed`.
- `color`: a trimmed 1-32 character value matched case-insensitively as a complete colour value.
- `occurredFrom`: an ISO date-time with an explicit offset.
- `occurredTo`: an ISO date-time with an explicit offset.
- `hasPhoto`: `true` or `false`.
- `page`: a positive integer, defaulting to `1`.
- `pageSize`: an integer from 1-50, defaulting to `12`.

Unknown parameters are rejected. When both date limits are present, `occurredFrom` must not be later than `occurredTo`.
Each parameter may appear at most once; duplicate values are rejected instead of being silently discarded.

The base query excludes `draft`. Additional filters are combined with it:

- `q` uses the existing text index across title, public description and tags.
- `reportType`, category and status use exact matches.
- `color` uses an escaped, anchored, case-insensitive match so regular-expression metacharacters remain ordinary user input.
- A campus-location filter also requires `privacySettings.showCampusLocation: true`.
- Either date filter also requires `privacySettings.showEventDate: true`.
- `hasPhoto=true` requires `privacySettings.showPhoto: true` and at least one photo URL.
- `hasPhoto=false` matches reports with no member-visible photo, including reports whose stored photos are hidden.

These coupled filters prevent query results from revealing hidden location, date or photo metadata.

Keyword results sort first by MongoDB text score, then by `occurredAt` and `_id` descending. Results without a keyword sort by `occurredAt` and `_id` descending. The `_id` tie-breaker keeps pagination deterministic.

The response shape is:

```json
{
  "reports": [],
  "pagination": {
    "page": 1,
    "pageSize": 12,
    "total": 0,
    "totalPages": 0
  }
}
```

Requesting a page beyond the final page returns an empty `reports` array with the actual pagination totals; it is not an error.

## Detail endpoint

`GET /api/reports/[id]` validates the path ID as a MongoDB ObjectId, authenticates the member and fetches one non-draft report.

It returns:

```json
{
  "report": {
    "id": "string",
    "reportType": "lost",
    "title": "Black laptop bag",
    "publicDescription": "Black laptop bag with a shoulder strap.",
    "categoryId": "string",
    "campusLocationId": "string or null",
    "occurredAt": "ISO date-time or null",
    "colors": ["black"],
    "tags": ["laptop", "bag"],
    "photoUrls": ["https://images.example/item.jpg"],
    "status": "open",
    "resolvedAt": null,
    "createdAt": "ISO date-time",
    "updatedAt": "ISO date-time",
    "isOwner": false
  }
}
```

The list uses the same report representation.

The response deliberately omits `reporterId` and the raw `privacySettings`. `isOwner` is derived by comparing the authenticated user ID with the stored reporter ID and does not disclose another user's identifier.

## Privacy-aware response mapping

The member-visible mapper applies these transformations:

- `showPhoto=false` returns `photoUrls: []`.
- `showEventDate=false` returns `occurredAt: null`.
- `showCampusLocation=false` returns `campusLocationId: null`.
- Category, colours, tags, status and ordinary timestamps remain member-visible.

The mapper receives only an ItemReport document and the authenticated viewer ID. It never accepts or returns a private-verification document.

Owner-specific management data is outside this contract. Even an owner sees the privacy-filtered representation through these ordinary browse endpoints; the report-creation response remains the existing owner-safe confirmation.

## Module boundaries

- `src/lib/reports/browse-validation.ts` owns strict URL query and path-ID validation.
- `src/lib/reports/browse-service.ts` builds the bounded query, executes list/count or detail reads and returns member-visible reports.
- `src/lib/reports/public-report.ts` gains the member-visible mapper and response type alongside the existing owner mapper.
- `src/lib/reports/errors.ts` gains browse-specific safe errors without changing existing submission responses.
- `src/app/api/reports/route.ts` gains `GET` while preserving the existing `POST` behavior.
- `src/app/api/reports/[id]/route.ts` provides the detail handler.

No controller, repository hierarchy or new generic abstraction is introduced. The implementation follows the existing report and authentication patterns.

## Request flow

The list request follows this sequence:

1. Resolve the current user from the existing HttpOnly session cookie.
2. Reject unauthenticated or unavailable accounts before parsing or querying report filters.
3. Convert the URL search parameters into a strict validation input and reject unknown or invalid parameters.
4. Connect through the existing cached MongoDB connection helper.
5. Build a bounded member-visible query.
6. Fetch the requested page and total count in parallel.
7. Apply the member-visible mapper to every result.
8. Return the reports and pagination metadata.

The detail request follows the same authentication-first order, validates the ID, fetches a non-draft report, applies the same mapper and returns it.

## Error handling

Errors use the existing safe envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid report query",
    "fields": {}
  }
}
```

Exact mappings:

- HTTP 400 `VALIDATION_ERROR`: `Invalid report query` for invalid query parameters, date ranges or path IDs.
- HTTP 401 `AUTHENTICATION_REQUIRED`: `Authentication required`.
- HTTP 404 `REPORT_NOT_FOUND`: `Report not found`.
- HTTP 500 `REPORT_BROWSE_FAILED`: `Unable to load reports`.

Validation fields are included only when useful. Unexpected database, authentication or application failures map to the generic browse failure. Responses never include MongoDB errors, stack traces, submitted search internals, credentials or private report evidence.

## Automated testing

Vitest coverage will include:

- Accepted values, defaults and every boundary for all query parameters.
- Unknown parameters, malformed ObjectIds, invalid enums, invalid booleans, invalid pagination and reversed date ranges.
- Escaping and anchoring of colour input.
- Base draft exclusion and every structured filter.
- Privacy-coupled location, date and visible-photo filters.
- Text-score and deterministic non-text sorting.
- Pagination count, page calculation, empty results and pages beyond the available range.
- Member-visible mapping for each privacy setting and correct `isOwner` derivation.
- Complete exclusion of reporter IDs, raw privacy settings, private verification fields and authentication credentials.
- Authentication-before-query behavior for both routes.
- Active student, staff and administrator access.
- Exact list/detail success responses and safe 400, 401, 404 and 500 responses.
- Regression coverage proving the existing `POST /api/reports` behavior remains unchanged.

Database models, session resolution and route dependencies are mocked. Tests do not read `.env.local`, connect to Atlas or create live records.

Final verification runs:

- `npm test`.
- `npm run lint`.
- `npm run build`.
- `npm audit`.
- `git diff --check` and a branch-scope review.
- A Git ignored-file check confirming `.env.local` remains ignored without reading its contents.

## Out of scope

- Report browsing, search or detail pages and browser clients.
- Report editing, deletion, drafts, owner history or status transitions.
- Staff and administrator management views.
- Claims, handover, recovery, notifications or messaging.
- AI-assisted matching or duplicate detection.
- Image upload, media storage or image processing.
- Atlas Search, new dependencies, schema migrations or live Atlas writes.
