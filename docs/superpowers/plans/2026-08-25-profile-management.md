# Profile Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Deliver a secure /profile workflow that lets an active user update only their own Profile preferences with optimistic concurrency protection and immediate session-state refresh.

**Architecture:** Add a focused server validation/error/service boundary behind GET and PATCH /api/profile. Reuse the existing authentication browser client and campus-location endpoint, then add one authenticated client page that loads current editable settings, degrades independently when location choices fail, saves a strict full snapshot and updates the Session Provider.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod 4, Mongoose 9, CSS Modules, Vitest and Testing Library.

## Global Constraints

- Work only on branch feature/issue-29-profile-management, based on clean develop.
- Link all implementation commits and the pull request to Issue #29.
- Never read, print, modify or commit .env.local or real credentials.
- Tests must mock persistence and must not connect to or mutate MongoDB Atlas.
- Do not add dependencies, models, collections, notification delivery, report history, uploads, password/email changes or administrator editing.
- Only displayName, preferredContactMethod, preferredCampusLocationIds and the four existing notification booleans are writable.
- Keep email, role, status and account timestamps read-only.
- Permit at most five unique active canonical campus-location ObjectIds.
- Use the persisted Profile updatedAt as an exact optimistic concurrency token.
- Suspended/deactivated sessions keep the existing revocation behaviour and resolve as unauthenticated at the API boundary.
- All controls need visible labels/focus, at least 44-pixel targets and a usable 320-pixel layout.
- Preserve user input on save failures; only explicit Reload latest profile may discard local changes.

---

## File Map

### Create

- web/src/lib/profile/validation.ts — strict editable-profile and update-input schemas, normalisation and public types.
- web/src/lib/profile/validation.test.ts — schema boundary tests.
- web/src/lib/profile/errors.ts — exact safe Profile errors and response mapping.
- web/src/lib/profile/errors.test.ts — error-envelope and sanitisation tests.
- web/src/lib/profile/service.ts — safe projection, location validation and concurrency-safe read/update.
- web/src/lib/profile/service.test.ts — mocked persistence and privacy tests.
- web/src/app/api/profile/route.ts — authenticated GET/PATCH handlers.
- web/src/app/api/profile/profile-routes.test.ts — route tests.
- web/src/components/profile/profile-settings-client.tsx — session boundary, loading, form and save state machine.
- web/src/components/profile/profile-settings-client.test.tsx — access, form, mutation, race and accessibility tests.
- web/src/components/profile/profile-settings.module.css — page and form styling.
- web/src/app/profile/page.tsx — metadata and main landmark.
- docs/superpowers/verification/2026-08-25-profile-management.md — final evidence.

### Modify

- web/src/lib/auth/browser-client.ts and .test.ts — strict Profile GET/PATCH browser operations.
- web/src/components/site-header.tsx and .test.tsx — active-account Profile link.
- web/src/components/dashboard/dashboard-client.tsx and .test.tsx — profile settings action.

---

### Task 1: Strict Profile validation and safe errors

**Files:**

- Create: web/src/lib/profile/validation.test.ts
- Create: web/src/lib/profile/validation.ts
- Create: web/src/lib/profile/errors.test.ts
- Create: web/src/lib/profile/errors.ts

**Interfaces:**

- Produces notificationSettingsSchema, editableProfileSchema, updateProfileSchema, EditableProfile, UpdateProfileInput, InvalidProfileError, ProfileError, invalidProfileResponse() and profileErrorResponse().
- Later tasks consume the parsed UpdateProfileInput and exact safe error envelopes.

- [ ] **Step 1: Write failing validation tests**

Use this fixture:

~~~ts
const locationA = "507f191e810c19729de860ea";
const locationB = "507f191e810c19729de860eb";

const validInput = {
  displayName: "  Student   Name  ",
  preferredContactMethod: "email",
  preferredCampusLocationIds: [locationA, locationB],
  notificationSettings: {
    possibleMatches: true,
    claimUpdates: false,
    statusChanges: true,
    handoverInstructions: false,
  },
  expectedUpdatedAt: "2026-08-25T00:00:00.000Z",
};
~~~

