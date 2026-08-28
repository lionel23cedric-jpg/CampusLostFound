# Report Image Upload and Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an active student select, preview, persist, retry, and safely display up to five report images without manually entering image URLs.

**Architecture:** Keep ItemReport.photoUrls as the ordered public-reference field so existing report, search, and privacy flows remain intact. Store uploaded bytes in a focused ReportImage MongoDB collection and write same-origin /api/report-images/{imageId} references back to the report. Thin Next.js routes authenticate first; a small reports/image domain validates file signatures, owns idempotent persistence, and enforces read privacy. The browser creates the report first, then uploads selected images sequentially so a partial failure can be retried without duplicating successful files.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Mongoose 9, MongoDB transactions, Zod 4, Vitest 4, Testing Library, next/image, and native File, FormData, Blob, fetch, and crypto APIs.

## Global Constraints

- The approved design is docs/superpowers/specs/2026-08-28-report-image-upload-preview-design.md.
- This is a course-scoped extension explicitly listed in the project brief: image upload and preview.
- Accept at most five files per report and at most 3 MiB per file.
- Accept only JPEG, PNG, and WebP after both declared MIME validation and server-side magic-byte validation.
- Store bytes in the existing MongoDB database through one separate ReportImage collection. Do not add cloud storage, GridFS, a second database, or a package dependency.
- Keep legacy HTTPS photo links readable. New reports created through the form submit photoUrls: [] and receive same-origin image references only after successful uploads.
- The upload endpoint is POST /api/reports/{reportId}/images with multipart fields image and uploadKey only.
- The read endpoint is GET /api/report-images/{imageId}.
- uploadKey is a browser-generated UUID and is unique per report, making upload retry idempotent.
- The browser uploads sequentially. Successful files remain attached if a later upload fails; retry sends only pending files with their original uploadKey values.
- An active report owner and an active administrator may read an uploaded image. Another active member may read it only when the report is visible, submitted, and privacySettings.showPhoto is true.
- Unauthenticated, suspended, deactivated, hidden-report, private-photo, malformed-ID, and unknown-image reads return closed, non-identifying responses.
- Never expose image bytes through report JSON, log image content, store the original filename, or accept client-supplied ownership/role metadata.
- Image responses set X-Content-Type-Options: nosniff and a private cache policy.
- Use next/image with unoptimized for browser blob previews and authenticated same-origin images. Keep legacy HTTPS references as explicit external links.
- Preserve photo order in report.photoUrls and preserve original numbering when internal images and legacy links are rendered together.
- No delete/edit image endpoint, thumbnail pipeline, compression, EXIF processing, image AI, automatic categorisation, drag-and-drop framework, direct-to-cloud upload, or database migration is in scope.
- Tests mock model/session/fetch boundaries and never connect to Atlas or read .env.local.
- Every task follows red-green-refactor: add the narrow failing test, confirm the expected failure, add the minimum implementation, rerun the focused test, then commit.

---

## File Structure

### New files

- web/src/models/report-image.ts — image byte schema, hidden uploader/upload key/data fields, indexes, and model.
- web/src/models/report-image.test.ts — schema, size, MIME, hidden-field, and index tests.
- web/src/lib/reports/photo-reference.ts — shared internal-reference and legacy-HTTPS contract.
- web/src/lib/reports/photo-reference.test.ts — exact accepted/rejected reference tests.
- web/src/lib/reports/image-validation.ts — size, MIME, signature, and multipart field validation.
- web/src/lib/reports/image-validation.test.ts — JPEG/PNG/WebP and adversarial validation tests.
- web/src/lib/reports/image-errors.ts — closed image error domain and response mapping.
- web/src/lib/reports/image-errors.test.ts — stable status/code/redaction tests.
- web/src/lib/reports/image-upload-service.ts — owner-only idempotent transactional image persistence.
- web/src/lib/reports/image-upload-service.test.ts — eligibility, order, idempotency, conflict, rollback, and cleanup tests.
- web/src/lib/reports/image-read-service.ts — privacy-aware image lookup and byte receipt.
- web/src/lib/reports/image-read-service.test.ts — owner/admin/member/hidden/private access matrix.
- web/src/app/api/reports/[id]/images/route.ts — authenticated multipart upload endpoint.
- web/src/app/api/reports/[id]/images/report-image-upload-route.test.ts — route order, shape, success, and safe-error tests.
- web/src/app/api/report-images/[imageId]/route.ts — authenticated protected image endpoint.
- web/src/app/api/report-images/[imageId]/report-image-read-route.test.ts — access, headers, bytes, and closed-error tests.
- web/src/components/reports/report-image-picker.tsx — accessible file selection and local preview UI.
- web/src/components/reports/report-image-picker.test.tsx — selection, validation, removal, preview, and cleanup tests.
- docs/superpowers/verification/2026-08-28-report-image-upload-preview.md — final course-requirement, security, UX, and command evidence.

### Modified files

