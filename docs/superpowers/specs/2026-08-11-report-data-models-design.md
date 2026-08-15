# Report Data Models Design

## Goal

Establish the Mongoose data-model foundation for controlled categories and campus locations, lost/found reports, member-only search, privacy settings and private ownership verification.

## Scope

This change adds only the `Category`, `CampusLocation`, `ItemReport` and `PrivateVerificationDetails` models. Report APIs, forms, uploads, authorisation services, claims, notifications and matching logic will be implemented separately.

## Chosen approach

Lost and found records will share the `itemReports` collection and use `reportType` to distinguish them. Sensitive verification evidence will be stored in a separate one-to-one `privateVerificationDetails` collection.

This approach follows the approved proposal, avoids duplicated lost/found schemas and reduces the risk that ordinary report queries expose private evidence.

Alternative approaches were rejected:

- Separate lost and found collections would duplicate fields, indexes and matching queries.
- Embedding private evidence in ItemReport would make accidental disclosure more likely.

## Visibility and access boundary

Report data described as public is visible only to authenticated application users. It is not intended for anonymous internet access.

Ordinary list, detail and search operations will query only ItemReport. PrivateVerificationDetails may be queried later only by the report owner, staff or an administrator through explicit service-layer authorisation. Contact information will not be stored in ItemReport.

Mongoose schemas provide validation and safe default field selection. Future service and repository layers remain responsible for role checks, ownership checks and response-field filtering.

## Category model

Category stores:

- `name`: required, trimmed, 2-80 characters.
- `description`: optional, trimmed, at most 300 characters.
- `isActive`: boolean, defaults to `true`.
- Mongoose timestamps.

A case-insensitive unique index on `name` prevents duplicate categories that differ only in letter case.

## CampusLocation model

CampusLocation stores:

- `campusName`: required, trimmed, 2-80 characters.
- `locationName`: required, trimmed, 2-120 characters.
- `description`: optional, trimmed, at most 300 characters.
- `isActive`: boolean, defaults to `true`.
- Mongoose timestamps.

A case-insensitive compound unique index on `campusName` and `locationName` prevents duplicate managed locations.

## ItemReport model

ItemReport stores:

- `reporterId`: required ObjectId reference to User.
- `reportType`: `lost` or `found`.
- `title`: required, trimmed, 5-120 characters.
- `publicDescription`: required, trimmed, 10-2000 characters.
- `categoryId`: required ObjectId reference to Category.
- `campusLocationId`: required ObjectId reference to CampusLocation.
- `occurredAt`: required date for when the item was lost or found.
- `colors`: 1-5 trimmed colour values, each at most 32 characters.
- `tags`: at most 10 trimmed, lowercased tags, each at most 40 characters.
- `photoUrls`: at most 5 HTTP or HTTPS image URLs.
- `status`: `draft`, `open`, `claim_pending`, `resolved` or `closed`; defaults to `draft`.
- `privacySettings.showPhoto`: boolean, defaults to `true`.
- `privacySettings.showEventDate`: boolean, defaults to `true`.
- `privacySettings.showCampusLocation`: boolean, defaults to `true`.
- `resolvedAt`: required when status is `resolved`; otherwise optional.
- Mongoose timestamps.

Status meanings:

- `draft`: not ready for member search.
- `open`: active and eligible for opposite-type matching.
- `claim_pending`: a claim is under staff review.
- `resolved`: recovery and handover have completed.
- `closed`: withdrawn, expired or otherwise closed without requiring recovery.

The schema will include indexes for reporter history, opposite-type matching, category/date filtering, location/date filtering and text search across title, public description and tags.

## PrivateVerificationDetails model

PrivateVerificationDetails stores:

- `reportId`: required ObjectId reference to ItemReport with a unique index.
- `distinguishingFeatures`: 1-10 trimmed private features, each at most 200 characters.
- `exactLocationDetails`: optional, trimmed, at most 500 characters.
- `serialNumber`: optional, trimmed, at most 200 characters.
- `verificationQuestions`: 1-5 entries containing a 5-200 character question and a 1-500 character expected answer.
- `privateNotes`: optional, trimmed, at most 2000 characters.
- Mongoose timestamps.

Distinguishing features, exact location details, serial number, expected answers and private notes are excluded from normal query results with `select: false`. Authorised services must request them explicitly.

## Future data flow

A later report-creation service will:

1. Authenticate the user and validate the request with Zod.
2. Confirm the referenced Category and CampusLocation exist and are active.
3. Create ItemReport.
4. Create the one-to-one PrivateVerificationDetails record.
5. Return an ItemReport response filtered by privacy settings.

The two records should be created transactionally when the service layer is implemented. This model-only change does not create application data.

Future matching will compare only open reports of the opposite type and use public description, category, colours, tags, date and campus location. Private evidence will not participate in ordinary matching or search.

## Error handling

- Schema validation rejects invalid enums, missing required fields, excessive array sizes and invalid photo URL schemes.
- `resolved` reports without `resolvedAt` are invalid.
- Duplicate Category names, CampusLocation pairs and private records produce MongoDB duplicate-key errors for future services to translate.
- ObjectId format is checked by Mongoose; referenced-record existence and active status are checked later by services.
- Allowed status transitions and transition permissions are future business-service responsibilities.

## Verification

- Confirm representative valid documents for all four models pass in-memory validation without connecting to Atlas.
- Confirm invalid report type, empty colours, excessive photo URLs, missing private features and resolved-without-date cases fail validation.
- Confirm required unique, filtering and text-search indexes are present.
- Confirm sensitive private paths use `select: false`.
- Run `npm run lint`.
- Run `npm run build`.
- Run `npm audit`.

## Out of scope

- Report routes, services, repositories, forms and pages.
- Image upload or cloud media storage.
- Anonymous report access.
- Claim, handover, notification, audit and matching models.
- Status-transition implementation.
- Creating Category, CampusLocation, ItemReport or PrivateVerificationDetails records in Atlas.