Assert parsing returns displayName "Student Name" and lower-case location IDs. Add table tests rejecting:

- one-character and 81-character names;
- a NUL and a zero-width format character;
- contact method phone;
- invalid ObjectIds;
- duplicate IDs including case-only duplicates;
- six location IDs;
- missing/non-boolean notification flags and extra notification keys;
- top-level email, role, status, userId and unknown keys;
- an invalid expectedUpdatedAt.

Test editableProfileSchema requires offset-aware ISO updatedAt and rejects _id, userId and __v.

- [ ] **Step 2: Run the validation test and verify red**

~~~powershell
cd D:\Massey\CampusLostFound\web
npm test -- src/lib/profile/validation.test.ts
~~~

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the strict schemas**

Use Zod only; do not import Mongoose into browser-safe validation code.

~~~ts
import { z } from "zod";

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const CONTROL_OR_FORMAT_PATTERN = /[\p{Cc}\p{Cf}]/u;

const displayNameSchema = z
  .string()
  .refine((value) => !CONTROL_OR_FORMAT_PATTERN.test(value), {
    message: "Display name contains unsupported characters",
  })
  .transform((value) => value.normalize("NFKC").trim().replace(/\s+/gu, " "))
  .pipe(
    z.string()
      .min(2, "Display name must contain at least 2 characters")
      .max(80, "Display name must contain at most 80 characters"),
  );

const campusLocationIdSchema = z
  .string()
  .regex(OBJECT_ID_PATTERN, "Choose a valid campus location")
  .transform((value) => value.toLowerCase());

export const notificationSettingsSchema = z.strictObject({
  possibleMatches: z.boolean(),
  claimUpdates: z.boolean(),
  statusChanges: z.boolean(),
  handoverInstructions: z.boolean(),
});

const editableFieldsSchema = z.strictObject({
  displayName: displayNameSchema,
  preferredContactMethod: z.enum(["in_app", "email"]),
  preferredCampusLocationIds: z.array(campusLocationIdSchema)
    .max(5, "Choose no more than 5 campus locations")
    .superRefine((ids, context) => {
      if (new Set(ids).size !== ids.length) {
        context.addIssue({
          code: "custom",
          message: "Choose each campus location only once",
        });
      }
    }),
  notificationSettings: notificationSettingsSchema,
});

export const editableProfileSchema = editableFieldsSchema.extend({
  updatedAt: z.string().datetime({ offset: true }),
});

export const updateProfileSchema = editableFieldsSchema.extend({
  expectedUpdatedAt: z.string().datetime({ offset: true }),
});

export type EditableProfile = z.infer<typeof editableProfileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
~~~

- [ ] **Step 4: Run validation tests and lint**

~~~powershell
npm test -- src/lib/profile/validation.test.ts
npx eslint src/lib/profile/validation.ts src/lib/profile/validation.test.ts
~~~

Expected: PASS.

- [ ] **Step 5: Write failing safe-error tests**

Require:

- ProfileError("PROFILE_CHANGED") -> exact 409 PROFILE_CHANGED.
- InvalidProfileError with preferredCampusLocationIds -> exact 400 VALIDATION_ERROR and approved fields only.
- invalidProfileResponse(zodError) -> flattened approved schema fields.
- actual AuthError("AUTHENTICATION_REQUIRED") -> existing exact 401.
- arbitrary Error, forged error-shaped objects and disallowed AuthError values -> exact 500 PROFILE_FAILED with message "Unable to manage profile settings".

- [ ] **Step 6: Implement safe Profile errors**

~~~ts
const profileErrorDefinitions = {
  PROFILE_CHANGED: {
    status: 409,
    message: "Profile settings changed in another session",
  },
  PROFILE_FAILED: {
    status: 500,
    message: "Unable to manage profile settings",
  },
} as const;
~~~

InvalidProfileError owns readonly fields. profileErrorResponse() may preserve only InvalidProfileError, ProfileError and AuthError("AUTHENTICATION_REQUIRED"). Everything else becomes PROFILE_FAILED.

- [ ] **Step 7: Run Task 1 checks and commit**

