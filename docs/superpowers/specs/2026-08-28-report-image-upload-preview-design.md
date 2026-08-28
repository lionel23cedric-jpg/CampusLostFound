# Report Image Upload and Preview Design

**Date:** 2026-08-28
**Status:** Approved for specification
**Target branch:** `feature/report-image-upload-preview`

## Course alignment

The course brief requires lost and found reports to include a photo and lists
image upload and preview as a possible extension. This feature therefore
improves an assessed report workflow without adding an unrelated subsystem.

This design must not expand into image recognition, AI categorisation,
automatic moderation, image editing, messaging, maps, QR codes, or a new AI
agent. The existing explainable matching engine remains the project's single
intelligent feature.

## Goal

Replace the report form's manual photo URL entry with secure, persistent image
selection, local preview, upload, and member-safe display while preserving the
existing five-photo limit and report privacy rules.

## Success criteria

- An active student can select up to five JPEG, PNG, or WebP images while
  creating a lost or found report.
- Each selected image is no larger than 3 MiB.
- The browser shows a preview before submission and lets the student remove a
  selected image.
- The server validates file size and file signatures independently of browser
  metadata and rejects empty, malformed, unsupported, or oversized files.
- A report is created first, then its selected images are uploaded one at a
  time through an owner-only endpoint.
- Successfully uploaded images remain available after deployment through the
  existing MongoDB Atlas database.
- Uploaded images appear as an accessible gallery on an authorised report
  detail page.
- Non-owners cannot retrieve photos when `showPhoto` is false, and ordinary
  members cannot retrieve photos for a hidden report.
- Existing stored HTTPS photo URLs remain readable as external links, but the
  new report form no longer asks users to enter URLs.
- Upload failure never discards an otherwise valid report and can be retried
  from the submission result without re-uploading successful images.
- The implementation adds no storage platform, cloud account, image AI, or
  speculative abstraction.

## Non-goals

- Cropping, filters, compression, format conversion, thumbnails, or image
  optimisation
- EXIF analysis, location extraction, or image classification
- Editing or deleting images after leaving the submission workflow
- Drag-and-drop ordering or captions
- Images in report cards or matching calculations
- Public anonymous image access
- External object storage, CDN integration, migration, or backfill
- Automatic cleanup jobs beyond data removed as part of a failed transaction

The lack of metadata stripping is a documented limitation. The form will warn
students not to upload images containing visible personal information or
location-sensitive metadata. Server-side metadata normalisation should only be
added if the project later adopts an approved image-processing dependency.

## Selected approach

Use a dedicated MongoDB `ReportImage` collection through Mongoose. Each image
is stored in its own document rather than inside `ItemReport`, keeping the main
report document small and the existing report queries unchanged. This is the
smallest persistent design that reuses the project's current database,
authentication, transactions, validation, and testing patterns.

GridFS is unnecessary for files capped at 3 MiB and would add streaming and
bucket-management complexity. Cloudinary, S3, and Vercel Blob would add
accounts, secrets, third-party privacy considerations, and deployment
dependencies that the course requirement does not justify.

## Data model

Add `web/src/models/report-image.ts` with the following fields:

| Field | Rules |
|---|---|
| `reportId` | Required immutable `ObjectId` reference to `ItemReport` |
| `uploadedByUserId` | Required immutable `ObjectId`, hidden by default |
| `uploadKey` | Required immutable client-generated UUID, hidden by default |
| `contentType` | `image/jpeg`, `image/png`, or `image/webp` |
| `byteLength` | Integer from 1 through 3 MiB |
| `data` | Required `Buffer`, hidden by default |
| `createdAt` | Server timestamp used for stable gallery order |

Index `{ reportId: 1, createdAt: 1, _id: 1 }` for ordered retrieval and add a
unique index on `{ reportId: 1, uploadKey: 1 }` so retrying an uncertain network
response cannot create the same selected image twice. Do not store the original
filename because it is unnecessary and may reveal personal information.

`ItemReport.photoUrls` remains the public-facing reference list. A successful
upload appends a same-origin path in the form
`/api/report-images/{imageId}`. Existing HTTPS values remain valid for backward
compatibility. Validation accepts only an HTTPS URL or this exact internal
path; arbitrary relative URLs, HTTP URLs, data URLs, and JavaScript URLs remain
invalid.

## HTTP contracts

### `POST /api/reports/{reportId}/images`

Accept one `multipart/form-data` file field named `image` and one UUID field
named `uploadKey`.

1. Authenticate before parsing the multipart body.
2. Require an active student who owns the report.
3. Require the report to be open and to contain fewer than five photo
   references.
4. Require exactly one non-empty file no larger than 3 MiB.
5. Detect JPEG, PNG, or WebP from magic bytes; do not trust `File.type` or the
   filename extension.
6. If the same owner retries an existing `uploadKey`, return that image's
   existing safe result without creating another document or photo reference.
7. Otherwise, in one MongoDB transaction, create `ReportImage` and append its
   internal URL to the report. Abort both writes on failure.
8. Return `201` for a new image or `200` for an idempotent retry, with only
   `{ image: { url, contentType, byteLength } }`.

The browser uploads sequentially. Concurrent write conflicts, a stale report,
or a sixth image return a safe `409` response. Invalid data returns `400`,
authentication failure `401`, wrong role or ownership `403`, missing report
`404`, oversized content `413`, and unexpected failures `500`.

### `GET /api/report-images/{imageId}`

1. Authenticate before loading image bytes.
2. Validate the identifier and load the image's report.
3. Allow the report owner.
4. Allow an active administrator for moderation review.
5. Allow another authenticated member only when the report is visible and
   `showPhoto` is true.
6. Return `404` rather than revealing whether an inaccessible image exists.

