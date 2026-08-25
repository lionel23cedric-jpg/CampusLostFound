# Explainable Intelligent Item Matching Backend Design

**Issue:** #25
**Status:** Approved for implementation planning
**Date:** 2026-08-25

## 1. Purpose

This feature adds the project's required intelligent capability: a local, deterministic and explainable service that recommends likely opposite-type reports to the owner of an open lost or found report. It uses structured attributes and lightweight text similarity rather than an external AI API, so it requires no additional credentials, sends no report data to third parties and remains reproducible for testing and academic explanation.

The feature follows the repository's established backend patterns:

- Next.js App Router route handlers;
- revocable cookie sessions resolved by the existing authentication service;
- Mongoose queries against the existing `ItemReport` collection;
- explicit privacy-safe response contracts;
- Zod validation at the HTTP boundary;
- Vitest tests with mocked database operations rather than live Atlas data.

## 2. Scope

### Included

- `GET /api/reports/[id]/matches` for an authenticated report owner.
- Opposite-type, open-report candidate discovery.
- A pure deterministic scorer with a fixed 100-point scale.
- Explainable factor scores and human-readable positive reasons.
- A score threshold, stable ordering and a five-result maximum.
- Privacy-aware use of dates and campus locations.
- Unit, service, route, privacy, authorization and labelled-ranking tests.

### Excluded

- A matching page or dashboard component.
- Persisted `Match` records, match lifecycle state or feedback storage.
- Notifications, background jobs or scheduled recomputation.
- External AI, embedding or language-model APIs.
- Image recognition or image similarity.
- Automatic claim creation, ownership decisions or report status changes.
- Changes to existing report, claim or authentication response contracts.
- Live Atlas test data or reading `.env.local`.

## 3. Access and Eligibility

Every request requires an active authenticated account. The service loads the source report using both its ID and the current user's ID, so a report owned by another user is treated exactly like a missing report.

The source report must have status `open`. A source in `draft`, `claim_pending`, `resolved` or `closed` returns `REPORT_NOT_MATCHABLE`; matching never changes that status.

Candidates must:

- have the opposite `reportType` (`lost` versus `found`);
- have status `open`;
- not be the source report;
- not belong to the source owner.

The service evaluates at most the 500 newest eligible candidates, ordered by `createdAt` and `_id` descending before scoring. This deterministic operational bound prevents one request from loading an unbounded collection. The campus-scale dataset is expected to remain below the bound; a future large deployment may replace this step with indexed retrieval or offline candidate generation without changing the scoring contract.

## 4. Architecture and Data Flow

### Route handler

`web/src/app/api/reports/[id]/matches/route.ts` owns only the HTTP boundary:

1. authenticate before awaiting route parameters;
2. validate the report ID as a MongoDB ObjectId;
3. call the matching service;
4. return `{ sourceReportId, matches }`;
5. translate only approved domain errors and hide every unexpected failure.

### Matching service

`web/src/lib/reports/matching-service.ts` owns database access and orchestration:

1. connect to MongoDB;
2. load the current user's source report with an explicit projection;
3. enforce `open` source eligibility;
4. query bounded opposite-type open candidates with an explicit projection;
5. convert each candidate to the existing member-visible report contract;
6. score candidates using the pure scorer;
7. remove scores below 35;
8. apply stable ordering and return the first five.

### Pure scorer

`web/src/lib/reports/matching-score.ts` contains no database, clock, network or authentication dependency. It accepts plain source and candidate values and returns an integer score plus safe factor explanations. The isolated boundary makes the intelligent behaviour reproducible and independently testable.

### Error boundary

`web/src/lib/reports/matching-errors.ts` defines only matching-specific domain errors and their safe response mapping. Authentication errors retain the existing exact 401 response; every unexpected error becomes `MATCHING_FAILED` without exposing database or request details.

## 5. Privacy Boundary

The source owner may use all ordinary source report fields because those fields belong to them. Candidate scoring and output use only member-visible candidate information.

The candidate database projection is limited to fields required by the public report mapper and scorer. The implementation must never select, inspect, return or log:

- private verification questions or expected answers;
- exact private location details, serial numbers or private notes;
- claimant evidence or staff review notes;
- contact details or email addresses;
- password hashes, session tokens or token hashes.

`reporterId` is used only at the database boundary to prove source ownership,
exclude the source owner's own candidate reports and construct the existing
member-visible mapper result. It is never passed to the scorer, explanation or
HTTP response.

A candidate campus location contributes only when `showCampusLocation` is true. A candidate date contributes only when `showEventDate` is true. A hidden value produces neither points nor an explanation, and the fixed 100-point denominator is not renormalised. Hidden values therefore cannot be inferred from a score increase.

The result embeds the existing `MemberReport` representation. It exposes a hidden date or location as `null`, hides private photos as an empty list and never serialises a Mongoose document directly.

## 6. Deterministic Scoring

The maximum score is always 100 points.

| Factor | Maximum | Rule |
|---|---:|---|
| Category | 25 | 25 for the same category ID; otherwise 0 |
| Public campus location | 15 | 15 for the same location ID when the candidate location is public; otherwise 0 or omitted when hidden |
| Public event-date proximity | 15 | Same elapsed day: 15; up to 3 days: 12; up to 7: 8; up to 14: 4; otherwise 0; omitted when hidden |
| Colours | 15 | Rounded `15 × Jaccard similarity` over normalised unique colour sets |
| Tags | 10 | Rounded `10 × Jaccard similarity` over normalised unique tag sets |
| Title and description | 20 | Rounded `20 × cosine similarity` over normalised term-frequency vectors |

