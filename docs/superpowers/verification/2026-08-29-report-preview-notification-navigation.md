# Report Preview, Notification Read, and Navigation Consistency Verification

## Scope

Verified the focused repair for local report-image previews, notification read updates, and application return-control consistency. No dependency manifest, database schema, API route, role, or upload contract changed.

## Automated Evidence

- Focused root-cause tests: **27 passed** across the Strict Mode image picker, notification service, and shared return control.
- Changed-page component suite: **343 passed** across administrator, claimant, notification, report, and staff surfaces.
- Final focused regression suite: **117 passed**, including top-of-content return-control placement.
- Full suite: **164 test files and 2,906 tests passed**.
- ESLint: **passed** with no warnings or errors.
- TypeScript: `npx tsc --noEmit --incremental false` **passed**.
- Production build: Next.js compiled, type-checked, collected route data, and generated all **38 static pages successfully**.
- Impeccable interface detector: **0 findings** for the changed UI source set.
- `git diff --check`: **passed**; Git reported only the repository's existing Windows line-ending conversion notices.

## Regression Coverage

- The image picker runs inside React Strict Mode and proves that the rendered image uses the latest live object URL after the development cleanup/setup cycle.
- Image removal and unmount tests prove that every owned object URL is revoked.
- Notification service tests prove the recipient ownership filter, idempotent `$ifNull` pipeline, `updatePipeline: true`, and `returnDocument: "after"` options.
- Shared return-control tests prove the deterministic destination, accessible label, decorative arrow, and class composition.
- Representative administrator, notification, report, and claim tests prove that the return control appears before the page heading and preserves contextual destinations.

## Environment Limitations

`npm audit` could not return a result inside the sandbox because the registry audit request and npm log directory were blocked. The required elevated retry was then rejected by the approval service because the account had reached its usage limit. No workaround was attempted and no package was installed or changed.

The writable verification clone intentionally has no `.env.local`, so an authenticated browser pass against the real database was not run from this branch. This avoids copying or exposing secrets. After the branch is integrated into the configured runtime checkout, manually confirm the three flows below.

## Manual Acceptance Flow

1. Open `Report item`, select one JPEG, PNG, or WebP file, and confirm the thumbnail renders before submission.
2. Open `Notifications`, choose an unread card, select `Mark as read`, and confirm the card changes to `Read` and the unread count decreases without the red error message.
3. Open representative report, claim, notification, staff, and administrator pages at desktop and narrow width. Confirm the arrow return control is the first page-content navigation at the upper left and goes to its labelled parent page after direct navigation or refresh.
