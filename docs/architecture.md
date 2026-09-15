# Campus Find System Architecture

Campus Find is a single Next.js full-stack application. The code is separated
into browser UI, HTTP trust boundaries, domain services, and persistence so each
layer has a clear course-demonstration responsibility.

## Main request flow

```mermaid
flowchart LR
    subgraph Browser[Browser - untrusted input]
        UI[React pages and components]
        BC[Typed browser clients]
        UI --> BC
    end

    subgraph Server[Next.js server - trust boundary]
        RH[App Router route handlers]
        BODY[Bounded request reader]
        AUTH[Cookie session and role checks]
        VALID[Strict Zod validation]
        SVC[Domain services]
        MODEL[Mongoose models and indexes]
        RH --> BODY
        RH --> AUTH
        BODY --> VALID
        AUTH --> VALID
        VALID --> SVC
        SVC --> MODEL
    end

    BC -->|HTTPS JSON or multipart| RH
    MODEL --> DB[(MongoDB Atlas)]
    RH -->|safe JSON and status codes| BC
```

The browser never connects directly to MongoDB. Route handlers establish the
HTTP boundary, limit request size, retrieve the server-side session, enforce the
required account role/status, and validate untrusted data. Services implement
transactions and business rules. Mongoose schemas add persistence validation,
indexes, and safe field-selection defaults.

## Report image flow

```mermaid
flowchart LR
    PICK[Browser file picker and local preview]
    UPLOAD[Protected multipart image route]
    LIMIT[File count type signature and size checks]
    SHARP[Sharp decode rotate and metadata-free re-encode]
    TX[Transactional report image service]
    IMG[(reportImages binary record)]
    REF[(itemReports protected image path)]
    READ[Authorised image read route]

    PICK --> UPLOAD --> LIMIT --> SHARP --> TX
    TX --> IMG
    TX --> REF
    IMG --> READ --> PICK
```

JPEG, PNG, and WebP images are limited to five per report and 3 MiB stored bytes
each. Sharp decodes and re-encodes them without EXIF metadata. The transaction
stores the protected binary record and appends its internal API path to the
report. Ordinary pages receive the path, not raw database access.

## Explainable matching and notification flow

```mermaid
flowchart LR
    OPEN[New or selected open report]
    CAND[Open visible opposite-type candidates]
    PUBLIC[Privacy-filtered public fields]
    SCORE[Deterministic 100-point scorer]
    FILTER[Threshold 35 and top five]
    EXPLAIN[Scores and positive factor explanations]
    PLAN[Notification plan]
    NOTE[(notifications)]

    OPEN --> CAND --> PUBLIC --> SCORE --> FILTER
    FILTER --> EXPLAIN
    FILTER --> PLAN --> NOTE
```

Matching uses category, optional public location/date, colours, tags, and public
text. It does not use verification answers, reporter identity, contact data, or
private location detail. When a newly submitted report creates a strong
opposite-type possibility, notification plans are committed with the same
business transaction. The scorer remains advisory; Claim verification decides
whether recovery may proceed.

## Security and reliability boundaries

- Sessions use random cookie tokens while only token hashes are stored.
- Passwords use salted key derivation and are never stored in plain text.
- Authentication and selected mutation routes have bounded process-local rate
  limits suitable for the assessed single-instance deployment.
- JSON bodies use a shared 16 KiB strict UTF-8 reader; oversized requests return
  HTTP 413.
- Route error mappers return stable safe messages rather than raw database or
  validation internals.
- Multi-document report, Claim, image, moderation, and account operations use
  MongoDB transactions where atomicity is required.
- Tests mock database access; automated tests and production builds do not
  connect to Atlas.

## Technology map

| Concern | Implementation |
| --- | --- |
| UI and routing | Next.js App Router, React, TypeScript |
| Styling and responsive layout | CSS Modules, Tailwind/PostCSS base tooling |
| Browser/server contracts | Zod and explicit public DTO builders |
| Authentication | Revocable HTTP-only cookie sessions, Node.js crypto |
| Domain logic | TypeScript service modules |
| Persistence | MongoDB Atlas and Mongoose |
| Image processing | Sharp |
| Intelligent recommendation | Local deterministic weighted scorer |
| Automated quality | Vitest, Testing Library, ESLint, TypeScript, Next build |

## Source layout

- `web/src/app`: pages and route handlers.
- `web/src/components`: role-oriented React UI.
- `web/src/lib`: browser contracts, validation, services, security utilities,
  and the matcher.
- `web/src/models`: Mongoose schemas, relationships, indexes, and protected
  field defaults.
- `web/scripts`: explicit database setup and audit commands.
- `docs`: course-facing architecture, evaluation, verification, and user
  guidance.