- web/src/models/item-report.ts and item-report.test.ts — allow canonical same-origin image references while retaining legacy HTTPS compatibility.
- web/src/lib/reports/validation.ts and validation.test.ts — accept canonical same-origin references and legacy HTTPS only at the API contract.
- web/src/lib/reports/public-report.ts and public-report.test.ts — retain privacy redaction while accepting both safe reference kinds.
- web/src/lib/reports/form-validation.ts and form-validation.test.ts — remove manual photo URL rows and always produce photoUrls: [] for a new form submission.
- web/src/lib/reports/browser-client.ts and browser-client.test.ts — validate safe photo references and add a strict multipart upload client.
- web/src/components/reports/report-form.tsx, report-form.test.tsx, and report-form.module.css — integrate file selection and pass selected files after report creation.
- web/src/components/reports/report-submission-client.tsx and report-submission-client.test.tsx — own sequential upload, partial failure, and retry state.
- web/src/components/reports/report-success.tsx and report-submission.module.css — report image upload progress and retry without recreating the report.
- web/src/components/reports/report-detail-client.tsx, report-detail-client.test.tsx, and report-browsing.module.css — display protected uploaded images and preserve legacy external links.
- Existing strict MemberReport fixtures that contain photoUrls only need updating if a focused type/test failure proves it.

No other production file belongs in this feature unless a focused failing test demonstrates a direct consumer of the changed photo-reference contract.

---

### Task 1: Define one safe report-photo reference contract

**Files:**
- Create: web/src/lib/reports/photo-reference.ts
- Create: web/src/lib/reports/photo-reference.test.ts
- Modify: web/src/models/item-report.ts
- Modify: web/src/models/item-report.test.ts
- Modify: web/src/lib/reports/validation.ts
- Modify: web/src/lib/reports/validation.test.ts
- Modify: web/src/lib/reports/public-report.ts
- Modify: web/src/lib/reports/public-report.test.ts
- Modify: web/src/lib/reports/browser-client.ts
- Modify: web/src/lib/reports/browser-client.test.ts

**Public contract:**

~~~ts
export const REPORT_IMAGE_LIMIT = 5;
export const REPORT_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const REPORT_IMAGE_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export function internalReportImagePath(imageId: string): string;
export function isInternalReportImagePath(value: string): boolean;
export function isLegacyHttpsPhotoUrl(value: string): boolean;
export function isReportPhotoReference(value: string): boolean;
export const reportPhotoReferenceSchema: z.ZodType<string>;
~~~

- [ ] **Step 1: Write the failing photo-reference tests**

Cover these exact cases:

- /api/report-images/64f0123456789abcdef01234 is accepted.
- A non-ObjectId internal path, query string, fragment, trailing slash, encoded slash, or other same-origin path is rejected.
- https://example.test/photo.jpg is accepted for legacy compatibility.
- http, data, blob, javascript, protocol-relative, credential-bearing, and whitespace-wrapped values are rejected at API/browser boundaries.
- internalReportImagePath rejects a malformed ID instead of returning a string.
- ItemReport accepts a canonical internal path and a legacy HTTPS URL, and rejects HTTP.
- createReportSchema and MemberReport accept only an internal path or legacy HTTPS URL.
- toMemberReport still returns [] when showPhoto is false and never weakens moderation privacy.

- [ ] **Step 2: Run the focused tests and confirm the missing module/contract**

From web/:

~~~powershell
npm.cmd test -- src/lib/reports/photo-reference.test.ts src/models/item-report.test.ts src/lib/reports/validation.test.ts src/lib/reports/public-report.test.ts src/lib/reports/browser-client.test.ts
~~~

Expected: FAIL because photo-reference.ts and the shared validators do not exist.

- [ ] **Step 3: Implement the minimal shared contract**

Use a single anchored internal-path expression:

~~~ts
const INTERNAL_REPORT_IMAGE_PATH =
  /^\/api\/report-images\/([a-f\d]{24})$/i;
~~~

Use URL only for absolute legacy URLs and require protocol === "https:", empty username, and empty password. Build all new internal references exclusively through internalReportImagePath.

Update:

- the ItemReport photoUrls match validator to accept only the canonical internal path or a legacy HTTPS URL;
- createReportSchema to use reportPhotoReferenceSchema;
- the member browser schema to use reportPhotoReferenceSchema;
- public-report mapping tests so privacy redaction remains unchanged.

- [ ] **Step 4: Rerun focused tests**

~~~powershell
npm.cmd test -- src/lib/reports/photo-reference.test.ts src/models/item-report.test.ts src/lib/reports/validation.test.ts src/lib/reports/public-report.test.ts src/lib/reports/browser-client.test.ts
~~~

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add web/src/lib/reports/photo-reference.ts web/src/lib/reports/photo-reference.test.ts web/src/models/item-report.ts web/src/models/item-report.test.ts web/src/lib/reports/validation.ts web/src/lib/reports/validation.test.ts web/src/lib/reports/public-report.ts web/src/lib/reports/public-report.test.ts web/src/lib/reports/browser-client.ts web/src/lib/reports/browser-client.test.ts
git commit -m "feat(report-images): define safe photo references"
~~~

