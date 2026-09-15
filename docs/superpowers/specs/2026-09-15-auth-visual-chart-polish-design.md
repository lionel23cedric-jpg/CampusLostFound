# Authentication and Visual Polish Design

## Scope

This change fixes two observed defects and completes one small administrator overview refinement. It does not change authentication rules, database schemas, report workflows, or the existing visual identity.

## Authentication recovery

The active worktree has no `web/.env.local`, so every authentication request that reaches MongoDB fails with HTTP 500. Copy the existing ignored local environment file from the user's original D-drive checkout into this worktree. The file must remain untracked and its contents must never appear in logs, commits, tests, or documentation. Restart the development server and verify the database health route before testing login and registration.

## Registration illustration spacing

The registration privacy note currently uses a negative top margin immediately after the authentication banner, causing its text and border to overlap the image. Replace that negative margin with normal vertical spacing. Make shared illustration images block-level so their boxes cannot retain inline-image baseline space. Preserve the existing image, copy, aspect ratio, responsive behavior, and login layout.

## Administrator overview percentages

Keep the existing dependency-free CSS `conic-gradient` doughnut charts. Add a visible percentage beside every legend value while retaining the raw count and total. Percentages are calculated as `value / total`, rounded to the nearest whole percent; a zero total displays `0%`. The three charts remain Reports, Ownership Claims, and Accounts.

## Verification

- Confirm `web/.env.local` exists locally and remains ignored by Git.
- Verify `/api/health/database`, login, registration, and current-session requests against the local server.
- Run the focused authentication, illustration, and overview component tests.
- Run ESLint, TypeScript, the complete Vitest suite, production build, and dependency audit.
- Inspect registration and overview at desktop and mobile widths for overlap, clipping, readable percentages, focus visibility, and console errors.
