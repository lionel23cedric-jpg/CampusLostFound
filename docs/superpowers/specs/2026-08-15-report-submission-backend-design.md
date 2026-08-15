# Report Submission Backend Design

## Goal

Add a secure server-side foundation that lets authenticated students submit complete lost or found reports while keeping ownership-verification evidence separate from member-visible report data.

## Scope

This change adds:

- `GET /api/categories` for active report categories.
- `GET /api/campus-locations` for active campus locations.
- `POST /api/reports` for complete lost or found report submission.
- Strict request validation, safe response mapping and stable public API errors.
- A transactional service that creates `ItemReport` and `PrivateVerificationDetails` together.
- Automated Vitest coverage that mocks database, authentication and route boundaries.

This is a backend-only change. Report forms, report browsing, image upload, claims and matching are separate features.

## Chosen approach

Thin Next.js Route Handlers will delegate to focused report modules. Route handlers own HTTP parsing and responses; validation owns the accepted input contract; the service owns authorisation, active-reference checks and the MongoDB transaction; response mapping owns the safe output contract.

This matches the existing authentication architecture and keeps security-sensitive responsibilities independently testable.

Rejected alternatives:

- Direct Mongoose operations in Route Handlers would mix HTTP, validation, authorisation and transaction logic.
- A repository and controller hierarchy would add abstractions that the current project does not need.

## Module boundaries

- `src/lib/reports/validation.ts` defines the strict Zod submission schema.
- `src/lib/reports/errors.ts` defines known report errors and safe HTTP mappings.
- `src/lib/reports/public-report.ts` maps a created report to its owner-safe response.
- `src/lib/reports/reference-data.ts` lists active categories and campus locations using explicit field selection and sorting.
- `src/lib/reports/service.ts` authorises creation, validates references and coordinates persistence.
- The three Route Handlers authenticate requests, parse input, call the report modules and return safe responses.

The implementation reuses the existing authentication session resolver and cached MongoDB connection module. It does not duplicate password, cookie or connection logic.

## Authentication and authorisation

All three endpoints require a valid, unexpired session belonging to an active account.

The reference-data endpoints may be used by any authenticated active student, staff member or administrator. `POST /api/reports` is restricted to active users with the `student` role. Staff and administrator report creation or report management will be designed with their management workflows later.

An absent, invalid or expired session returns HTTP 401. An authenticated account without permission to create a report returns HTTP 403.

The client never controls `reporterId`, `status` or `resolvedAt`:

- `reporterId` comes from the authenticated user.
- `status` is set to `open` after a complete successful submission.
- `resolvedAt` is set to `null`.

## Reference-data endpoints

### `GET /api/categories`

The endpoint queries only records with `isActive: true`, sorts by `name`, and returns:

```json
{
  "categories": [
    {
      "id": "string",
      "name": "Electronics",
      "description": "Phones, laptops and related devices"
    }
  ]
}
```

Only `id`, `name` and `description` are returned.

### `GET /api/campus-locations`

The endpoint queries only records with `isActive: true`, sorts by `campusName` and then `locationName`, and returns:

```json
{
  "campusLocations": [
    {
      "id": "string",
      "campusName": "Auckland",
      "locationName": "Library",
      "description": null
    }
  ]
}
```

Only `id`, `campusName`, `locationName` and `description` are returned.

Reference-data administration and automatic seed writes are outside this change.

## Report-submission request

`POST /api/reports` accepts JSON with this shape:

```json
{
  "reportType": "lost",
  "title": "Black laptop bag",
  "publicDescription": "Black laptop bag with a shoulder strap.",
  "categoryId": "object-id",
  "campusLocationId": "object-id",
  "occurredAt": "2026-08-15T02:00:00.000Z",
  "colors": ["black"],
  "tags": ["laptop", "bag"],
  "photoUrls": ["https://images.example/item.jpg"],
  "privacySettings": {
    "showPhoto": true,
    "showEventDate": true,
    "showCampusLocation": true
  },
  "privateVerification": {
    "distinguishingFeatures": ["Small scratch beneath the handle"],
    "exactLocationDetails": "Second-floor study area",
    "serialNumber": null,
    "verificationQuestions": [
      {
        "question": "What is attached to the zipper?",
        "expectedAnswer": "A blue tag"
      }
    ],
    "privateNotes": null
  }
}
```

The Zod schema is strict at every object boundary. Unknown fields, including `reporterId`, `status`, `resolvedAt`, `role` or persistence metadata, are rejected rather than accepted or silently ignored.

Validation mirrors the existing Mongoose constraints:

- `reportType` is `lost` or `found`.
- `title` contains 5-120 trimmed characters.
- `publicDescription` contains 10-2000 trimmed characters.
- Category and campus-location IDs are valid ObjectId strings.
- `occurredAt` is a valid ISO date that is not later than the request time.
- `colors` contains 1-5 trimmed values of at most 32 characters.
- `tags` contains at most 10 trimmed, lowercased values of at most 40 characters.
- `photoUrls` contains at most five HTTPS URLs. An empty array is allowed.
- All three privacy values are booleans and default to `true` when their object or values are omitted.
- `distinguishingFeatures` contains 1-10 trimmed values of at most 200 characters.
- Optional private strings accept `null` or a constrained trimmed value. Blank optional strings are normalised to `null` before persistence.
- `verificationQuestions` contains 1-5 strict question-and-answer objects using the existing length limits.

