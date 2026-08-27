# Administrator Reference Data Management Backend Design

**Date:** 2026-08-27  
**Issue:** #40  
**Status:** Approved for implementation planning

## Goal

Add safe administrator-only backend management for report categories and
campus locations while preserving historical report references and the
existing member-facing behaviour.

## Context

`Category` and `CampusLocation` already exist as Mongoose models. Authenticated
members currently consume only active records through `GET /api/categories`
and `GET /api/campus-locations`. Report submission validates that selected
references exist and are active.

The missing capability is an administrator boundary for discovering active and
inactive reference data, creating records, editing controlled fields, and
deactivating or restoring records. This directly addresses the project brief's
requirement that administrators manage system categories while avoiding a new
data model or dependency.

## Approved approach

Create separate administrator routes for categories and campus locations. The
routes share validation, authorization, error, pagination, and concurrency
patterns but keep resource-specific request and response contracts explicit.

Updates use the current `updatedAt` value as an optimistic-concurrency token.
Records are never permanently deleted. Setting `isActive` to `false` removes a
record from the existing member-facing option endpoints without invalidating
historical reports that already reference it.

## Alternatives considered

### Combined reference-data endpoint

A single endpoint could return and mutate both resource types. It would reduce
the route count but require a discriminator in every request and produce
branch-heavy validation and error handling. Separate resource routes are
clearer and match the existing public endpoints.

### Permanent deletion

Deleting unused records would appear simpler to administrators, but it would
create referential risk and require usage checks or migrations. Soft state is
already present through `isActive` and is sufficient for this project.

### New administration audit model

A generic reference-data audit history could be useful in a larger production
system. Issue #40 does not require historical audit browsing, and introducing a
new collection would expand the scope beyond the course requirement. Mongoose
timestamps and optimistic concurrency cover the required current-state safety.

## Scope

Issue #40 includes:

- active-administrator authorization;
- strict list-query, create-body, update-body, path-ID, and response contracts;
- paginated discovery of active and inactive categories;
- paginated discovery of active and inactive campus locations;
- category and campus-location creation;
- controlled name, description, and active-state updates;
- case-insensitive duplicate detection;
- optimistic conflict detection with `updatedAt`;
- closed, stable HTTP errors;
- service and route tests plus public-endpoint regressions;
- final verification evidence.

Issue #40 excludes:

- administrator frontend pages or browser clients;
- permanent deletion;
- bulk operations;
- import, export, or seed data;
- a new audit-history model;
- report moderation or flagged-content workflows;
- changes to the existing Category or CampusLocation schemas;
- changes to the report-submission contract;
- any live MongoDB Atlas mutation during testing.

## Authorization boundary

Every administrator route resolves the current account from the existing
HttpOnly session cookie. Missing authentication returns 401. Any student,
staff account, suspended administrator, or deactivated administrator returns
403.

Authorization completes before business validation or database work. A
request cannot supply an administrator ID, role, or account status. Services
receive the authenticated `PublicUser` and enforce the same active-
administrator invariant so future callers cannot bypass the route check.

The new domain uses its own reference-data error boundary. It does not reuse
account-management response helpers or expose an unrelated error domain.

## HTTP API

### Category collection

`GET /api/admin/categories`

- accepts `q`, `status`, and `page`;
- returns a fixed page of 20 records;
- sorts by normalized name ascending and ID ascending;
- includes active and inactive records when `status=all`;
- defaults to `status=all` and `page=1`.

`POST /api/admin/categories`

- creates one active category;
- returns HTTP 201 with the created public category;
- accepts no ID, timestamp, or active-state input.

### Category member

`PATCH /api/admin/categories/{categoryId}`

- updates one or more of `name`, `description`, and `isActive`;
- requires the exact current `updatedAt` value;
- returns HTTP 200 with the updated public category;
- provides no DELETE method.

### Campus-location collection

`GET /api/admin/campus-locations`

- accepts `q`, `status`, and `page`;
- returns a fixed page of 20 records;
- sorts by campus name, location name, and ID ascending;
- includes active and inactive records when `status=all`;
- defaults to `status=all` and `page=1`.

`POST /api/admin/campus-locations`

- creates one active campus location;
- returns HTTP 201 with the created public campus location;
- accepts no ID, timestamp, or active-state input.