~~~powershell
npm test -- src/lib/profile/validation.test.ts src/lib/profile/errors.test.ts
npx eslint src/lib/profile/validation.ts src/lib/profile/validation.test.ts src/lib/profile/errors.ts src/lib/profile/errors.test.ts
npx tsc --noEmit --incremental false
git diff --check
git add web/src/lib/profile/validation.ts web/src/lib/profile/validation.test.ts web/src/lib/profile/errors.ts web/src/lib/profile/errors.test.ts
git commit -m "feat(profile): define safe profile contracts" -m "Refs #29"
~~~

Expected: PASS; commit includes only the four contract files.

---

### Task 2: Ownership-scoped Profile service

**Files:**

- Create: web/src/lib/profile/service.test.ts
- Create: web/src/lib/profile/service.ts

**Interfaces:**

- Consumes Task 1 contracts plus PublicUser, ProfileModel and CampusLocationModel.
- Produces getOwnProfile(userId) and updateOwnProfile(user, input).

- [ ] **Step 1: Write failing read-service tests**

Mock connectToDatabase, ProfileModel and CampusLocationModel. Assert this exact projection:

~~~ts
const PROFILE_PROJECTION = {
  _id: 0,
  displayName: 1,
  preferredContactMethod: 1,
  preferredCampusLocationIds: 1,
  notificationSettings: 1,
  updatedAt: 1,
};
~~~

Return a row that also has userId, _id, __v and PRIVATE_SECRET; require only EditableProfile output and an ISO timestamp. Assert filter { userId: "user-id" }. Missing Profile and rejected query must become safe Profile failures.

- [ ] **Step 2: Run and verify red**

~~~powershell
npm test -- src/lib/profile/service.test.ts
~~~

Expected: FAIL because service.ts does not exist.

- [ ] **Step 3: Implement safe read mapping**

~~~ts
function toEditableProfile(row: ProfileRow): EditableProfile {
  return editableProfileSchema.parse({
    displayName: row.displayName,
    preferredContactMethod: row.preferredContactMethod,
    preferredCampusLocationIds: row.preferredCampusLocationIds.map((id) =>
      id.toString(),
    ),
    notificationSettings: {
      possibleMatches: row.notificationSettings.possibleMatches,
      claimUpdates: row.notificationSettings.claimUpdates,
      statusChanges: row.notificationSettings.statusChanges,
      handoverInstructions: row.notificationSettings.handoverInstructions,
    },
    updatedAt: row.updatedAt.toISOString(),
  });
}
~~~

getOwnProfile connects, calls findOne({ userId }).select(PROFILE_PROJECTION).exec(), maps safe data and throws PROFILE_FAILED for missing/unknown failures.

- [ ] **Step 4: Add failing update-service tests**

Require:

1. Selected IDs are checked with countDocuments({ _id: { $in: ids }, isActive: true }).
2. Empty IDs skip countDocuments().
3. Count mismatch throws InvalidProfileError and does not update.
4. Update filter is { userId: safeUser.id, updatedAt: new Date(expectedUpdatedAt) }.
5. One $set contains only the four editable areas.
6. Options are { new: true, runValidators: true } and the safe projection.
7. Null update result throws PROFILE_CHANGED.
8. Database rejection hides its message.
9. No import or call of UserModel.
10. Result preserves authenticated id/email/role/status and replaces only public Profile fields plus profileUpdatedAt.

- [ ] **Step 5: Implement concurrency-safe update**

~~~ts
export async function updateOwnProfile(
  user: PublicUser,
  input: UpdateProfileInput,
) {
  await connectToDatabase();

  if (input.preferredCampusLocationIds.length > 0) {
    const count = await CampusLocationModel.countDocuments({
      _id: { $in: input.preferredCampusLocationIds },
      isActive: true,
    });
    if (count !== input.preferredCampusLocationIds.length) {
      throw new InvalidProfileError({
        preferredCampusLocationIds: ["Choose active campus locations"],
      });
    }
  }

  const updated = await ProfileModel.findOneAndUpdate(
    { userId: user.id, updatedAt: new Date(input.expectedUpdatedAt) },
    {
      $set: {
        displayName: input.displayName,
        preferredContactMethod: input.preferredContactMethod,
        preferredCampusLocationIds: input.preferredCampusLocationIds,
        notificationSettings: input.notificationSettings,
      },
    },
    { new: true, runValidators: true },
  ).select(PROFILE_PROJECTION).exec();

  if (!updated) throw new ProfileError("PROFILE_CHANGED");
  const profile = toEditableProfile(updated);
  const { updatedAt: profileUpdatedAt, ...publicProfile } = profile;
  return {
    user: { ...user, profile: publicProfile },
    profileUpdatedAt,
  };
}
~~~