Every factor is calculated independently and the rounded integer points are summed. The service keeps candidates scoring at least 35.

### Set normalisation

Colours and tags use Unicode NFKC normalisation, `en-NZ` lowercase, trimmed whitespace and duplicate removal before Jaccard comparison. Two empty sets have similarity zero rather than one.

### Text normalisation

Text processing is deliberately small and documented:

1. Unicode NFKC normalisation;
2. `en-NZ` lowercase;
3. split into Unicode letter and number terms;
4. remove a small fixed English stopword set;
5. map a small lost-and-found synonym set to canonical terms;
6. count term frequency;
7. compute cosine similarity across the union of terms.

The synonym map includes only unambiguous project-domain equivalents, such as `mobile` and `cellphone` to `phone`, `notebook` to `laptop`, and `adapter` to `charger`. No stemming, fuzzy matching, embeddings or learned model is used.

### Explanations

The scorer returns positive factors only. Each factor contains:

- a stable key (`category`, `location`, `date`, `colors`, `tags` or `text`);
- awarded integer points;
- that factor's maximum points;
- a concise, privacy-safe explanation.

Examples include `Same category`, `Same public campus location`, `Dates are within 3 days`, `Shared colours: black` and `Similar report wording`. Zero-point factors are omitted. Hidden date and location factors are also omitted.

## 7. Stable Ranking

Candidates are ordered by:

1. score descending;
2. report `createdAt` descending;
3. report ID descending using ordinal string comparison.

The service returns at most five entries. An eligible request with no candidate at or above 35 succeeds with an empty `matches` array. Running the same request over unchanged records always returns the same scores, explanations and ordering.

## 8. Response Contract

Success returns HTTP 200:

```json
{
  "sourceReportId": "64b64c6f2f4d9f1a2b3c4d54",
  "matches": [
    {
      "report": {
        "id": "64b64c6f2f4d9f1a2b3c4d55",
        "reportType": "found",
        "title": "Black notebook bag",
        "publicDescription": "Found beside the library help desk.",
        "categoryId": "64b64c6f2f4d9f1a2b3c4d52",
        "campusLocationId": null,
        "occurredAt": "2026-08-24T02:00:00.000Z",
        "colors": ["Black"],
        "tags": ["laptop", "bag"],
        "photoUrls": [],
        "status": "open",
        "resolvedAt": null,
        "createdAt": "2026-08-24T03:00:00.000Z",
        "updatedAt": "2026-08-24T03:00:00.000Z",
        "isOwner": false
      },
      "score": 72,
      "factors": [
        {
          "key": "category",
          "points": 25,
          "maximum": 25,
          "explanation": "Same category"
        }
      ]
    }
  ]
}
```

The illustrative report fields obey the existing member-visible contract. The exact score depends on all public factors.

## 9. Error Contract

| Code | HTTP | Safe message |
|---|---:|---|
| `VALIDATION_ERROR` | 400 | Invalid report query |
| `AUTHENTICATION_REQUIRED` | 401 | Authentication required |
| `REPORT_NOT_FOUND` | 404 | Report not found |
| `REPORT_NOT_MATCHABLE` | 409 | Report is not available for matching |
| `MATCHING_FAILED` | 500 | Unable to find report matches |

Authentication occurs before route parameters are awaited. An invalid ID is a 400. A missing or non-owned source is the same 404. A valid owned but non-open source is a 409. Database, mapper, scorer and unexpected request failures are hidden behind the generic 500 envelope.

## 10. Testing Strategy

### Scorer tests

- exact maximum and zero-score boundaries;
- every date bucket boundary;
- NFKC, casing, punctuation, whitespace, duplicates and empty sets;
- Jaccard point rounding;
- synonym equivalence and unrelated text;
- finite cosine behaviour with empty vectors;
- positive factor keys, point totals and safe explanations;
- hidden date and location never affect points or explanations.

### Labelled ranking evaluation

Use hand-authored lost-and-found fixtures with declared relevance labels. Tests prove that:

- a semantically and structurally strong candidate ranks above partial and irrelevant candidates;
- the relevant candidate appears at rank 1 in each labelled scenario;
- precision at five is deterministic for the fixed fixtures;
- candidates below 35 are excluded.

These fixtures are implementation evidence, not a claim of real-world model accuracy. The final report can describe the fixed weights, labels and limitations transparently.

### Service tests

- exact owner-scoped source filter and projection;
- missing/non-owned and non-open source behaviour;
- opposite-type open candidate filter, self-report exclusion, deterministic sort and 500 bound;
- public mapper use before scoring;
- threshold, stable tie-breaking, top-five limit and safe empty results;
- database and scorer failures remain available to the route boundary without leaking.

### Route tests

- authentication before params;
- exact 200 shape for student, staff and administrator owners;
- malformed ID, missing/non-owned source and ineligible source responses;
- cookie, current-user, params and service failures become safe envelopes;
- response scans exclude verification, contact, reporter and authentication secrets.

### Complete gate

Run in this order:

```powershell
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
npm audit
```

Then run `git diff --check`, confirm `.env.local` remains ignored without opening it, inspect branch scope and scan matching production code for private or authentication fields. Tests mock database operations and do not connect to Atlas.

## 11. Delivery Sequence

1. Pure scoring contracts, normalisation and labelled evaluation tests.
2. Matching-specific error contract.
3. Owner-scoped candidate service and privacy tests.
4. Authenticated matching route and route tests.
5. Complete quality, dependency, privacy and branch-scope verification.

A later Issue may add an owner-facing matching interface using this endpoint. Persisted feedback, notifications and more advanced retrieval remain separate work so Issue #25 stays deterministic, reviewable and academically defensible.