### Campus-location member

`PATCH /api/admin/campus-locations/{campusLocationId}`

- updates one or more of `campusName`, `locationName`, `description`, and
  `isActive`;
- requires the exact current `updatedAt` value;
- returns HTTP 200 with the updated public campus location;
- provides no DELETE method.

## List-query contract

The strict query parser recognizes only:

- `q`: optional trimmed text of 1-80 characters; blank text is omitted;
- `status`: `all`, `active`, or `inactive`, defaulting to `all`;
- `page`: a canonical base-10 integer from 1 through 10,000, defaulting to 1.

Duplicate recognized keys, unknown keys, noncanonical numbers, and values
outside these bounds are invalid. Search is escaped before it enters a
case-insensitive regular expression. Category search covers name and
description. Campus-location search covers campus name, location name, and
description.

Every list response contains:

- the resource array;
- `page`;
- `pageSize`, fixed at 20;
- `total`;
- `totalPages`.

The response contract guarantees nonnegative totals, at most 20 records, and
pagination values consistent with the returned page.

## Public resource contracts

An administrator category contains only:

- `id`;
- `name`;
- `description` as string or `null`;
- `isActive`;
- `createdAt` as an ISO timestamp;
- `updatedAt` as an ISO timestamp.

An administrator campus location contains only:

- `id`;
- `campusName`;
- `locationName`;
- `description` as string or `null`;
- `isActive`;
- `createdAt` as an ISO timestamp;
- `updatedAt` as an ISO timestamp.

No response includes Mongoose version fields, raw ObjectIds, internal model
state, administrator identity, report records, or private verification data.

## Create contracts

Category creation accepts:

- `name`: trimmed, 2-80 characters;
- `description`: `null` or trimmed text of at most 300 characters.

Campus-location creation accepts:

- `campusName`: trimmed, 2-80 characters;
- `locationName`: trimmed, 2-120 characters;
- `description`: `null` or trimmed text of at most 300 characters.

An omitted, empty, or whitespace-only description becomes `null`. The strict
schemas reject unknown fields. New records always use `isActive: true` on the
server. POST and PATCH bodies use the existing streaming request-body pattern
with an exact 8 KiB byte limit and fatal UTF-8 decoding.

## Update contracts

Category updates accept:

- required `updatedAt` as a valid ISO timestamp;
- optional `name` with the create limits;
- optional `description` with the create rules;
- optional `isActive` boolean.

Campus-location updates accept:

- required `updatedAt` as a valid ISO timestamp;
- optional `campusName` with the create limits;
- optional `locationName` with the create limits;
- optional `description` with the create rules;
- optional `isActive` boolean.

At least one mutable field must be present. The schemas reject IDs,
administrator data, timestamps other than `updatedAt`, and unknown fields.

## Service design

The service layer exposes explicit category and campus-location operations:

- list with a normalized query;
- create with normalized fields;
- update by canonical ObjectId and concurrency timestamp.

List operations build only bounded filters, count matching records, request one
page, select approved fields, and map lean documents into public contracts.

Create operations connect to MongoDB, construct the server-controlled active
record, save it, and map the result. Existing case-insensitive unique indexes
remain the source of truth for duplicate protection.

Update operations use `findOneAndUpdate` with both `_id` and the parsed
`updatedAt` value in the filter, `$set` for approved fields, `runValidators`,
and a returned updated document. If no document matches, an existence check by
ID distinguishes a missing record from a stale timestamp. Because Issue #40
does not delete records, a failed match followed by an existing ID is a stable
concurrency conflict.

No service updates historical ItemReport documents. Existing reports continue
to resolve their stored reference IDs even when a reference record becomes
inactive.

## Error contract

Responses use fixed codes, statuses, and messages:

| Code | HTTP | Meaning |
| --- | ---: | --- |
| `INVALID_REFERENCE_DATA_REQUEST` | 400 | Query, path, JSON, or body validation failed |
| `AUTHENTICATION_REQUIRED` | 401 | No current account exists |
| `ADMINISTRATOR_REQUIRED` | 403 | The account is not an active administrator |
| `REFERENCE_DATA_NOT_FOUND` | 404 | The requested category or campus location does not exist |
| `REFERENCE_DATA_DUPLICATE` | 409 | A case-insensitive unique name or location pair already exists |
| `REFERENCE_DATA_STATE_CONFLICT` | 409 | The submitted `updatedAt` value is stale |
| `REFERENCE_DATA_OPERATION_FAILED` | 500 | An unexpected safe server failure occurred |