---

### Task 2: Add the bounded ReportImage model

**Files:**
- Create: web/src/models/report-image.ts
- Create: web/src/models/report-image.test.ts

**Public contract:**

~~~ts
export const REPORT_IMAGE_UPLOAD_KEY_INDEX =
  "report_image_report_upload_key_unique";
export const reportImageSchema: mongoose.Schema;
export type ReportImage = InferSchemaType<typeof reportImageSchema>;
export const ReportImageModel: Model<ReportImage>;
~~~

- [ ] **Step 1: Write failing model tests**

Use an in-memory Mongoose document only. Prove:

- reportId, uploadedByUserId, uploadKey, contentType, byteLength, and data are required;
- reportId, uploadedByUserId, and uploadKey are immutable;
- contentType accepts exactly JPEG, PNG, and WebP;
- byteLength accepts 1 through REPORT_IMAGE_MAX_BYTES;
- data is a Buffer and cannot exceed REPORT_IMAGE_MAX_BYTES;
- uploadedByUserId, uploadKey, and data are select: false;
- createdAt exists and updatedAt is disabled;
- the named unique compound index is { reportId: 1, uploadKey: 1 };
- a report-order lookup index is { reportId: 1, createdAt: 1, _id: 1 }.

- [ ] **Step 2: Run the model test**

~~~powershell
npm.cmd test -- src/models/report-image.test.ts
~~~

Expected: FAIL because the model does not exist.

- [ ] **Step 3: Implement the schema without speculative fields**

Store only:

~~~ts
{
  reportId: ObjectId;
  uploadedByUserId: ObjectId;
  uploadKey: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  byteLength: number;
  data: Buffer;
  createdAt: Date;
}
~~~

Do not store original filename, dimensions, checksum, caption, EXIF, thumbnails, or mutable status. Mark reportId, uploadedByUserId, and uploadKey immutable. Set collection: "reportImages" and timestamps: { createdAt: true, updatedAt: false }.

- [ ] **Step 4: Rerun the model test**

~~~powershell
npm.cmd test -- src/models/report-image.test.ts
~~~

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add web/src/models/report-image.ts web/src/models/report-image.test.ts
git commit -m "feat(report-images): add bounded image model"
~~~

---

### Task 3: Validate multipart image bytes and close the error surface

**Files:**
- Create: web/src/lib/reports/image-validation.ts
- Create: web/src/lib/reports/image-validation.test.ts
- Create: web/src/lib/reports/image-errors.ts
- Create: web/src/lib/reports/image-errors.test.ts

**Public contract:**

~~~ts
export type ValidatedReportImage = {
  contentType: "image/jpeg" | "image/png" | "image/webp";
  byteLength: number;
  data: Buffer;
};

export async function readAndValidateReportImageFile(
  file: File,
): Promise<ValidatedReportImage>;

export class ReportImageError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fields?: Record<string, string[]>;
}

export function reportImageErrorResponse(error: unknown): Response;
~~~

- [ ] **Step 1: Write failing byte-validation tests**

Create minimal byte fixtures:

- JPEG starts FF D8 FF.
- PNG starts 89 50 4E 47 0D 0A 1A 0A.
- WebP starts RIFF, has any four length bytes, then WEBP.

Prove:

- a matching declared MIME and signature is accepted;
- an empty file, file over 3 MiB, unsupported declared MIME, spoofed MIME/signature pair, and truncated signature are rejected;
- the returned byteLength comes from validated bytes, not a client field;
- errors never echo filename, byte content, stack, or model details;
- known codes map exactly: IMAGE_REQUIRED 400, IMAGE_TYPE_UNSUPPORTED 400, IMAGE_TOO_LARGE 413, IMAGE_CONTENT_INVALID 400, IMAGE_LIMIT_REACHED 409, REPORT_IMAGE_CONFLICT 409, REPORT_IMAGE_FORBIDDEN 403, REPORT_NOT_FOUND 404, REPORT_IMAGE_NOT_FOUND 404, AUTHENTICATION_REQUIRED 401, ACCOUNT_UNAVAILABLE 403;
- an unknown error maps to IMAGE_REQUEST_FAILED 500 with a generic message.

- [ ] **Step 2: Run the focused tests**

~~~powershell
npm.cmd test -- src/lib/reports/image-validation.test.ts src/lib/reports/image-errors.test.ts
~~~

Expected: FAIL because the image validation and error modules do not exist.

- [ ] **Step 3: Implement exact signature checks and error mapping**

Read arrayBuffer once, reject before Buffer persistence, compare content type to the detected signature, and return the canonical MIME. Keep field errors limited to image or uploadKey. The error response shape must remain:

~~~ts
{
  error: {
    code: string;
    message: string;
    fields?: Record<string, string[]>;
  };
}
~~~

- [ ] **Step 4: Rerun focused tests**

