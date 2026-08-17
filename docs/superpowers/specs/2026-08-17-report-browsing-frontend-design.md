# Report Browsing and Search Frontend Design

## Goal

Add an accessible, responsive member interface that lets authenticated Campus Noticeboard users search, filter, page through and inspect privacy-safe lost and found reports through the existing browsing APIs.

## Scope

This change adds:

- A protected `/reports` search and result-list page.
- A protected `/reports/[id]` privacy-safe detail page.
- URL-backed search, filter and pagination state.
- Strict browser-side runtime validation for the existing browsing responses.
- Loading, empty, unavailable, authentication, permission, retry and not-found states.
- Working navigation from the dashboard and authenticated site header.
- Automated browser-client, component, navigation, accessibility and responsive-contract tests.

This is a complete frontend deliverable for the browsing backend introduced by Issue #18. It does not change database models, API response contracts or Atlas configuration.

## Chosen approach

The interface will use an URL-driven client search workspace. On wider screens, a labelled filter form occupies a stable left rail and report results occupy the main column. On narrow screens, the same form appears before the results in normal document order. A separate detail route presents one report without turning the list into a stateful master-detail application.

The implementation will extend the existing report browser client, use the current authentication provider and application shell, and reuse native form controls, Next.js links, React state, Zod and CSS Modules. It adds no dependency.

The selected visual structure was compared with a search-first discovery grid. The filter-rail workspace was chosen because it keeps every advanced filter visible, supports repeated precise searching and degrades to a straightforward mobile form without chip overflow or hidden controls.

Rejected alternatives:

- Local-only component state would lose searches across refresh, browser navigation and copied links.
- A dense discovery grid would make advanced filters less discoverable and would compress variable report content.
- A combined list-and-detail client would complicate history, deep links, focus restoration and error ownership.
- A new global state library or form dependency would add machinery without solving a current requirement.
- Moving the existing authenticated architecture to Server Components would broaden the feature across session and request boundaries without a demonstrated benefit.

## Route and access boundary

Both pages are protected member surfaces inside the existing application shell.

- While session state is loading, the page shows one polite loading status.
- An unauthenticated visitor is redirected to `/login`.
- An authenticated active student, staff member or administrator may browse the same privacy-filtered member representation.
- An unavailable session check shows a safe retry state.
- If a report or reference request later returns authentication-required, the client redirects to `/login` rather than entering a permanent retry loop.
- Permission-unavailable responses replace the browsing surface with an explanatory alert.

Client protection improves the experience but never replaces the server's session, account-status and privacy enforcement.

## Browser API boundary

`src/lib/reports/browser-client.ts` will gain focused functions for:

- Listing member-visible reports from `GET /api/reports`.
- Loading one member-visible report from `GET /api/reports/[id]`.

The existing category and campus-location loaders remain the reference-data source. All calls stay same-origin so browser code never reads the HttpOnly session token.

Strict Zod schemas validate successful list, pagination and detail responses at runtime. The schemas mirror the existing member-safe backend contract and reject unknown response fields. Malformed JSON, malformed successful payloads, network failures and unexpected server errors become stable browser-safe errors. Raw response text, database failures, stack traces and credentials are never rendered.

The report browser client constructs list URLs from an explicit allowlist of supported values. It does not forward arbitrary URL parameters to the API. Detail IDs are encoded before entering the request path.

## Search URL contract

`/reports` uses the backend query names directly:

- `q`
- `reportType`
- `categoryId`
- `campusLocationId`
- `status`
- `color`
- `occurredFrom`
- `occurredTo`
- `hasPhoto`
- `page`

`pageSize` remains fixed at the backend default of 12 for this first interface and is not exposed as a user control.

The browser parses the current URL into a browser-safe search form. Invalid, duplicate or unsupported values are not copied into API calls. The interface falls back to valid defaults and may announce that unsupported filters were ignored rather than failing to render.

Submitting the search form writes only non-default values to the URL and resets `page` to 1. Clear returns to `/reports`. Pagination preserves the active filters and changes only `page`. Because the URL is authoritative, reload, Back, Forward and copied links reproduce the same search.

## Search workspace

The page begins with a concise heading and supporting sentence explaining that results contain privacy-safe campus reports.

The search form exposes:

- Keyword.
- Lost or found report type.
- Status.
- Category.
- Campus location.
- Colour.
- Occurred-from and occurred-to dates.
- Photo availability.

Native inputs and selects use visible labels. The filter form has a semantic search landmark. Search is the primary submit action and Clear is a normal link or button with an explicit accessible name.

On desktop, filters occupy the left column while result count, result list and pagination occupy the right column. On mobile, filters precede the results in the DOM and visual order. No modal, drawer or custom disclosure is required for the first version.

Reference data and reports load in parallel after session access is confirmed. If a historical report refers to a category or campus location that is not present in the active reference response, the interface uses `Category unavailable` or `Campus location unavailable` instead of failing the page.

## Result list and report cards

The result header shows the total report count and current page context. Every result is one semantic link to `/reports/[id]`; nested fake buttons are not used.

Each report card may show only fields in the member-visible response:

- Lost or found type.
- Status.
- Title.
- Short public-description excerpt.
- Category name or safe unavailable fallback.
- Campus location name, `Location hidden`, or safe unavailable fallback.
- Event date or `Date hidden`.
- Visible colours and tags where useful.
- A visible photo only when `photoUrls` contains a member-visible URL.
- `Your report` when `isOwner` is true.

Type and status use text as well as colour. Missing visible photos do not create broken placeholders. Cards do not render reporter identifiers, privacy settings or any private ownership evidence.

## Pagination

Pagination shows Previous and Next controls plus an explicit `Page X of Y` status. Controls are disabled or omitted when no corresponding page exists. The implementation may show a compact current-page marker, but it will not generate an unbounded row of page-number links.