Routes never return exception messages, database errors, duplicate-key index
names, field values from failed documents, stack traces, or endpoint details.
Malformed JSON and unsupported body shapes map to the same invalid-request
response.

## File boundaries

Implementation will keep responsibilities separate:

- an access module enforces the active-administrator invariant;
- a contract module defines strict Zod inputs and safe response types;
- a request-body module performs bounded JSON parsing;
- an error module owns closed codes, messages, and response mapping;
- a service module owns Category and CampusLocation queries and mutations;
- four route groups adapt HTTP requests to those modules;
- focused tests sit beside each boundary.

The implementation plan may split the service by resource only if the shared
file becomes difficult to review. No speculative repository, factory, or
generic CRUD abstraction is introduced.

## Security and privacy

- Authentication and authorization happen before database access.
- The HttpOnly cookie remains inaccessible to browser JavaScript.
- The client cannot assert administrator identity or role.
- Query text is length-bounded and regex-escaped.
- Request bodies are limited to 8 KiB, decoded as strict UTF-8, and parsed with
  strict Zod schemas.
- Mutations are field allowlists and use server-controlled timestamps.
- Optimistic concurrency prevents silent lost updates.
- Soft deactivation preserves referential history.
- Error responses use fixed safe copy.
- Tests use mocks and fixtures and never connect to MongoDB Atlas.
- `.env.local` remains ignored and is never displayed or committed.

## Testing strategy

### Contract and request tests

- accept exact valid queries, creates, updates, IDs, and timestamps;
- normalize optional descriptions and default list values;
- reject duplicate or unknown query keys;
- reject malformed pages, status values, IDs, JSON, and timestamps;
- reject unknown body fields and updates without mutable fields;
- prove response objects contain only approved keys.

### Service tests

- reject every unauthorized role and inactive administrator before connecting;
- list stable category and campus-location pages with bounded filters;
- escape search text and apply each active-state filter;
- create active normalized records;
- map duplicate-key failures to the safe duplicate response;
- update only approved fields with `_id + updatedAt`;
- distinguish missing IDs from stale timestamps;
- retain historical report references by never deleting or rewriting reports;
- map unexpected model failures to the safe operation failure.

### Route tests

- prove 401 and 403 occur before request parsing or service work;
- verify list, 201 create, and 200 update responses;
- verify safe 400, 404, 409, and 500 responses;
- reject malformed path IDs and JSON bodies;
- prove no route consumes client-supplied administrator data.

### Regression and quality gates

- existing member Category and CampusLocation endpoints still return only
  active options;
- report submission and reference validation regressions remain green;
- existing model tests remain green without schema changes;
- the focused suite and full Vitest suite pass;
- ESLint and TypeScript without emission pass;
- the Next.js production build lists all new administrator routes;
- `npm audit` reports zero vulnerabilities;
- repository scope and privacy scans show no dependency, model, credential, or
  private-data drift.

## Acceptance criteria

Issue #40 is complete when:

- only an active administrator can reach every new operation;
- administrators can search and paginate active and inactive categories and
  campus locations;
- administrators can create valid active records;
- administrators can edit controlled names and descriptions;
- administrators can deactivate and restore records without deleting them;
- every update requires and atomically checks `updatedAt`;
- duplicate, missing, stale, invalid, unauthorized, and unexpected failures
  produce the fixed safe contract;
- existing member APIs still expose only active records;
- historical report references remain unchanged;
- no dependency or database-schema change is introduced;
- tests do not connect to Atlas;
- all quality gates pass and exact evidence is recorded.

## Delivery sequence

1. Commit this approved design on the Issue #40 feature branch.
2. Write a task-by-task TDD implementation plan.
3. Implement contracts and safe errors before database operations.
4. Implement tested category operations and routes.
5. Implement tested campus-location operations and routes.
6. Run full regression, scope, privacy, build, and audit gates.
7. Record verification evidence and open a pull request that closes Issue #40.