Successful responses include the stored `Content-Type`, exact
`Content-Length`, `Content-Disposition: inline`,
`X-Content-Type-Options: nosniff`, and private cache headers. The endpoint does
not expose uploader identity, filenames, report identifiers, or database
metadata.

No `DELETE` endpoint is added in this feature.

## Submission data flow

1. The student selects files with a native multiple file input.
2. Client-side validation checks the count, declared type, and size for quick
   feedback.
3. Each selected file receives a stable `crypto.randomUUID()` upload key. The
   form creates object URLs for local previews and revokes them on removal or
   component disposal.
4. The existing report form is validated normally and creates the report with
   `photoUrls: []`.
5. The submission client uploads selected files sequentially to the new
   report-specific endpoint.
6. Each successful response is recorded in the client so retries send only
   failed files.
7. When all uploads succeed, the existing success state links to the report.
8. If an upload fails, the report remains created. The success surface clearly
   states that the report was saved, identifies how many photos remain, and
   offers `Retry photo uploads` and `View report` actions.

Sequential upload keeps request bodies small, preserves deterministic error
handling, and avoids creating unattached image records before a report exists.

## User interface

Replace the URL rows in `ReportForm` with:

- a labelled native file input with `multiple` and an explicit accept list;
- help text stating the three formats, 3 MiB per-image limit, five-image limit,
  and privacy warning;
- an ordered preview list using the existing `next/image` component with
  `unoptimized` and generated object URLs, so previews remain local while the
  repository's Core Web Vitals lint rules continue to pass;
- a clearly named remove button for every selected file;
- count, type, and size errors linked to the input;
- disabled selection and removal controls while submission is in progress.

The report detail page renders same-origin uploaded images as an accessible
gallery through `next/image` with `unoptimized`; this leaves the authenticated
same-origin endpoint as the direct source and adds no image service. Each image
uses generated alternative text such as
`Submitted item photo 1`; it does not expose the original filename. Existing
external HTTPS values remain explicit links and are not embedded, preventing
automatic requests to third-party hosts.

Report cards remain text-first and do not load images in this scope.

## Privacy and security

- Authentication and account-state checks occur before request-body parsing.
- Authorisation is repeated inside the upload transaction.
- The server checks byte signatures, size, count, ownership, report state, and
  privacy independently of client validation.
- Image bytes and uploader identifiers are excluded from normal model queries.
- The read endpoint uses indistinguishable not-found responses for inaccessible
  content.
- SVG and arbitrary MIME types are rejected to avoid active content.
- External HTTP, data, blob, file, and JavaScript URLs remain invalid in stored
  report contracts.
- Tests never read `.env.local` and never access a real Atlas database.

## Accessibility and responsive behaviour

- File selection, removal, retry, and report navigation work by keyboard.
- Preview images have useful generated alternative text.
- Validation, upload progress, partial success, and failure are announced
  through the existing status and alert patterns.
- Controls retain at least 44-by-44-pixel touch targets.
- The preview list remains usable at 320 CSS pixels and does not force
  horizontal scrolling.
- Reduced-motion users receive no upload animation dependency.

## Testing strategy

Add focused tests for:

- `ReportImage` model validation and hidden fields;
- magic-byte detection for JPEG, PNG, WebP, spoofed types, empty files, and
  oversized files;
- upload service transactions, ownership, open-state and five-image limits,
  idempotent retries, conflicts, and rollback;
- upload route authentication-before-parsing and safe error responses;
- image read privacy for owner, ordinary member, administrator, hidden report,
  and `showPhoto: false`;
- same-origin photo reference validation and legacy HTTPS compatibility;
- file selection, preview URL cleanup, removal, duplicate submission guards,
  sequential uploads, partial failure, and retry;
- uploaded gallery rendering without embedding legacy external images;
- search `hasPhoto`, public report redaction, matching, claims, and moderation
  regressions.

Before merge, run the focused suite followed by `npm test`, `npm run lint`,
`npm exec -- tsc --noEmit --incremental false`, `npm run build`, `npm audit`,
and `git diff --check`.

## Documentation and evidence

The verification record must include:

- a requirement-to-implementation summary;
- supported formats and limits;
- privacy and access-control results;
- screenshots or a short demonstration of selection, preview, successful
  upload, private-photo behaviour, and partial-failure recovery;
- the exact automated verification results;
- the explicit deferred-scope list.

The final report should describe this as an interface and privacy improvement,
not as another AI feature.

## Course-scope guard for future work

Every future feature must pass all four checks before design begins:

1. It maps to a required feature, assessment focus, deliverable, or clearly
   justified extension in the course brief.
2. It closes a demonstrable user workflow or assessment-evidence gap.
3. Its benefit exceeds the additional security, testing, deployment, and
   documentation cost.
4. A smaller implementation cannot satisfy the same assessed outcome.

If any check fails, defer the feature. High quality means correct, secure,
accessible, tested, documented, and demonstrable; it does not mean adding more
technology.

## Acceptance criteria

- [ ] Replace manual URL inputs with selection and previews for up to five
      JPEG, PNG, or WebP files of at most 3 MiB each.
- [ ] Persist each uploaded image in a separate MongoDB document without a new
      external storage service or package dependency.
- [ ] Store only safe same-origin image references on new reports while
      preserving existing HTTPS references.
- [ ] Enforce owner-only upload and privacy-aware authenticated reads.
- [ ] Render uploaded images in report detail without embedding legacy external
      URLs.
- [ ] Support partial upload failure and retry without losing the report.
- [ ] Preserve report search, matching, claim, moderation, and privacy
      behaviour.
- [ ] Pass all focused and repository-wide verification commands.
- [ ] Document verification evidence and all deferred scope.