~~~powershell
npm.cmd test -- src/lib/reports/image-validation.test.ts src/lib/reports/image-errors.test.ts
~~~

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add web/src/lib/reports/image-validation.ts web/src/lib/reports/image-validation.test.ts web/src/lib/reports/image-errors.ts web/src/lib/reports/image-errors.test.ts
git commit -m "feat(report-images): validate uploaded bytes"
~~~

---

### Task 4: Persist image uploads idempotently and attach them in order

**Files:**
- Create: web/src/lib/reports/image-upload-service.ts
- Create: web/src/lib/reports/image-upload-service.test.ts

**Public contract:**

~~~ts
export type UploadReportImageInput = {
  reportId: string;
  actorId: string;
  uploadKey: string;
  image: ValidatedReportImage;
};

export type ReportImageReceipt = {
  url: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  byteLength: number;
};

export type UploadReportImageResult = {
  image: ReportImageReceipt;
  created: boolean;
};

export async function uploadReportImage(
  input: UploadReportImageInput,
): Promise<UploadReportImageResult>;
~~~

- [ ] **Step 1: Write failing service tests with explicit model/session fakes**

Prove:

- malformed reportId, actorId, or non-UUID uploadKey is rejected before a transaction;
- a missing report returns REPORT_NOT_FOUND, while a report owned by another user returns REPORT_IMAGE_FORBIDDEN;
- the owned report must be submitted rather than draft and have status open;
- the actor must still be an active student when checked inside the transaction;
- an existing { reportId, uploadKey } returns the original receipt without creating a second image or appending a second path;
- reusing an existing uploadKey with different contentType, byteLength, or bytes returns REPORT_IMAGE_CONFLICT;
- a report with five references returns IMAGE_LIMIT_REACHED;
- a new image is inserted and its canonical internal path is appended exactly once, returning created: true;
- an idempotent replay returns the same safe receipt with created: false;
- a stale owner/report condition prevents the update and rolls the image insert back;
- a named duplicate-index race rereads the existing record and returns the same receipt only when its bytes match;
- unrelated MongoDB duplicate errors become a generic server error;
- transaction endSession runs on success and failure.

Use deterministic ObjectIds and a fixed UUID. Do not hash image bytes or add a checksum field; direct Buffer equality is enough for this maximum size.

- [ ] **Step 2: Run the service test**

~~~powershell
npm.cmd test -- src/lib/reports/image-upload-service.test.ts
~~~

Expected: FAIL because the upload service does not exist.

- [ ] **Step 3: Implement the smallest transactional flow**

Within one Mongoose transaction:

1. Re-authorise actorId as an active student.
2. Load ItemReport by reportId; distinguish missing (404), wrong owner (403), and stale/ineligible state (409) without selecting private verification data.
3. Load an existing ReportImage by reportId and uploadKey with +uploadKey and +data.
4. If it exists, compare canonical MIME, byteLength, and Buffer bytes; return or conflict.
5. Count the current report.photoUrls length and reject at five.
6. Insert one ReportImage with uploadedByUserId: actorId.
7. Append internalReportImagePath(image._id) using a conditional ItemReport update that repeats owner, open-status, and length checks.
8. Require modifiedCount === 1 or throw REPORT_NOT_FOUND / IMAGE_LIMIT_REACHED according to the reread.

Return only { image: { url, contentType, byteLength }, created } from the service. Never return uploadKey, uploadedByUserId, reportId, imageId, or data. The route uses created only to choose 201 versus 200 and omits it from JSON.

- [ ] **Step 4: Rerun the service test**

~~~powershell
npm.cmd test -- src/lib/reports/image-upload-service.test.ts
~~~

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add web/src/lib/reports/image-upload-service.ts web/src/lib/reports/image-upload-service.test.ts
git commit -m "feat(report-images): persist uploads idempotently"
~~~

---

### Task 5: Expose the protected multipart upload API and browser client

**Files:**
- Create: web/src/app/api/reports/[id]/images/route.ts
- Create: web/src/app/api/reports/[id]/images/report-image-upload-route.test.ts
- Modify: web/src/lib/reports/browser-client.ts
- Modify: web/src/lib/reports/browser-client.test.ts

**Browser contract:**

~~~ts
export type UploadedReportImage = {
  url: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  byteLength: number;
};

export async function uploadReportImage(
  reportId: string,
  file: File,
  uploadKey: string,
): Promise<UploadedReportImage>;
~~~

- [ ] **Step 1: Write failing route tests**

Prove:

- getCurrentUser runs before route ID, content-type, FormData, uploadKey, or image parsing;
- unauthenticated returns 401 and inactive/non-student returns 403;
- malformed report ID returns 404 after authentication;
- any content type other than multipart/form-data returns 415;
- FormData must have exactly one image File and one uploadKey string and no unknown field;
- uploadKey must be a UUID;
- image validation occurs before the upload service call;
- a newly persisted image returns 201 with { image: { url, contentType, byteLength } };
- an idempotent replay returns 200 with the same strict JSON shape;
- known errors use reportImageErrorResponse and unknown errors are closed.

