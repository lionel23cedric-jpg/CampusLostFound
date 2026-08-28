# Report Image Upload and Preview Verification

Verified on 29 August 2026 against branch `feature/report-image-upload-preview`.

## Outcome

The implementation closes the course-brief extension for actual image upload and
preview without adding an external media service, image AI, editing, deletion,
or new packages. Students can select, preview, remove, submit, retry, and view up
to five JPEG, PNG, or WebP images. The report is created first; image failures do
not discard it.

Automated verification is complete. The multi-account manual browser pass is
recorded as pending because no isolated local MongoDB dataset and test accounts
were supplied, and this feature's approved boundary forbids using Atlas data for
manual testing.

## Course-brief mapping

| Course expectation | Evidence in this change |
| --- | --- |
| Lost and found report creation | The existing report form remains the source of report data and now creates with `photoUrls: []` before uploading files. |
| Image upload and preview extension | Native multiple file selection, local object-URL previews, removal, sequential upload, partial retry, and protected detail display. |
| Responsive and accessible interface | Labelled native input, generated alternative text, 44-pixel controls, announced validation/progress/failure states, and grids bounded for 320 CSS pixels. |
| Security and privacy | Authentication before parsing, owner-only upload, repeated transactional authorisation, byte-signature validation, closed read failures, allow-listed responses, and no filenames or image bytes in report JSON. |
| Database design | A separate bounded `ReportImage` MongoDB document stores bytes and hidden metadata; `ItemReport.photoUrls` stores only ordered safe references. |
| Testing and software engineering | 336 focused tests, 2,532 full-suite tests, lint, TypeScript, production build, dependency audit, and scope/dependency checks pass. |

## Implemented endpoints and data flow

- `POST /api/reports/{reportId}/images` accepts one multipart `image` and one
  UUID `uploadKey`. A new upload returns `201`; an idempotent replay returns
  `200`. The JSON receipt contains only `url`, `contentType`, and `byteLength`.
- `GET /api/report-images/{imageId}` returns authenticated image bytes with the
  stored content type and length, inline disposition, `nosniff`, and private
  cache headers. Inaccessible or corrupt content returns the same closed `404`.

Submission sequence:

1. The browser validates count, declared MIME, non-empty size, and the 3 MiB
   limit, assigns a stable `crypto.randomUUID()` key, and creates a local preview.
2. The report is created through the existing JSON endpoint with no image bytes
   and `photoUrls: []`.
3. Files upload one at a time in selection order.
4. The server validates magic bytes, re-authorises the active owner inside a
   transaction, stores one separate image document, and appends one internal
   path to the report.
5. On failure, the report remains created and only the failed/unattempted suffix
   is retained for an idempotent retry with the original keys.
6. The detail page embeds only same-origin protected paths. Legacy HTTPS values
   remain explicit external links and are never loaded automatically.

## Controls and limits

- Maximum: 5 images per report.
- Maximum size: 3 MiB per image, checked in the browser and again from server
  bytes.
- Supported formats: JPEG, PNG, and WebP only.
- Server signatures: JPEG `FF D8 FF`; complete PNG signature; WebP `RIFF` plus
  `WEBP` at offset 8.
- Empty, oversized, unsupported, truncated, spoofed, or MIME/signature-mismatched
  content is rejected before persistence.
- SVG and arbitrary active content are not accepted.

## Access-control matrix

| Actor and report state | Upload | Read |
| --- | --- | --- |
| Active student who owns an open submitted report | Allowed, up to the limit | Allowed |
| Another active authenticated member; visible submitted report; `showPhoto: true` | Denied | Allowed |
| Another member; hidden report or `showPhoto: false` | Denied | Closed `404` |
| Active administrator | Denied by the owner-only upload flow | Allowed for moderation |
| Inactive, missing, stale-role, or unauthenticated account | Denied | Denied |
| Missing/corrupt image or missing report | Not applicable | Closed `404` |

## Idempotency and partial retry evidence

- `{ reportId, uploadKey }` is unique.
- Replaying identical canonical MIME, length, and bytes returns the original
  receipt without a second document or report reference.
- Reusing a key with different content returns `409`.
- Transaction and duplicate-race tests cover rollback, stale report conditions,
  the five-image limit, and session cleanup.
- Frontend workflow tests prove one-at-a-time ordering, live progress, stopping
  on failure, retrying only the pending suffix with original keys, and keeping
  report creation separate from upload retry.

## Automated command evidence

All commands were run from `web/` on 29 August 2026.

| Command | Result |
| --- | --- |
| Focused 14-file image suite | PASS — 14 files, 336 tests |
| `npm test` | PASS — 138 files, 2,532 tests |
| `npm run lint` | PASS — no findings |
| `npx tsc --noEmit --incremental false` | PASS — no diagnostics |
| `npm run build` | PASS — Next.js 16.2.12 production build; 33 static pages generated; image upload/read routes included |
| `npm audit` | PASS — 0 vulnerabilities |
| `git diff --check` | PASS — no whitespace errors |
| `git diff develop...HEAD -- web/package.json web/package-lock.json` | PASS — no dependency changes |

The first sandboxed build attempt could not write `.next/trace` and returned
Windows `EPERM`; rerunning the same build with workspace-write permission passed.
The first sandboxed audit could not reach the registry or write the npm cache;
rerunning with network/cache permission returned `found 0 vulnerabilities`.
These were environment restrictions, not suppressed product failures.

## Scope review

`git diff --stat develop...HEAD` reports 41 relevant files: approved design and
plan documents, the bounded image model and contracts, validation/error/service
layers, two API routes, browser/form/submission/detail components, and their
regression tests. Package manifests are unchanged.

Explicitly excluded:

- external object storage or CDN integration;
- image recognition, categorisation, transformation, compression, or other AI;
- image edit, reorder, or delete APIs;
- background workers, queue libraries, persisted browser drafts, or parallel
  upload orchestration;
- report-card thumbnails and unrelated interface redesigns.

These exclusions keep the feature within the course's report, privacy,
responsive-interface, database, and testing outcomes while avoiding
infrastructure that does not improve the assessed workflow.

## Manual browser acceptance record

Status: **pending isolated local test data**.

The following approved scenarios still require an isolated local MongoDB
instance with two active member accounts and one active administrator. No Atlas
or production data was accessed, and no screenshots are claimed.

- [ ] At 320 CSS pixels, select JPEG, PNG, and WebP files; inspect previews,
  removal, keyboard operation, touch targets, and horizontal overflow.
- [ ] Reject a sixth, empty, oversized, unsupported, and spoofed file safely.
- [ ] Submit and observe sequential progress and successful detail display.
- [ ] Force one failed upload; verify the report remains created, retry it, and
  verify no duplicate image.
- [ ] Verify member visibility for `showPhoto: true`, and closed `404` behaviour
  for private-photo and hidden reports.
- [ ] Verify owner and administrator reads.
- [ ] Verify a legacy HTTPS photo remains an external link.
- [ ] Inspect browser/network output for filenames, upload keys, private
  verification values, and image bytes in report JSON.

Automated route, service, component, privacy, and responsive-contract tests cover
all of these rules; this checklist remains open solely for human visual and
end-to-end confirmation.

## Known limitation

Image bytes are stored in separate MongoDB documents. This is a deliberate,
documented course-scale design that keeps the project self-contained. It is not
a claim of production-scale media infrastructure; a larger deployment would
normally move binary media to dedicated object storage after a separate design
and operational review.
