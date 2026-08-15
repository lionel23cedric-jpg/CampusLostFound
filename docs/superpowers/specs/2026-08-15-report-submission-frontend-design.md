# Report Submission Frontend Design

## Goal

Add an accessible, responsive interface that lets an authenticated student submit a complete lost or found report through the existing report APIs while clearly separating public report details from private ownership-verification evidence.

## Scope

This change adds:

- A protected `/reports/new` page with a lost/found selector and one shared form.
- Authenticated browser clients for report reference data and submission.
- Strict runtime validation for successful and error responses.
- Client-side form validation aligned with the existing server contract.
- Grouped public, privacy and private-verification sections.
- Loading, retry, permission, validation, submission and success states.
- A working report-entry link from the authenticated application interface.
- Automated component, validation and browser-client tests.

This change does not add image storage, report browsing, editing, deletion, claims, notifications or matching.

## Chosen approach

The frontend will follow the existing authentication frontend architecture. A focused report browser client will own HTTP and runtime response validation. A focused form-validation module will transform browser-friendly strings into the existing `POST /api/reports` request. A client form component will own interaction state, while the page remains a small route entry.

The implementation will reuse `AuthSessionProvider`, normal React state, native form controls, CSS Modules and the existing API routes. It will not add a form library, a second validation dependency or Server Actions.

Rejected alternatives:

- A multi-page lost/found form would duplicate identical behaviour and tests.
- A step-by-step wizard would add navigation state and make error recovery harder without improving the current contract.
- A new form library would add dependency and validation-synchronisation cost.
- Server Actions would duplicate the tested Route Handler boundary.

## Route and access control

`/reports/new` is a client-protected page inside the existing application shell.

- While session state is loading, the page shows a polite loading state.
- An unauthenticated visitor is redirected to `/login`.
- An authenticated active student may load reference data and submit a report.
- An authenticated staff member or administrator sees an explanatory permission state and cannot load or submit the form.
- An unavailable session check shows a retry control rather than assuming that the user is signed out.

The server remains authoritative. The client-side role check improves the experience but does not replace the existing API authentication and authorisation checks.

## Browser API boundary

`src/lib/reports/browser-client.ts` will expose focused functions for:

- Loading active categories.
- Loading active campus locations.
- Creating a report.

The client will always use same-origin requests so the existing HttpOnly session cookie is included without browser code reading the token. Zod schemas will strictly validate successful responses and the existing public error envelope at runtime. Malformed, non-JSON or unexpected responses become a generic browser-safe error.

Known public errors preserve their HTTP status, code, message and optional field errors. Network failures use a stable generic message. No database error, stack trace, credential, session value or private verification content is exposed.

## Form structure

The shared form is divided into four labelled sections.

### Basic information

- Lost/found radio selection.
- Title.
- Public description.
- Active category selection.
- Active campus-location selection.
- Event date and time using native `datetime-local` input.

The event date is converted to an ISO string before submission and cannot be in the future.

### Appearance and photos

- Colours entered as a comma-separated value and normalised into 1-5 trimmed entries.
- Tags entered as a comma-separated value and normalised into at most 10 trimmed lowercase entries.
- Up to five independently labelled HTTPS photo URL fields with add and remove controls.

Photo storage and file upload remain separate work. The interface explains that only HTTPS image URLs are accepted and that private or temporary signed links should not be submitted.

### Privacy settings

Three native checkboxes control whether other members may see the photo, event date and campus location. All three initially match the backend defaults and are selected. Explanatory copy states that these settings affect member-facing visibility and do not prevent authorised staff from processing the report.

### Private ownership verification

This section is visually and semantically separated from public information and states that the evidence is not included in public report responses. It includes:

- 1-10 distinguishing-feature fields.
- Optional exact location details.
- Optional serial number.
- 1-5 question and expected-answer pairs.
- Optional private notes.

Required repeated groups start with one entry. Add and remove controls retain at least one required item, use descriptive accessible names and announce their relationship to the numbered field.

## Validation and interaction

Client-side validation will mirror the existing server constraints for every bounded field. Unknown server fields are not constructed by the client. Browser-friendly values are transformed only after validation:

