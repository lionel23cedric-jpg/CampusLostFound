# Explainable Intelligent Matching Frontend Design

**Issue:** #27
**Status:** Approved for implementation planning
**Date:** 2026-08-25

## 1. Purpose

This feature makes the explainable matching backend visible and useful to a
report owner. An owner viewing their own open lost or found report can request
possible opposite-type matches, see each score and its public explanations,
and open a candidate's existing report detail page.

The interface remains deliberately user-triggered. It does not calculate
matches every time any member opens a report, and it does not imply that a high
score proves ownership. The page describes results as possible matches and
keeps the existing staff-controlled claim workflow authoritative.

## 2. Scope

### Included

- A matching panel on an owner-visible open report detail page.
- An explicit `Find possible matches` action.
- A strict browser client for `GET /api/reports/[id]/matches`.
- Score, factor explanation and public candidate summary rendering.
- Links to the existing candidate report detail route.
- Loading, ready, empty, unavailable, error and retry states.
- Stale-request and unmounted-component protection.
- Responsive and keyboard-accessible presentation.
- Browser-client, component and report-detail integration tests.

### Excluded

- Backend scoring, threshold, privacy or retrieval changes.
- An independent matching route or dashboard.
- Automatic matching requests on page load.
- Persisted Match data, feedback or notification state.
- Automatic claims or ownership decisions.
- Image recognition, external AI or new dependencies.
- Editing reports or changing report status.

## 3. Placement and Visibility

The panel appears after the existing report article only when the loaded report
has both:

- `isOwner === true`; and
- `status === "open"`.

It does not render for another user's report or an owner report in
`claim_pending`, `resolved` or `closed`. The backend remains authoritative, so
the component also handles a later 404 or 409 if the report changes between
detail loading and the matching request.

The panel is part of the current `/reports/[id]` experience. A separate page
would add navigation and duplicate report context without improving the task.
A dashboard widget would be less contextual and would require new dashboard
data flow, so both alternatives are outside this focused Issue.

## 4. Component Architecture

### Browser client

`web/src/lib/reports/browser-client.ts` gains:

- `MatchFactorKey`;
- `MatchFactor`;
- `ReportMatch`;
- `ReportMatches`;
- `getReportMatches(id: string): Promise<ReportMatches>`.

It reuses the existing same-origin fetch, error parser and
`BrowserReportError`. The request is encoded as
`/api/reports/${encodeURIComponent(id)}/matches` with `GET` and same-origin
credentials.

The response schema is strict at every level. It verifies:

- source and candidate IDs are non-empty strings;
- candidate reports use the existing member-visible report schema;
- score is an integer from 35 through 100;
- factor keys are from the six approved keys;
- factor maximums match their documented weights;
- factor points are positive integers no greater than their maximum;
- factor explanations are non-empty and at most 80 characters;
- factor keys are unique and their point sum equals the match score;
- there are at most five results with unique candidate IDs;
- no unknown or private field is accepted.

An invalid success payload becomes the existing generic `REQUEST_FAILED`
browser error rather than partially rendering untrusted data.

### Matching panel

`web/src/components/reports/report-matches-panel.tsx` is a focused client
component receiving only `reportId`. The parent already owns visibility and
session access, so the panel does not receive report data, scoring logic or
private identity.

Its state machine is:

```text
idle --activate--> loading --success with results--> ready
                         |--success empty----------> empty
                         |--404/409----------------> unavailable
                         |--network/500------------> error --retry--> loading
                         |--401--------------------> redirect to login
```

The request begins only when the user activates the button. A monotonically
increasing request ID and mounted flag prevent older or post-unmount promises
from replacing current UI. Retry starts a fresh request. A successful refresh
fully replaces the prior results.

### Report detail integration

`report-detail-client.tsx` imports the panel and renders it after the report
article under the exact owner/open condition. It does not merge matching state
into the already substantial detail component. Existing report, reference,
claim and session behaviours remain unchanged.

## 5. User Interface

### Idle

The section is labelled `Possible matches`. Introductory copy states that the
system compares public report information and that results are suggestions,
not proof of ownership. The primary action is `Find possible matches`.

### Loading

The action is disabled and reads `Finding possible matches`. A polite live
status announces the same state. Existing results are not shown during a fresh
request, avoiding stale score interpretation.

### Results

Matches use an ordered list because ranking is meaningful. Each card contains:

