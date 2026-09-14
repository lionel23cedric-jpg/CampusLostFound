# Campus Find Project Quality Polish Design

**Date:** 15 September 2026  
**Repository scope:** `D:\Massey\CampusLostFound` only  
**Status:** Approved for implementation planning

## 1. Objective

Improve the existing Campus Find course project without changing its core
purpose or adding infrastructure that is disproportionate to the assignment.
The work will improve registration guidance, visual consistency,
administrator statistics, upload privacy, request protection, database setup,
AI evaluation, documentation, and final delivery hygiene.

The implementation must preserve current student, staff, and administrator
workflows and must not discard the existing uncommitted worktree changes.

## 2. Design principles

- Keep all work under `D:\Massey`.
- Prefer shared components and small server utilities over page-by-page copies.
- Use local assets and native browser capabilities before adding dependencies.
- Keep every visual and engineering change relevant to the course brief.
- Preserve privacy boundaries and do not expose or automatically mutate live
  MongoDB Atlas data.
- Retain existing metric cards and workflows unless a verified defect requires
  a change.
- Test behaviour, error states, accessibility, and responsive layouts.

## 3. Registration guidance

The registration form will show persistent help text for every field:

- Display name: 2 to 80 characters.
- Email: a valid email address with an example.
- Password: 10 to 128 characters.
- Confirm password: must match the password.

The help text will use the same limits as the shared Zod schemas. Help and error
messages will be connected to their input with `aria-describedby`; validation
errors will not remove the underlying rule.

Primary files:

- `web/src/components/auth/register-form.tsx`
- `web/src/components/auth/password-field.tsx`
- `web/src/components/auth/auth-form.module.css`
- Their focused tests

## 4. Visual system

Five small local SVG illustrations will represent the main functional areas:

- Authentication
- Reports
- Ownership Claims
- Notifications and dashboard
- Staff and administration

They will be stored under `web/public/illustrations` and rendered through a
shared responsive component using `next/image`. Authentication pages may use a
larger visual. Lists, empty states, and functional dashboards will use smaller
contextual visuals. Report detail pages will continue to prioritise images
uploaded by users. Administrative forms will not be turned into promotional
pages.

Local assets prevent broken remote-image URLs and avoid transmitting page visits
to third-party image hosts. Decorative images will use empty alternative text;
informative images will have concise meaningful alternatives.

## 5. Administrator overview charts

Each current administrator overview section will receive one accessible native
SVG doughnut chart. No chart dependency will be added.

- Reports: submitted Lost versus submitted Found.
- Ownership Claims: Pending, Approved, Rejected, Withdrawn, and Completed.
- Accounts: Active, Suspended, and Deactivated.

Only mutually exclusive values will be used as pie segments. Existing values
such as unresolved, recovered, and matched may overlap and therefore remain in
the metric cards instead of being incorrectly represented as parts of a whole.

Every chart will include a text title, legend, exact values, a plain-language
summary, and a zero-total state. Chart values must come from the same validated
overview response as the metric cards.

Primary files:

- A new shared overview chart component and module stylesheet
- `web/src/components/admin/admin-overview-client.tsx`
- `web/src/components/admin/admin-overview.module.css`
- Focused chart and overview tests

## 6. Image privacy and request-body handling

Uploaded JPEG, PNG, and WebP files will be decoded, auto-oriented, and
re-encoded with Sharp without retaining metadata. The processed output will be
validated again for content type, non-zero length, and the 3 MB stored-size
limit before it reaches MongoDB.

Ordinary JSON endpoints will use one shared UTF-8 request reader with a 16 KB
limit. Image multipart requests will retain their separate image-size rules.
The duplicated Claims, Notifications, Account, and Reference Data readers will
be replaced by thin uses of the shared implementation while preserving their
public error mapping where necessary.

## 7. Basic rate limiting

A bounded in-memory fixed-window limiter will protect:

- Login attempts by client address and normalised email.
- Registration attempts by client address.
- Report creation, Claim submission, report flagging, and other selected write
  operations by authenticated user or client address.
- Sensitive staff and administrator mutations at a less restrictive threshold.

