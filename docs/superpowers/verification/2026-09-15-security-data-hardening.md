# Security and Data Hardening Verification

Date: 15 September 2026  
Branch: `feature/project-quality-polish`

## Result

The security and data hardening slice passed its complete automated verification.
No database setup or cleanup command was executed against MongoDB Atlas.

## Dependency evidence

- `next@16.3.5`
- `sharp@0.35.4`
- `vitest@4.1.11`
- `@vitest/mocker@4.1.11`
- `js-yaml@4.3.2`
- `npm audit --audit-level=low`: 0 vulnerabilities

## Automated checks

- `npm test`: 166 test files and 2916 tests passed.
- `npm run lint`: passed.
- `npx tsc --noEmit --incremental false`: passed.
- `npm run build`: passed with 38 static pages generated and all dynamic routes collected.
- `node --check scripts/bootstrap-reference-data.mjs`: passed.
- `node --check scripts/audit-legacy-photo-urls.mjs`: passed.

## Implemented trust boundaries

- Ordinary JSON request bodies are limited to 16 KiB and decoded as strict UTF-8.
- Oversized JSON returns HTTP 413 without echoing submitted content.
- Login is limited to 10 attempts per 15 minutes per address and hashed identity.
- Registration is limited to 5 attempts per hour per address.
- Member writes are limited to 30 requests per 10 minutes per account.
- Staff and administrator writes are limited to 60 requests per 10 minutes per account.
- Uploaded JPEG, PNG, and WebP files are decoded, orientation-normalised, and re-encoded by Sharp without retained metadata.
- The process-local limiter is intentionally scoped to this course project's single-instance deployment; a shared trusted store is documented as the multi-instance extension point.

## Data operations

- `npm run db:bootstrap` is explicit, idempotent, and preserves existing administrator edits.
- `npm run db:audit-legacy-images` is read-only by default and prints counts rather than image URLs.
- Legacy reference removal requires the explicit `--apply` option and uses optimistic concurrency.
- Neither database command runs during tests, builds, or application startup.
- Neither command was run during this verification, so no Atlas data was changed.

## Static review

- No route still calls `request.json()` or a deleted domain-specific JSON reader.
- No production image path calls `withMetadata`; its only remaining use is a test fixture that proves uploaded metadata is removed.
- Repository searches found only documented MongoDB URI placeholders, not a committed credential value.