Passwords, session tokens and account fields are never part of the submission contract.

## Transactional creation flow

The request follows this sequence:

1. Resolve the current user from `clf_session`.
2. Require an active student account.
3. Parse JSON and validate the complete request.
4. Open a Mongoose session and transaction.
5. Within the transaction, confirm that the referenced Category and CampusLocation exist and remain active.
6. Create ItemReport with server-owned reporter, status and resolution fields.
7. Create the one-to-one PrivateVerificationDetails record using the new report ID.
8. Commit only after both records are valid and persisted.
9. Return HTTP 201 with an owner-safe report response.

If either reference is unavailable, or either create operation fails, the transaction does not leave a partial report. The database session is always ended.

## Owner-safe response

The creation response includes only non-secret report data:

```json
{
  "report": {
    "id": "string",
    "reporterId": "string",
    "reportType": "lost",
    "title": "Black laptop bag",
    "publicDescription": "Black laptop bag with a shoulder strap.",
    "categoryId": "string",
    "campusLocationId": "string",
    "occurredAt": "2026-08-15T02:00:00.000Z",
    "colors": ["black"],
    "tags": ["laptop", "bag"],
    "photoUrls": ["https://images.example/item.jpg"],
    "status": "open",
    "privacySettings": {
      "showPhoto": true,
      "showEventDate": true,
      "showCampusLocation": true
    },
    "resolvedAt": null,
    "createdAt": "2026-08-15T02:05:00.000Z",
    "updatedAt": "2026-08-15T02:05:00.000Z"
  }
}
```

The response is returned only to the authenticated creator, so it may show all non-private fields that the creator just submitted. Future member-facing list and detail responses must independently apply `privacySettings` before showing photos, event dates or campus locations.

The creation response never includes distinguishing features, exact location details, serial numbers, verification questions, expected answers or private notes. It also never includes a password hash, raw session token or session hash.

## Error handling

Known errors use the existing safe error envelope style:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid report",
    "fields": {}
  }
}
```

`fields` is included only for request-validation failures.

Exact mappings:

- HTTP 400 `VALIDATION_ERROR`: `Invalid report`.
- HTTP 401 `AUTHENTICATION_REQUIRED`: `Authentication required`.
- HTTP 403 `REPORT_CREATION_FORBIDDEN`: `Only active student accounts can create reports`.
- HTTP 422 `CATEGORY_UNAVAILABLE`: `Category is unavailable`.
- HTTP 422 `CAMPUS_LOCATION_UNAVAILABLE`: `Campus location is unavailable`.
- HTTP 500 `REPORT_CREATION_FAILED`: `Unable to create report`.
- HTTP 500 `REFERENCE_DATA_FAILED`: `Unable to load reference data`.

Only a failure from parsing the incoming request body as JSON maps to the validation response. Request parsing is kept in a separate error boundary so an unrelated internal `SyntaxError` cannot be misclassified as HTTP 400. Unexpected database or application failures map to the relevant generic HTTP 500 response. Routes never return MongoDB errors, stack traces, submitted private evidence or internal document fields.

User-submitted strings are data, not HTML. Future React views must use normal escaped text rendering and must not inject these values through raw HTML APIs.

## Automated testing

Vitest tests will cover:

- Strict validation of valid submissions and every bounded field group.
- Rejection of unknown or server-owned fields.
- Rejection of future dates, malformed ObjectIds, non-HTTPS photo URLs, excessive arrays and invalid private evidence.
- Active-only reference queries, explicit response fields and stable sorting.
- Authentication requirements on all routes.
- Active-student-only submission permission.
- Successful reference validation and two-record transactional creation.
- Server control of reporter, `open` status and `null` resolution time.
- Missing or inactive category and campus-location errors.
- Transaction rollback and session cleanup on persistence failures.
- Exact route status codes and public error bodies.
- Complete exclusion of private verification and authentication credentials from successful responses.

Model access, database sessions, current-user resolution and Route Handler dependencies are mocked. Automated tests do not read `.env.local`, connect to Atlas or create real application records.

Final verification runs:

- `npm test`.
- `npm run lint`.
- `npm run build`.
- `npm audit`.
- `git diff --check` and a branch-scope review.
- A Git ignored-file check confirming `.env.local` remains ignored without reading its contents.

## Out of scope

- Report list, detail, search or filtering endpoints.
- Report editing, deletion, drafts, publication or status transitions.
- Image upload, storage or preview UI.
- Claim, ownership-review, handover or recovery workflows.
- Notifications and AI-assisted matching.
- Staff or administrator report-management operations.
- Category or campus-location administration.
- Automatic reference-data seed writes or Atlas test records.
- Any user-facing page or form.