Rejected requests will return HTTP 429 with a safe response and `Retry-After`.
The implementation will have deterministic tests and no new external service.
Documentation will state that process-local rate limiting is a baseline course
project control and must be replaced by a shared store for multi-instance
production deployment.

## 8. Database bootstrap and legacy image cleanup

An idempotent `npm run db:bootstrap` command will upsert the required default
categories and campus locations. Running it repeatedly must not create
duplicates. It will not silently create privileged accounts or overwrite
existing administrator-managed records.

A legacy photo-reference audit command will report external and invalid image
references. It will operate in dry-run mode by default and require an explicit
`--apply` flag before changing a configured database. New report writes will
accept only internal report-image references. No live Atlas cleanup will be run
without separate explicit user approval.

## 9. Dependency security

The implementation will begin with a reproducible dependency audit. Next.js,
Sharp, and other packages will be upgraded only to compatible versions that
remove identified advisories. Framework-wide or major-version migrations will
not be performed merely to reach the newest release.

After changes, tests, lint, TypeScript, production build, and a fresh audit must
all be recorded. Direct dependencies and lockfile overrides will be simplified
where the audit proves an override is no longer needed.

## 10. Independent matching evaluation

A synthetic, privacy-safe labelled dataset will contain plausible Lost/Found
report pairs, hard negatives, and ambiguous cases. The evaluation will execute
the existing explainable matcher separately from production MongoDB and report:

- Precision
- Recall
- F1 score
- Top-match accuracy
- Representative false-positive and false-negative explanations

The dataset and thresholds will be versioned so the result is repeatable. This
work evaluates the current deterministic intelligent matching feature; it does
not introduce an external generative-AI API.

## 11. Documentation and cleanup

The repository will gain or update:

- ERD
- Architecture diagram
- User guide
- Test matrix
- AI matching evaluation report
- Contribution records
- README setup, bootstrap, run, verification, and security limitations

Mermaid will be used for diagrams that GitHub can render directly. Duplicate
state, legacy compatibility, stale image references, and repeated code will be
removed only after reference searches and tests show the removal is safe.
Database values will not be renamed or deleted without a documented migration.

## 12. Implementation order

1. Record the current Git and verification baseline without losing dirty work.
2. Add registration guidance and focused tests.
3. Add the shared visual system and responsive page integrations.
4. Add accessible administrator overview charts.
5. Audit and update vulnerable dependencies.
6. Add metadata-stripping image processing.
7. Unify bounded JSON request parsing.
8. Add and test basic rate limiting.
9. Add the database bootstrap and dry-run cleanup utility.
10. Add the matching evaluation dataset and reproducible metrics.
11. Perform evidence-based duplicate and legacy cleanup.
12. Complete course documentation and the test matrix.
13. Run the complete automated and manual verification matrix.
14. Merge only after verification, then produce a clean source archive.

## 13. Acceptance criteria

- Registration rules are visible before submission and match server validation.
- Every functional area uses an appropriate local visual without overwhelming
  forms or report evidence.
- The three overview charts exactly agree with their metric cards and work with
  zero data and assistive technology.
- Stored uploaded images contain no retained EXIF or GPS metadata.
- Oversized JSON returns 413; rate-limited operations return 429 and
  `Retry-After`.
- Database bootstrap is idempotent.
- Legacy image cleanup is non-destructive by default.
- Matching evaluation is repeatable and documents its dataset and limitations.
- ERD, architecture, user guide, test matrix, and contribution evidence match
  the implemented system.
- `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`, and the final
  dependency audit pass to the documented standard.
- No `.env.local`, credentials, `node_modules`, `.next`, Git internals, or
  temporary verification files are included in the submission ZIP.

## 14. Delivery and Git safety

Before editing source, the current branch, differences from `develop`, and all
uncommitted changes will be inventoried. Approved existing work will be
preserved. Project-quality work will be isolated on a feature branch under the
D-drive repository.

The feature branch will be integrated into an up-to-date `develop` only after
all acceptance checks pass. The final submission branch and clean ZIP will be
created last, with a recorded file manifest and checksum.