Rethrow actual InvalidProfileError/ProfileError; wrap unknown persistence errors as PROFILE_FAILED.

- [ ] **Step 6: Run Task 2 checks and commit**

~~~powershell
npm test -- src/lib/profile/service.test.ts src/lib/profile/validation.test.ts src/lib/profile/errors.test.ts
npx eslint src/lib/profile/service.ts src/lib/profile/service.test.ts
npx tsc --noEmit --incremental false
git diff --check
git add web/src/lib/profile/service.ts web/src/lib/profile/service.test.ts
git commit -m "feat(profile): update owned profile safely" -m "Refs #29"
~~~

Expected: PASS with no real database connection and no User-model write.

---

### Task 3: Authenticated Profile API and strict browser operations

**Files:**

- Create: web/src/app/api/profile/profile-routes.test.ts
- Create: web/src/app/api/profile/route.ts
- Modify: web/src/lib/auth/browser-client.test.ts
- Modify: web/src/lib/auth/browser-client.ts

**Interfaces:**

- Produces GET/PATCH /api/profile, getProfileSettings() and updateProfileSettings(input).

- [ ] **Step 1: Write failing route tests**

Mock cookie, current-user and Profile services. Cover:

- active student/staff/administrator GET;
- missing/expired/revoked Session -> exact existing 401;
- safe service/forged-error handling;
- valid strict PATCH and exact response;
- malformed JSON, unknown account fields and Zod field errors;
- InvalidProfileError 400 and PROFILE_CHANGED 409;
- arbitrary and internal SyntaxError failures -> generic 500;
- password/token/MongoDB/userId/__v privacy scan.

- [ ] **Step 2: Run and verify red**

~~~powershell
npm test -- src/app/api/profile/profile-routes.test.ts
~~~

Expected: FAIL because route.ts does not exist.

- [ ] **Step 3: Implement GET and PATCH**

~~~ts
async function requireCurrentUser() {
  const user = await getCurrentUser(await readSessionCookie());
  if (!user) throw new AuthError("AUTHENTICATION_REQUIRED");
  return user;
}
~~~

GET returns { profile: await getOwnProfile(user.id) }. PATCH authenticates before parsing, maps malformed request JSON to invalidProfileResponse(), parses updateProfileSchema, then returns updateOwnProfile(user, parsed.data). Do not classify a service SyntaxError as malformed request JSON.

- [ ] **Step 4: Verify routes**

~~~powershell
npm test -- src/app/api/profile/profile-routes.test.ts
npx eslint src/app/api/profile/route.ts src/app/api/profile/profile-routes.test.ts
~~~

Expected: PASS.

- [ ] **Step 5: Write failing browser-client tests**

Require exact same-origin GET/PATCH requests and strict parsing. Reject missing/extra profile fields, invalid values/timestamps, invalid PublicUser, missing profileUpdatedAt, secret/internal fields and unknown top-level values. Cover 401, field 400, 409, generic 500, network and non-JSON errors without raw detail leaks.

- [ ] **Step 6: Extend the existing auth browser client**

Reuse the file-private publicUserSchema. Add strict response schemas and generic parseResponse():

~~~ts
const editableProfileResponseSchema = z.strictObject({
  profile: editableProfileSchema,
});

const updateProfileResponseSchema = z.strictObject({
  user: publicUserSchema,
  profileUpdatedAt: z.string().datetime({ offset: true }),
});

export async function getProfileSettings(): Promise<EditableProfile> {
  const response = await fetchSameOrigin("/api/profile", { method: "GET" });
  return (await parseResponse(response, editableProfileResponseSchema)).profile;
}