When a filter submission or page change completes, focus stays predictable and the result heading becomes the announced update target. Pagination navigation updates the URL and replaces the result data without losing the filter form values.

An out-of-range page returned by the backend is treated as an empty page with authoritative totals. If totals show an earlier valid final page, the client replaces the URL with that page once instead of leaving the user stranded in a false no-results state.

## Detail page

`/reports/[id]` loads one privacy-safe member representation and presents:

- Lost or found type and current status.
- Title and full public description.
- Category and member-visible campus location.
- Member-visible event date.
- Visible colours, tags and photos.
- Created and updated dates, plus resolved date when applicable.
- `Your report` when the authenticated viewer owns the report.

The page includes a clear `Back to reports` link. Native browser Back continues to restore the prior URL-backed search automatically. The first version does not add edit, claim, message or management actions that do not yet exist.

An invalid or absent report produces the same clear not-found state. The UI does not speculate whether a hidden draft or private record exists.

## Privacy presentation

The frontend treats the backend member response as the maximum permitted dataset, not as a source from which to hide fields after rendering.

- `campusLocationId: null` displays `Location hidden`.
- `occurredAt: null` displays `Date hidden`.
- An empty `photoUrls` array renders no private-image placeholder or count.
- `reporterId`, raw `privacySettings`, serial numbers, private exact locations, distinguishing features, verification questions, expected answers, private notes, password fields and session values are absent from client response schemas and render paths.

No component queries `PrivateVerificationDetails`, imports server database modules or connects directly to Atlas.

## Loading, empty and error states

The list page handles these states explicitly:

- Session loading.
- Initial reports and reference-data loading.
- Successful results.
- No reports matching the active filters, with a Clear filters action.
- A genuine empty report collection, with a link to report an item.
- Reference-data failure with Retry.
- Report-list failure with Retry.
- Authentication expiry and redirect.
- Permission or account unavailability.

The detail page handles loading, success, 404, retryable failure, authentication expiry and permission unavailability.

Request IDs or an abort mechanism ensure an older list, detail or reference response cannot overwrite a newer request or a changed account. Account-scoped state is reset when the authenticated user changes. Retry retains the URL search state.

Loading messages use polite status semantics. Blocking errors and permission failures use one alert each. Empty states are ordinary content, not alerts.

## Navigation integration

The dashboard's `Search possible matches` workflow card becomes available and links to `/reports`.

The authenticated site header adds a concise `Browse` destination. The existing `Report item`, `Dashboard` and account action remain available. At narrow widths, labels and spacing may become more compact, but every destination keeps a visible or screen-reader-accessible name and at least a 44-by-44 CSS-pixel target. The header must remain free of horizontal overflow at 320 CSS pixels.

Unauthenticated, loading and unavailable header states do not expose a false protected Browse destination.

## Accessibility and responsive behaviour

The feature targets WCAG 2.2 AA and follows the existing application semantics.

- One page heading and logical section headings.
- A labelled search landmark and correctly associated form controls.
- Keyboard-operable links, inputs, selects, buttons and pagination.
- Visible focus and no colour-only state communication.
- At least 44-pixel interactive targets.
- Sufficient text and control contrast on every used background.
- Restrained live regions without duplicate announcements.
- Meaningful image alt text derived only from safe report content, or empty alt text when an image is decorative to an already labelled card.
- A normal reading and keyboard order at all breakpoints.
- No horizontal overflow at 320 CSS pixels.
- Reduced-motion support for any non-essential transition.

Required visual verification covers at least 320, 375, 768 and 1440 CSS pixels, keyboard-only search and detail navigation, Back/Forward URL restoration and a clean browser console.

## Automated testing

Vitest and Testing Library coverage will include:

- Strict parsing of member-report list, pagination, detail and public-error responses.
- URL construction from every supported filter and exclusion of unknown parameters.
- Safe encoding of detail IDs.
- Network, non-JSON, malformed success, 401, 403, 404 and 500 handling.
- URL-to-form defaults, accepted values and invalid-value recovery.
- Search submission, filter clearing, page reset and filter-preserving pagination.
- Stale request rejection during rapid query changes and account changes.
- Parallel report/reference loading and independent retry states.
- Successful results, true empty collection, filtered empty results and out-of-range page recovery.
- Privacy-hidden location, date and photo presentation.
- Inactive or missing category and campus-location fallbacks.
- Owner indication without reporter-identifier exposure.
- Detail success, not found, retry, authentication expiry and permission states.
- Dashboard and authenticated-header navigation integration.
- Semantic headings, search landmark, accessible labels, status/alert announcements and keyboard links.
- CSS contracts for 44-pixel targets, 320-pixel navigation and mobile stacking.

Automated requests and session state are mocked. Tests do not read `.env.local`, connect to Atlas, call production services or create real records.

Final verification runs:

- `npm test`.
- `npm run lint`.
- `npx tsc --noEmit --incremental false`.
- `npm run build`.
- `npm audit`.
- `git diff --check` and branch-scope review.
- An ignored-file check confirming `.env.local` remains ignored without reading it.
- A production-code scan confirming private report and authentication field names do not enter the browsing surfaces.
- One bounded desktop/mobile browser review and one Impeccable detector pass over changed UI files.

## Out of scope

- Database models, indexes, migrations, Atlas Search or live Atlas writes.
- Backend browsing or submission contract changes.
- Report creation changes, editing, deletion, draft management or status transitions.
- Claims, ownership review, messaging, handover, recovery completion or notifications.
- Staff or administrator report-management interfaces.
- AI matching, smart search, duplicate detection, image categorisation or description generation.
- Image upload, media storage or image processing.
- New dependencies, analytics, deployment or CI changes.