- Trimmed comma-separated colours become an array and empty entries are removed.
- Trimmed comma-separated tags become a lowercase array and empty entries are removed.
- Blank optional photo rows are omitted.
- `datetime-local` becomes an ISO date-time string.
- Blank optional private strings become `null`.
- Privacy values remain booleans.

Validation runs on submission. A user edit clears that field's stale error. When validation fails, an error summary receives focus and links or programmatic focus move to the first invalid field. Field errors are connected with `aria-describedby`, invalid controls use `aria-invalid`, and status changes use restrained live regions.

The form prevents duplicate submission while a request is pending. Native controls and buttons remain keyboard operable. Dynamic rows keep stable identifiers so deleting one row does not associate an error with a different field.

## Reference-data states

Categories and campus locations load in parallel only after an active student session is confirmed.

- Loading shows a labelled skeleton or status panel.
- Failure shows one generic safe message and a Retry button.
- An empty category or location list is treated as unavailable rather than showing a form that cannot succeed.
- A retry replaces the stale state and reruns both requests.

Reference options display category names and campus name plus location name. Descriptions may be used as supporting text but are never required to identify an option.

## Submission and error handling

The form posts exactly the approved report-creation contract to `POST /api/reports`.

- HTTP 400 field errors populate the matching fields and the error summary.
- HTTP 401 stops submission and sends the user to `/login` because the session expired.
- HTTP 403 replaces the form with the permission state.
- HTTP 422 associates category or location errors with the affected selector and refreshes reference data.
- Network failures and HTTP 500 responses show one generic retryable form alert.

Unexpected errors never display raw response text or submitted private values. User strings are rendered through normal escaped React output only.

## Success state

After HTTP 201, the form is replaced by a confirmation card on the same route. It shows only owner-safe response fields needed for confirmation:

- Report type.
- Title.
- Open status.
- Report identifier.
- A short explanation that private verification evidence was stored separately and is not displayed.

The card provides links to the dashboard and to submit another report. Choosing to submit another report creates a fresh initial form; it does not retain previous private evidence.

## Application integration

The dashboard's existing `Report an item` placeholder becomes a real link to `/reports/new`. The authenticated header may expose the same concise entry where it fits the current responsive navigation without overcrowding it. No report list or false navigation destination is introduced.

## Accessibility and responsive behaviour

The design uses semantic `form`, `fieldset`, `legend`, `label`, headings and buttons. Colour is never the only error signal. Focus indicators remain visible, touch targets remain usable, and validation messages do not rely on placeholders.

At narrow widths, all sections, repeated fields and actions use a single column without horizontal overflow. Wider layouts may place short related fields side-by-side while preserving logical DOM and keyboard order. Verification question and answer pairs remain grouped at every width.

Required browser checks cover 320, 375, 768 and 1440 CSS pixels, keyboard-only submission recovery and a clean console.

## Automated testing

Vitest and Testing Library coverage will include:

- Strict parsing of category, campus-location, report and error responses.
- Generic handling of network, non-JSON and malformed successful responses.
- Every bounded form group and all browser-to-API transformations.
- Session loading, unauthenticated redirect, unavailable retry and non-student permission states.
- Parallel reference loading, retry and empty-reference states.
- Lost/found selection and all grouped inputs.
- Dynamic add/remove behaviour at minimum and maximum limits.
- Error summary focus, field association and stale-error clearing.
- Duplicate-submission prevention and exact submitted payload.
- Known 400, 401, 403 and 422 handling plus generic failures.
- Success content, reset behaviour and complete exclusion of private verification values from confirmation output.
- Dashboard and header integration where changed.

All automated tests mock `fetch` and session state. They do not read `.env.local`, connect to Atlas or create real records. Running the application normally continues to use the Atlas connection configured through `MONGODB_URI`. A live submission, if later required for integration evidence, will occur only after explicit user approval.

Final verification runs `npm test`, `npm run lint`, `npm run build`, `npm audit`, `git diff --check`, a branch-scope review and an ignored-file check for `.env.local` without reading its contents.

## Out of scope

- File upload, image hosting, image transformation or signed storage URLs.
- Report list, detail, search, filters, edit, delete, draft or status transitions.
- Claims, ownership review, messaging, handover or recovery completion.
- Notifications and explainable intelligent matching.
- Staff or administrator report-management interfaces.
- Category or campus-location administration and seed data.
- Live Atlas writes during automated verification.