Mock request.formData, getCurrentUser, readAndValidateReportImageFile, and the service; do not construct a database.

- [ ] **Step 2: Write failing browser-client tests**

Prove:

- the client calls the encoded same-origin report path with POST and credentials: "same-origin";
- FormData contains the original File and uploadKey only;
- the client does not manually set Content-Type;
- a strict receipt with a canonical internal url parses for either 200 or 201;
- extra success keys, a non-internal url, malformed JSON, network failure, and safe API errors fail closed.

- [ ] **Step 3: Run route and client tests**

~~~powershell
npm.cmd test -- src/app/api/reports/[id]/images/report-image-upload-route.test.ts src/lib/reports/browser-client.test.ts
~~~

Expected: FAIL because the route and browser upload function do not exist.

- [ ] **Step 4: Implement the thin authenticated route**

The route order is:

1. getCurrentUser.
2. active-student role/status check.
3. await params and validate id.
4. validate multipart content type.
5. parse FormData and reject missing, repeated, or unknown fields.
6. validate uploadKey.
7. validate the File bytes.
8. call the upload service with the authenticated user ID.
9. return the strict receipt with status 201 when created is true and 200 otherwise.

Never trust an actor, role, report owner, content type, byte length, or filename field from the browser.

- [ ] **Step 5: Implement the strict browser client**

Add a Zod strict receipt schema whose url is a canonical internal image path. Build FormData natively. Reuse the existing fetchSameOrigin and responseError boundaries.

- [ ] **Step 6: Rerun route and client tests**

~~~powershell
npm.cmd test -- src/app/api/reports/[id]/images/report-image-upload-route.test.ts src/lib/reports/browser-client.test.ts
~~~

Expected: PASS.

- [ ] **Step 7: Commit**

~~~powershell
git add web/src/app/api/reports/[id]/images/route.ts web/src/app/api/reports/[id]/images/report-image-upload-route.test.ts web/src/lib/reports/browser-client.ts web/src/lib/reports/browser-client.test.ts
git commit -m "feat(report-images): expose protected upload API"
~~~

---

### Task 6: Protect image reads with report privacy and moderation

**Files:**
- Create: web/src/lib/reports/image-read-service.ts
- Create: web/src/lib/reports/image-read-service.test.ts
- Create: web/src/app/api/report-images/[imageId]/route.ts
- Create: web/src/app/api/report-images/[imageId]/report-image-read-route.test.ts

**Public contract:**

~~~ts
export type ReadReportImageInput = {
  imageId: string;
  actorId: string;
  actorRole: "student" | "staff" | "administrator";
};

export type ReadReportImageReceipt = {
  contentType: "image/jpeg" | "image/png" | "image/webp";
  byteLength: number;
  data: Buffer;
};

export async function readReportImage(
  input: ReadReportImageInput,
): Promise<ReadReportImageReceipt>;
~~~

- [ ] **Step 1: Write failing read-service tests**

Build a table covering:

| Actor/report state | Result |
| --- | --- |
| Active owner, visible or hidden report | Allowed |
| Active administrator, visible or hidden report | Allowed |
| Active non-owner member, visible submitted report, showPhoto true | Allowed |
| Active non-owner member, showPhoto false | REPORT_IMAGE_NOT_FOUND |
| Active non-owner member, hidden report | REPORT_IMAGE_NOT_FOUND |
| Active non-owner member, draft report | REPORT_IMAGE_NOT_FOUND |
| Suspended/deactivated actor | ACCOUNT_UNAVAILABLE |
| Image missing or report missing | REPORT_IMAGE_NOT_FOUND |

Also prove the service selects only reportId, uploadedByUserId, contentType, byteLength, and data from ReportImage and only reporterId, status, moderationStatus, and privacySettings.showPhoto from ItemReport.

- [ ] **Step 2: Write failing route tests**

Prove authentication happens before imageId parsing; malformed and unknown IDs return the same 404; success returns exact bytes plus:

~~~text
Content-Type: image/jpeg | image/png | image/webp
Content-Length: validated byte length
Content-Disposition: inline
Cache-Control: private, max-age=300, no-transform
X-Content-Type-Options: nosniff
~~~

The route must return no JSON success wrapper and no filename parameter on Content-Disposition.

- [ ] **Step 3: Run focused tests**

~~~powershell
npm.cmd test -- src/lib/reports/image-read-service.test.ts src/app/api/report-images/[imageId]/report-image-read-route.test.ts
~~~

Expected: FAIL because the read service and route do not exist.

- [ ] **Step 4: Implement the minimal read boundary**

Require an active authenticated actor. Load ReportImage with an explicit +data +uploadedByUserId selection and load the parent report using an allow-list projection. Apply owner/admin/member rules exactly as the table states. Convert Buffer to a Uint8Array-backed Response body and set only the approved headers.

- [ ] **Step 5: Rerun focused tests**

