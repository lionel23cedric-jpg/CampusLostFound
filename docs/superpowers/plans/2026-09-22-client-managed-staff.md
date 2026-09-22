# Client-Managed Staff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an active administrator add and remove registered users from the Staff group through the existing account UI without database editing.

**Architecture:** Extend the established account-management contract, route, browser client, and account card. Keep role updates transactional with session revocation and a separate immutable audit event, matching the existing status-change safeguards.

**Tech Stack:** Next.js App Router, React, TypeScript, Zod, Mongoose, Vitest.

## Global Constraints

- Work only in `D:\Massey\CampusLostFound-project-quality-polish` on `feature/supervisor-feedback`.
- Only an active administrator may change a student/staff role; never expose administrator promotion in the UI or API.
- Do not delete users, reports, claims, or profile records. Do not handle passwords.
- Preserve existing account-status behaviour and use the existing account-page visual language.
- Tests must not connect to Atlas or use `.env.local`.

---

### Task 1: Role contract and immutable audit record

**Files:**
- Modify: `web/src/lib/admin/account-contract.ts`
- Modify: `web/src/lib/admin/account-browser-contract.ts`
- Create: `web/src/models/account-role-change-event.ts`
- Test: `web/src/lib/admin/account-contract.test.ts`
- Test: `web/src/models/account-role-change-event.test.ts`

**Interfaces:**
- Consumes: existing `MANAGEABLE_ACCOUNT_ROLES`, `accountUserIdSchema`, and `managedAccountSchema`.
- Produces: `accountRoleInputSchema`, `AccountRoleInput`, `AccountBrowserRoleInput`, and `AccountRoleChangeEventModel`.

- [ ] **Step 1: Write failing contract/model tests.** Assert that `{ role: "staff", expectedUpdatedAt: ISO }` parses, `administrator` and extra keys fail, and the audit record rejects self-targeting or role pairs other than student↔staff.
- [ ] **Step 2: Run `npm test -- src/lib/admin/account-contract.test.ts src/models/account-role-change-event.test.ts` from `web`; expect the new tests to fail.**
- [ ] **Step 3: Add the strict role schema and focused audit model.** The public input is exactly `z.strictObject({ role: z.enum(MANAGEABLE_ACCOUNT_ROLES), expectedUpdatedAt: z.string().datetime({ offset: true }) })`. The event stores actor, target, previousRole, newRole, and occurredAt; it stores no password or report content.
- [ ] **Step 4: Re-run the two tests; expect pass. Commit `feat(admin): define staff role changes`.**

### Task 2: Transactional role service and administrator route

**Files:**
- Create: `web/src/lib/admin/account-role-service.ts`
- Create: `web/src/lib/admin/account-role-service.test.ts`
- Create: `web/src/app/api/admin/accounts/[userId]/role/route.ts`
- Create: `web/src/app/api/admin/accounts/[userId]/role/admin-account-role-route.test.ts`

**Interfaces:**
- Consumes: `AccountRoleInput`, `requireAccountAdministrator`, `toManagedAccount`, `AccountRoleChangeEventModel`.
- Produces: `updateManagedAccountRole(administrator: PublicUser, targetUserId: string, input: AccountRoleInput): Promise<ManagedAccount>` and `PATCH /api/admin/accounts/:userId/role`.

- [ ] **Step 1: Write failing tests for promotion, demotion, current-admin recheck, self/admin/deactivated target rejection, same-role and stale-time conflict, transaction rollback, session revocation, and safe response errors.** Use mocks, not a live database.
- [ ] **Step 2: Run `npm test -- src/lib/admin/account-role-service.test.ts src/app/api/admin/accounts/[userId]/role/admin-account-role-route.test.ts`; expect failure.**
- [ ] **Step 3: Implement a transaction that re-reads actor and target, filters the update by old role/status/`updatedAt`, changes only `role`, deletes target sessions, creates one immutable role event, and reads the profile for `toManagedAccount`.** The route mirrors the status route's session check, body reader, rate limit, no-store header, and bounded errors.
- [ ] **Step 4: Re-run targeted tests; expect pass. Commit `feat(admin): manage staff roles safely`.**

### Task 3: Browser client and account-page interaction

**Files:**
- Modify: `web/src/lib/admin/account-browser-client.ts`
- Modify: `web/src/lib/admin/account-browser-client.test.ts`
- Modify: `web/src/components/admin/admin-account-management-client.tsx`
- Modify: `web/src/components/admin/admin-account-management-client.test.tsx`
- Modify only if needed: `web/src/components/admin/admin-account-management.module.css`

**Interfaces:**
- Consumes: `PATCH /api/admin/accounts/:userId/role` and `AccountBrowserRoleInput`.
- Produces: `updateAdministratorAccountRole(...)` and visible Add Staff/Remove Staff actions.

- [ ] **Step 1: Add failing client and component tests.** Assert the exact PATCH body and safe response validation; assert a student card offers Add Staff, a Staff card offers Remove Staff, a deactivated card offers neither, and confirmation names the new role and session revocation.
- [ ] **Step 2: Run `npm test -- src/lib/admin/account-browser-client.test.ts src/components/admin/admin-account-management-client.test.tsx`; expect failure.**
- [ ] **Step 3: Add the role action to existing account-card state, reuse its confirmation region, focus restoration, pending lock, safe error handling, and row refresh.** Do not add a new page or a password field.
- [ ] **Step 4: Run targeted tests, lint, `npx tsc --noEmit`, and build; expect pass. Commit `feat(admin-ui): configure staff membership`.**

### Task 4: Acceptance and documentation

**Files:**
- Modify: `web/README.md`
- Modify: `docs/user-guide.md`
- Modify: `docs/test-matrix.md`
- Create: `docs/superpowers/verification/2026-09-22-client-managed-staff.md`

- [ ] **Step 1: Document administrator promotion/demotion, status management, session sign-out, limits, and the setup-only role script.**
- [ ] **Step 2: Run the complete test, lint, typecheck, and build commands.** Record exact results and distinguish automated checks from any manual role demo.
- [ ] **Step 3: Review `git diff --check` and commit `docs: verify client-managed staff`.**

## Self-review

- Spec coverage: add/remove Staff, modify availability, protected API, audit, rollback, UX, and tests are mapped above.
- No administrator promotion, account deletion, password creation, or unrelated refactor is planned.