- a prominent `<score>/100` badge;
- candidate lost/found type and open status;
- title and public description;
- an unordered `Why this matched` list;
- each explanation followed by its awarded points, such as `Same category
  +25`;
- public colour and tag tokens when present;
- `View report details` linking to the encoded candidate ID.

The UI does not infer or add reasons. It displays only the validated server
factor contract.

### Empty

The panel says `No strong matches yet` and explains that new reports may be
added later. It offers `Check again` without treating the absence of matches as
an error.

### Unavailable

A 404 or 409 says `Matching is no longer available for this report`. It does
not reveal whether ownership or status caused the result and offers a link back
to all reports.

### Error

Network, malformed-response and generic server failures render an alert with
`We could not load possible matches` and a `Retry matches` button. Internal
messages are not displayed.

## 6. Visual and Responsive Design

`report-matches.module.css` extends the established campus noticeboard visual
language without changing global tokens:

- warm paper surface and green ink;
- clear bordered section separated from the report article;
- score badge with strong contrast and tabular numerals;
- compact explanation chips/list rows rather than decorative gauges;
- 44-pixel minimum buttons and links;
- single-column cards at all widths, with metadata wrapping safely;
- no horizontal scrolling at 320 CSS pixels;
- no animation required, so reduced-motion behaviour remains inherently safe.

No new font, icon library, image or colour token is introduced.

## 7. Accessibility

- The panel is a labelled `section` with a unique heading.
- Results are an ordered list and explanations are nested semantic lists.
- Loading and empty updates use `role="status"` with polite announcements.
- Failures use `role="alert"`.
- Native buttons preserve keyboard activation and disabled semantics.
- Links have explicit text rather than card-wide ambiguous click targets.
- Score meaning appears as text, never colour alone.
- Focus uses the existing global focus-visible outline.
- Tests scan for duplicate IDs and verify controls remain reachable at narrow
  widths through CSS source assertions.

## 8. Privacy and Security

The frontend receives and renders only the Issue #25 public response contract.
Strict parsing rejects additional fields, including reporter identity, privacy
settings, verification evidence, contact information and authentication data.

Candidate hidden dates and locations are already `null` in the public report
contract and are not rendered by this panel. Factor explanations are treated as
plain React text, not HTML. Links use internal encoded IDs. No report text is
sent outside the application.

The UI condition improves usability but is not authorization. The backend's
owner-scoped query remains the security boundary.

## 9. Error Behaviour

| Condition | UI behaviour |
|---|---|
| 401 or `AUTHENTICATION_REQUIRED` | Replace navigation with `/login` |
| 404 or `REPORT_NOT_FOUND` | Controlled unavailable state |
| 409 or `REPORT_NOT_MATCHABLE` | Same controlled unavailable state |
| Network failure | Generic retryable alert |
| Invalid success JSON | Generic retryable alert |
| Other 4xx/5xx | Generic retryable alert |

The component never displays `BrowserReportError.message` directly because an
unexpected backend message could reveal implementation details.

## 10. Testing Strategy

### Browser client

- exact encoded same-origin GET request;
- valid strict response parsing;
- all factor keys and maximums;
- invalid score, point sum, duplicate factor, duplicate candidate and more than
  five results rejected;
- extra/private fields rejected;
- safe server error, malformed JSON and network behaviour preserved.

### Matching panel

- idle state makes no request;
- activation, disabled loading and successful ordered rendering;
- score, reasons, points, public tokens and encoded links;
- empty state and check-again flow;
- generic error and retry;
- 404/409 controlled unavailable state;
- 401 login redirect;
- stale request, retry race, report-ID remount and unmount safety;
- semantic section, headings, ordered/nested lists, live status and alert roles;
- no forbidden private text or raw HTML rendering.

### Report detail integration

- owner/open renders the panel;
- non-owner and every non-open status omit it;
- existing claim action and report detail states remain unchanged;
- narrow-width CSS has no fixed content width or overflow requirement.

### Complete gate

Run:

```powershell
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
npm audit
```

Then run `git diff --check`, confirm `.env.local` remains ignored without
opening it, inspect branch scope and scan production matching UI for private
fields, external requests and unsafe HTML. Tests mock fetch and never connect
to Atlas.

## 11. Delivery Sequence

1. Strict matching browser-client contract and tests.
2. Matching panel state machine, result cards and tests.
3. Owner/open report-detail integration and responsive styling.
4. Full quality, accessibility, privacy and scope verification.

This sequence leaves every commit independently reviewable and keeps the
matching algorithm backend unchanged.