~~~powershell
npm.cmd test -- src/lib/reports/image-read-service.test.ts src/app/api/report-images/[imageId]/report-image-read-route.test.ts
~~~

Expected: PASS.

- [ ] **Step 6: Commit**

~~~powershell
git add web/src/lib/reports/image-read-service.ts web/src/lib/reports/image-read-service.test.ts web/src/app/api/report-images/[imageId]/route.ts web/src/app/api/report-images/[imageId]/report-image-read-route.test.ts
git commit -m "feat(report-images): protect image reads"
~~~

---

### Task 7: Replace manual URL rows with accessible local file previews

**Files:**
- Modify: web/src/lib/reports/form-validation.ts
- Modify: web/src/lib/reports/form-validation.test.ts
- Create: web/src/components/reports/report-image-picker.tsx
- Create: web/src/components/reports/report-image-picker.test.tsx
- Modify: web/src/components/reports/report-form.tsx
- Modify: web/src/components/reports/report-form.test.tsx
- Modify: web/src/components/reports/report-form.module.css

**UI contract:**

~~~ts
export type PendingReportImage = {
  uploadKey: string;
  file: File;
};

export type ReportImagePickerProps = {
  images: PendingReportImage[];
  disabled: boolean;
  errors: string[];
  onChange: (images: PendingReportImage[]) => void;
};

export type CreatedSubmission = {
  report: CreatedReport;
  images: PendingReportImage[];
};
~~~

- [ ] **Step 1: Write failing form-validation tests**

Remove photoUrls rows from ReportFormValues and createInitialReportFormValues. Prove validateReportForm always produces photoUrls: [] and still rejects an unknown photoUrls form key through the strict form schema. Server-side createReportSchema remains capable of reading legacy safe references; only the current creation UI stops accepting manual URLs.

- [ ] **Step 2: Write failing picker component tests**

Mock URL.createObjectURL and URL.revokeObjectURL. Prove:

- the native input has type=file, accept=image/jpeg,image/png,image/webp, and multiple;
- selecting valid files creates stable PendingReportImage records with crypto.randomUUID keys;
- adding files preserves existing order and caps total selection at five;
- invalid MIME, empty file, and over-3-MiB file produce visible field errors and are not added;
- removing a selected file updates the list and revokes only its preview URL;
- all remaining preview URLs are revoked on unmount;
- each preview uses next/image with unoptimized, meaningful alt text such as Selected image 1 preview, and a labelled Remove image 1 button;
- no file path, uploadKey, or browser-generated blob URL is printed as user-facing text.

- [ ] **Step 3: Write failing ReportForm integration tests**

Prove:

- the old Photo URL labels, text inputs, Add another photo URL, and external-URL help text are absent;
- the new image picker appears;
- invalid local images block report creation and focus the accessible image error;
- a valid submission calls submitReport with photoUrls: [];
- after report creation, onSuccess receives { report, images } and no upload begins inside ReportForm;
- duplicate submit remains locked while report creation is pending.

- [ ] **Step 4: Run focused frontend tests**

~~~powershell
npm.cmd test -- src/lib/reports/form-validation.test.ts src/components/reports/report-image-picker.test.tsx src/components/reports/report-form.test.tsx
~~~

Expected: FAIL because the form still uses URL rows and the picker does not exist.

- [ ] **Step 5: Implement PendingReportImage selection and preview**

Keep selected files in ReportForm component state, separate from serialisable ReportFormValues. Use a single native file input and one small preview list. Validate client-side for immediate feedback, but retain all server validation as authoritative.

The picker keeps a ref map from uploadKey to object URL: create only missing previews, revoke only removed previews, and revoke all remaining URLs on unmount. It must not mutate the File objects or read image contents.

- [ ] **Step 6: Simplify ReportForm**

Remove:

- PHOTO_LIMIT, nextPhotoId, updatePhoto, addPhoto, removePhoto;
- photoUrls server-field focusing;
- manual URL rows and related copy.

Add selectedImages state, the picker, and the CreatedSubmission callback. Keep all existing report, privacy, evidence, focus, retry, and access behavior unchanged.

- [ ] **Step 7: Rerun focused frontend tests**

~~~powershell
npm.cmd test -- src/lib/reports/form-validation.test.ts src/components/reports/report-image-picker.test.tsx src/components/reports/report-form.test.tsx
~~~

Expected: PASS.

- [ ] **Step 8: Commit**

~~~powershell
git add web/src/lib/reports/form-validation.ts web/src/lib/reports/form-validation.test.ts web/src/components/reports/report-image-picker.tsx web/src/components/reports/report-image-picker.test.tsx web/src/components/reports/report-form.tsx web/src/components/reports/report-form.test.tsx web/src/components/reports/report-form.module.css
git commit -m "feat(report-images): add file selection previews"
~~~

---

### Task 8: Upload sequentially and retry only pending images