export async function updateProfileSettings(input: UpdateProfileInput) {
  const response = await fetchSameOrigin("/api/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseResponse(response, updateProfileResponseSchema);
}
~~~

Preserve existing auth operations and BrowserAuthError behaviour.

- [ ] **Step 7: Run Task 3 checks and commit**

~~~powershell
npm test -- src/app/api/profile/profile-routes.test.ts src/lib/auth/browser-client.test.ts
npx eslint src/app/api/profile/route.ts src/app/api/profile/profile-routes.test.ts src/lib/auth/browser-client.ts src/lib/auth/browser-client.test.ts
npx tsc --noEmit --incremental false
git diff --check
git add web/src/app/api/profile/route.ts web/src/app/api/profile/profile-routes.test.ts web/src/lib/auth/browser-client.ts web/src/lib/auth/browser-client.test.ts
git commit -m "feat(profile): expose profile settings API" -m "Refs #29"
~~~

Expected: existing authentication and new Profile tests pass.

---

### Task 4: Accessible Profile settings page

**Files:**

- Create: web/src/components/profile/profile-settings-client.test.tsx
- Create: web/src/components/profile/profile-settings-client.tsx
- Create: web/src/components/profile/profile-settings.module.css
- Create: web/src/app/profile/page.tsx

**Interfaces:**

- Consumes useAuthSession(), Profile browser operations, getReportCampusLocations() and updateProfileSchema.
- Produces protected /profile UI.

- [ ] **Step 1: Write failing route/access tests**

Require metadata title, main landmark, Session loading, login redirect, Session retry, inactive non-editing state and active student/staff/administrator access. Email/role/status are text, never inputs.

- [ ] **Step 2: Write failing loading/degradation tests**

Require Profile and campus locations to start in parallel. Cover initial values, Profile-only retry, location-only retry, form availability when locations fail, preserved saved IDs and stale-response rejection after account change/unmount.

- [ ] **Step 3: Write failing form/save tests**

Require labelled native controls for display name, contact radios, up to five location checkboxes, four notification checkboxes and one Save button. Cover:

- exact normalised PATCH snapshot and first-error focus;
- sixth-location prevention and announcement;
- single-flight save;
- successful Session update/token replacement/status announcement;
- field/generic error input preservation;
- 409 conflict plus explicit Reload latest profile;
- 401 login redirect;
- stale save response rejection.

- [ ] **Step 4: Run and verify red**

~~~powershell
npm test -- src/components/profile/profile-settings-client.test.tsx
~~~

Expected: FAIL because route/component do not exist.

- [ ] **Step 5: Implement route and state machine**

~~~tsx
export const metadata: Metadata = { title: "Profile settings" };

export default function ProfilePage() {
  return (
    <main id="main-content">
      <ProfileSettingsClient />
    </main>
  );
}
~~~

Key active editor state by session.user.id. Use separate Profile, location and save request counters. Keep form values separate so failures preserve input. Independent loadProfile() and loadLocations() callbacks allow exact retries.

If locations fail, disable only that fieldset, keep saved IDs unchanged and submit them unchanged.

- [ ] **Step 6: Implement validation, mutation and focus**

Parse { ...formValues, expectedUpdatedAt: profileUpdatedAt } with updateProfileSchema. Map only approved field paths. Focus display name, contact, locations, then notifications. Disable all controls during one save.

On success:

~~~ts
session.setAuthenticatedUser(result.user);
setProfileUpdatedAt(result.profileUpdatedAt);
setFormValues(profileFromUser(result.user));
setSaveMessage({ kind: "status", text: "Profile settings saved" });
~~~

On 409 keep input and show Reload latest profile. Reload explicitly fetches and replaces form. On 401 redirect and hide server text.

- [ ] **Step 7: Implement CSS**

Use one CSS Module, established color variables, centered width min(100% - 2rem, 62rem), visible labels/focus, native controls with enlarged hit areas, 44-pixel controls, text-backed errors, tabular selection count and @media (max-width: 20rem). No icons, custom widgets, gradients, modal, fonts or dependencies.

- [ ] **Step 8: Run focused UI checks and commit**

~~~powershell
npm test -- src/components/profile/profile-settings-client.test.tsx src/lib/auth/browser-client.test.ts
npx eslint src/components/profile/profile-settings-client.tsx src/components/profile/profile-settings-client.test.tsx src/app/profile/page.tsx
npx tsc --noEmit --incremental false
git diff --check
git add web/src/components/profile/profile-settings-client.tsx web/src/components/profile/profile-settings-client.test.tsx web/src/components/profile/profile-settings.module.css web/src/app/profile/page.tsx
git commit -m "feat(profile-ui): add profile settings workflow" -m "Refs #29"
~~~

Expected: PASS.

---

### Task 5: Navigation, final verification and PR evidence

**Files:**

- Modify site header and dashboard source/tests.
- Create docs/superpowers/verification/2026-08-25-profile-management.md.

- [ ] **Step 1: Write failing navigation tests**

Every active role sees Profile -> /profile and Manage profile settings -> /profile. Loading, unauthenticated, unavailable, suspended and deactivated states see no editing entry.

- [ ] **Step 2: Add minimal navigation**

Add the Profile header link under the existing isActive gate. Add one dashboard action:

~~~ts
{
  title: "Manage profile settings",
  description: "Update your contact, campus and notification preferences.",
  href: "/profile",
}
~~~

Keep current role destinations. Adjust the dashboard grid only for four desktop, two tablet and one mobile actions.

- [ ] **Step 3: Run focused feature checks**

~~~powershell
npm test -- src/lib/profile/validation.test.ts src/lib/profile/errors.test.ts src/lib/profile/service.test.ts src/app/api/profile/profile-routes.test.ts src/lib/auth/browser-client.test.ts src/components/profile/profile-settings-client.test.tsx src/components/site-header.test.tsx src/components/dashboard/dashboard-client.test.tsx
npx eslint src/lib/profile src/app/api/profile src/components/profile src/components/site-header.tsx src/components/site-header.test.tsx src/components/dashboard/dashboard-client.tsx src/components/dashboard/dashboard-client.test.tsx src/lib/auth/browser-client.ts src/lib/auth/browser-client.test.ts
npx tsc --noEmit --incremental false
git diff --check
~~~

Expected: PASS.

- [ ] **Step 4: Run one completed-UI quality inspection**

After all UI changes, run the applicable frontend detector once against the complete changed UI set. Do not create Atlas data for screenshots. Confirm labels, 44-pixel targets, focus, 320-pixel overflow, every state and inactive-account exclusion.

- [ ] **Step 5: Run full gates sequentially**

~~~powershell
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
npm audit
git diff --check
~~~

Expected: all pass; build lists /profile and /api/profile; audit reports 0 vulnerabilities.

- [ ] **Step 6: Run privacy, persistence and scope checks**

~~~powershell
git check-ignore -v web/.env.local
git ls-files | rg "(^|/)(\.env|\.env\.local)$"
rg -n "passwordHash|tokenHash|raw-session-token|PRIVATE_SECRET|__v|userId" web/src/components/profile web/src/app/api/profile web/src/lib/profile
git diff --stat develop...HEAD
git diff develop...HEAD -- web/package.json web/package-lock.json web/src/models
~~~

Expected: environment ignored/untracked, no production leak, no manifest/model changes and no out-of-scope subsystem.

- [ ] **Step 7: Write evidence and commit integration**

Record exact test counts, build routes, audit result, privacy/scope interpretation, detector result and Atlas non-use.

~~~powershell
git add web/src/components/site-header.tsx web/src/components/site-header.test.tsx web/src/components/dashboard/dashboard-client.tsx web/src/components/dashboard/dashboard-client.test.tsx docs/superpowers/verification/2026-08-25-profile-management.md
git commit -m "feat(profile-ui): link profile settings" -m "Refs #29"
git status --short --branch
~~~

Expected: clean branch.

- [ ] **Step 8: Push and prepare PR**

~~~powershell
git push -u origin feature/issue-29-profile-management
~~~

PR base develop, compare feature/issue-29-profile-management, title "feat(profile): add secure profile settings workflow", body includes exact verification and Closes #29. After merge, verify ancestry before deleting branches.
