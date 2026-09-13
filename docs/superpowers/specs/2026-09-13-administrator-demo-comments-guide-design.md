# Administrator Demo Comments and Guide Design

## Purpose

Prepare the administrator-owned parts of Campus Find for a clear course demonstration. Add concise English comments to the important source-code paths and produce one bilingual Word guide that connects each demonstrated action to its implementation.

## Scope

The work covers the group leader's assigned administrator responsibilities:

- administrator access control;
- overview statistics;
- category and campus-location reference data;
- member report flags and report moderation;
- the short group-leader introduction and conclusion.

Account management, student report submission, Claims, staff storage, notifications, and AI matching are mentioned only when they provide necessary context. Their source files will not receive presentation comments.

## Source Comment Design

Comments will be written in concise English to match the existing codebase. They will explain only logic that is useful during a live code walkthrough:

- the responsibility of an API, service, or client boundary;
- role and active-account checks;
- aggregation definitions used by administrator statistics;
- strict input and response validation;
- optimistic concurrency through the current `updatedAt` value;
- transaction boundaries and audit records;
- the distinction between dismissing a flag and hiding a report;
- preservation of historical report references when reference data is inactive;
- safe error handling that avoids exposing database details.

Imports, obvious assignments, simple JSX, and self-explanatory tests will not be annotated. No business logic, API contract, database schema, user-visible copy, dependency, or test expectation will change.

## Demonstration Guide Design

The deliverable will be a bilingual Word document titled `管理员功能演示与代码跟踪简要发言稿_中英双语.docx`. It is designed for a six-to-eight-minute presentation and contains:

1. a short preparation checklist;
2. a timed demonstration route;
3. exact actions for administrator overview, reference data, and moderation;
4. a function-to-code trace from page to browser client, API route, service, model, and test;
5. concise Chinese explanation followed by natural English speaking lines;
6. a simple flow diagram for the shared UI-to-database architecture;
7. likely assessor questions with short evidence-based answers;
8. fallback wording for empty data, unavailable database, or failed live actions;
9. a closing statement from the group leader.

The guide will explain that the administrator statistics are operational database aggregates, not AI output. It will also state that the matching feature is a separate explainable deterministic function implemented elsewhere in the project.

## Demonstration Order

1. Introduce the system, roles, and assigned responsibility.
2. Open Administrator overview and explain the statistics.
3. Open Manage reference data, demonstrate search and one safe reversible action.
4. Open Report moderation, filter the flag queue, and explain dismiss versus hide.
5. Follow one representative action through frontend, API, service, and MongoDB model code.
6. Summarise privacy, validation, concurrency, transactions, testing, and team leadership.

Destructive or disruptive demonstrations will be avoided. The guide will prefer creating a clearly named temporary reference-data record and restoring any changed active status before finishing.

## Validation

- Run focused administrator tests affected by comment-only edits.
- Run ESLint and TypeScript validation.
- Confirm that `git diff` contains comments and the new documentation only.
- Render the Word document to page images and inspect every page for clipping, overlap, unreadable code paths, and broken bilingual layout.
- Preserve the existing unrelated deletion of `web/public/campus-find-hero.png` without staging or modifying it.

## Acceptance Criteria

- A reader can identify the responsibility and security boundary of each annotated administrator code path.
- Comments remain concise and do not restate obvious syntax.
- The Word guide gives a complete six-to-eight-minute demonstration route.
- Every demonstrated function has a traceable code path and at least one relevant automated test reference.
- Chinese explanations and English speaking lines describe the same behaviour without unsupported claims.
- No application behaviour changes.