**Files:**
- Modify: web/src/components/reports/report-submission-client.tsx
- Modify: web/src/components/reports/report-submission-client.test.tsx
- Modify: web/src/components/reports/report-success.tsx
- Modify: web/src/components/reports/report-submission.module.css

**State contract:**

~~~ts
export type PhotoUploadSummary = {
  total: number;
  uploaded: number;
  pending: PendingReportImage[];
  status: "complete" | "uploading" | "partial";
};
~~~

- [ ] **Step 1: Write failing submission workflow tests**

Use three deterministic Files and upload keys. Prove:

- a report with no images moves directly to success without an upload request;
- after one submitReport success, images upload one at a time in selection order;
- the success screen announces Uploading image 2 of 3 while the second call is pending;
- after calls 1 and 2 succeed and call 3 fails, the report remains created and the UI says 2 of 3 images uploaded;
- Retry remaining images calls only image 3 with its original uploadKey;
- retry never calls submitReport again;
- authentication expiry during upload redirects to login without creating another report;
- an account/permission failure invokes the existing permission boundary;
- a generic upload failure keeps a retry action and a safe message;
- Submit another report is disabled while images are uploading and clears all upload state when used after completion/partial acknowledgement;
- state updates after unmount and stale retries are ignored.

- [ ] **Step 2: Run the submission tests**

~~~powershell
npm.cmd test -- src/components/reports/report-submission-client.test.tsx
~~~

Expected: FAIL because the parent currently stores only CreatedReport and has no upload state.

- [ ] **Step 3: Implement one small sequential upload helper**

Inside report-submission-client.tsx, keep one created submission state and one summary state. Use an ordinary for...of loop:

~~~ts
for (const pendingImage of pending) {
  await uploadReportImage(
    report.id,
    pendingImage.file,
    pendingImage.uploadKey,
  );
  // Remove only this successful item from pending and increment uploaded.
}
~~~

On failure, stop the loop and preserve the unattempted/failed suffix. The existing idempotent upload endpoint makes an uncertain retry safe. Do not use Promise.all, a queue library, background worker, reducer framework, or persisted browser draft.

- [ ] **Step 4: Extend ReportSuccess with clear accessible states**

Show:

- report identity/status summary as before;
- no image message when total is zero;
- uploading progress with role=status and aria-live=polite;
- complete count when all succeed;
- partial count, generic safe failure message, and Retry remaining images button;
- a link to the created report detail so the owner can see uploaded images.

Never describe the report creation itself as failed after it has succeeded.

- [ ] **Step 5: Rerun the submission tests**

~~~powershell
npm.cmd test -- src/components/reports/report-submission-client.test.tsx
~~~

Expected: PASS.

- [ ] **Step 6: Commit**

~~~powershell
git add web/src/components/reports/report-submission-client.tsx web/src/components/reports/report-submission-client.test.tsx web/src/components/reports/report-success.tsx web/src/components/reports/report-submission.module.css
git commit -m "feat(report-images): retry partial image uploads"
~~~

---

### Task 9: Render protected images and preserve legacy links

**Files:**
- Modify: web/src/components/reports/report-detail-client.tsx
- Modify: web/src/components/reports/report-detail-client.test.tsx
- Modify: web/src/components/reports/report-browsing.module.css

- [ ] **Step 1: Write failing report-detail tests**

Use a photoUrls array in this exact order:

1. /api/report-images/{idA}
2. https://example.test/legacy.jpg
3. /api/report-images/{idB}

Prove:

- internal references render as next/image with unoptimized and alt text Submitted photo 1 and Submitted photo 3;
- the legacy URL remains a View submitted photo 2 (external) link with target=_blank and rel=noreferrer;
- no internal reference is rendered as an external anchor;
- no legacy URL is passed to next/image;
- an empty/redacted photoUrls array renders no photo section;
- existing hidden/private/public report behavior remains unchanged;
- the gallery stays usable at 320 CSS pixels and has no horizontal scrolling caused by the images.

- [ ] **Step 2: Run the detail test**

~~~powershell
npm.cmd test -- src/components/reports/report-detail-client.test.tsx
~~~

Expected: FAIL because all current references render as external links.

- [ ] **Step 3: Split references without losing original positions**

Use entries that retain the original index:

~~~ts
const photoEntries = report.photoUrls.map((url, index) => ({ url, index }));
const uploadedPhotos = photoEntries.filter(({ url }) =>
  isInternalReportImagePath(url),
);
const legacyPhotoLinks = photoEntries.filter(({ url }) =>
  isLegacyHttpsPhotoUrl(url),
);
~~~

Render uploadedPhotos in a responsive list/grid with next/image, unoptimized, width/height values for stable layout, object-fit: cover, and max-width: 100%. Render legacyPhotoLinks below with the existing external-link safety copy. Number both using entry.index + 1.

- [ ] **Step 4: Rerun the detail test**

~~~powershell
npm.cmd test -- src/components/reports/report-detail-client.test.tsx
~~~

Expected: PASS.

- [ ] **Step 5: Commit**

~~~powershell
git add web/src/components/reports/report-detail-client.tsx web/src/components/reports/report-detail-client.test.tsx web/src/components/reports/report-browsing.module.css
git commit -m "feat(report-images): display protected report photos"
~~~

---

### Task 10: Run full verification and record course evidence

**Files:**
- Create: docs/superpowers/verification/2026-08-28-report-image-upload-preview.md
- Modify only if verification exposes a direct defect: files already listed in Tasks 1–9.

- [ ] **Step 1: Run all focused report-image tests together**

From web/:

~~~powershell
npm.cmd test -- src/lib/reports/photo-reference.test.ts src/models/report-image.test.ts src/lib/reports/image-validation.test.ts src/lib/reports/image-errors.test.ts src/lib/reports/image-upload-service.test.ts src/app/api/reports/[id]/images/report-image-upload-route.test.ts src/lib/reports/image-read-service.test.ts src/app/api/report-images/[imageId]/report-image-read-route.test.ts src/lib/reports/form-validation.test.ts src/lib/reports/browser-client.test.ts src/components/reports/report-image-picker.test.tsx src/components/reports/report-form.test.tsx src/components/reports/report-submission-client.test.tsx src/components/reports/report-detail-client.test.tsx
~~~

Expected: PASS.

- [ ] **Step 2: Run the entire project quality gate**

From web/, run each command separately and record exact output:

~~~powershell
npm.cmd test
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd run build
npm.cmd audit
~~~

Expected: all tests pass, lint passes, TypeScript passes, production build passes, and npm audit reports zero vulnerabilities. If npm audit cannot reach the registry, record that as an environmental limitation and rerun when network access is available; do not misreport it as a pass.

- [ ] **Step 3: Review diff and dependency/scope boundaries**

From the repository root:

~~~powershell
git diff --check
git status --short
git diff --stat develop...HEAD
git diff -- web/package.json web/package-lock.json
~~~

Expected:

- no whitespace errors;
- no unexplained files;
- no dependency changes;
- no image AI, cloud upload, image delete/edit, or unrelated feature work.

- [ ] **Step 4: Perform the manual browser acceptance pass**

Using local development data and two active member accounts plus one administrator:

1. At 320 CSS pixels, select valid JPEG, PNG, and WebP files and verify previews/removal.
2. Verify sixth, empty, oversized, unsupported, and spoofed files are rejected safely.
3. Submit a report and verify sequential progress, successful detail display, keyboard focus, touch targets, and no horizontal overflow.
4. Simulate one failed upload, verify the report remains created, retry, and verify no duplicate image.
5. Verify another member can see images only when showPhoto is true and the report is visible/submitted.
6. Verify a private-photo or hidden report image URL returns the closed not-found response to the other member.
7. Verify the owner and administrator can retrieve an uploaded image as allowed by the approved design.
8. Verify a legacy HTTPS reference remains an external link.
9. Verify browser/network views contain no original filenames, upload keys, private verification fields, or image bytes inside report JSON.

Do not use Atlas production data for this pass.

- [ ] **Step 5: Write the verification document**

Record:

- course-brief mapping: image upload and preview extension, report creation, responsive/accessibility, security/privacy, testing evidence;
- implemented endpoints and data flow;
- size/type/count controls and signature validation;
- access-control matrix;
- idempotent partial-retry evidence;
- automated command results with counts;
- manual scenarios and screenshots/notes where available;
- explicit exclusions and why they avoid unnecessary complexity;
- known limitation: MongoDB document storage is suitable for this course-scale application, not a claim of production-scale media infrastructure.

- [ ] **Step 6: Commit verification evidence**

~~~powershell
git add docs/superpowers/verification/2026-08-28-report-image-upload-preview.md
git commit -m "docs: verify report image upload and preview"
~~~

---

## Definition of Done

- A student can select, preview, remove, submit, partially retry, and view up to five actual images without entering a URL.
- JPEG, PNG, and WebP are enforced by declared MIME and server byte signature, with a 3 MiB per-image limit.
- New image references are same-origin, legacy HTTPS links remain safe, and report photo ordering is preserved.
- Image bytes are stored separately from ItemReport and never appear in report JSON.
- Uploads are owner-only and idempotent; reads enforce account, ownership/administrator, moderation, report status, and showPhoto rules.
- Authentication precedes request parsing in both routes; responses are allow-listed and closed.
- The UI is keyboard accessible, has announced loading/error/retry states, and remains responsive at 320 CSS pixels.
- No new package, external image service, image AI, edit/delete flow, or unrelated feature is introduced.
- Focused tests, full tests, lint, TypeScript, build, audit, diff check, and manual acceptance evidence are recorded truthfully.

## Implementation Order Rationale

The contract and model come first so every later layer shares one representation. Byte validation and persistence precede routes so handlers remain thin. Read privacy is completed before the frontend emits protected references. The UI then changes in three small slices: selection, upload/retry orchestration, and display. Full verification is last and cannot expand scope; it may only repair defects revealed by the approved requirements.
