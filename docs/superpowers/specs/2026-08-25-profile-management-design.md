# Profile Management Design

## Goal

Add a secure, accessible profile settings workflow for active Campus Find accounts. A signed-in user can update only their display name, preferred contact method, preferred campus locations and notification preferences while account identity, role and status remain read-only.

## Scope

This feature includes:

- an authenticated profile settings read endpoint;
- an authenticated, concurrency-safe profile update endpoint;
- strict server and browser validation;
- a `/profile` page for students, staff and administrators;
- profile navigation from the authenticated site header and dashboard;
- immediate Session Provider refresh after a successful save;
- focused, integration, accessibility, privacy and repository-wide verification.

This feature does not include:

- email, password, role or account-status changes;
- email verification or notification delivery;
- a notification inbox or persisted Notification model;
- report history or report management;
- avatar or file upload;
- administrator profile editing;
- new dependencies or external services.

Personal report history is intentionally deferred to its own bounded feature because it requires report ownership queries, status actions and a separate information architecture.

## Approaches Considered

### Selected: complete profile vertical slice

Implement the protected API, service, browser client, page, form and navigation together. This delivers the project brief's required Profile page as working software and keeps one public contract between the backend and frontend.

### Backend-only profile API

This is smaller but leaves no usable project feature and duplicates the previous backend/frontend split. It is rejected because the existing Profile model is already mature enough for a safe end-to-end slice.

### Administrator dashboard first

Administrative statistics are important but do not resolve the missing self-service profile requirement. They also depend on more aggregation and role-specific design. Profile management is the lower-risk prerequisite and is selected first.

## Existing Foundations

The feature reuses:

- `ProfileModel` and its one-profile-per-user constraint;
- `CONTACT_METHODS` and the four existing notification settings;
- `getCurrentUser()` and the existing session cookie boundary;
- `PublicUser` as the safe account boundary for the successful update response;
- `listActiveCampusLocations()` and `GET /api/campus-locations`;
- `AuthSessionProvider.setAuthenticatedUser()` for immediate application state;
- existing authenticated route, form, field-error and responsive interface patterns.

No Profile fields move into the User model.

## Public Contracts

### Editable profile

The server exposes only this profile settings representation:

```ts
type EditableProfile = {
  displayName: string;
  preferredContactMethod: "in_app" | "email";
  preferredCampusLocationIds: string[];
  notificationSettings: {
    possibleMatches: boolean;
    claimUpdates: boolean;
    statusChanges: boolean;
    handoverInstructions: boolean;
  };
  updatedAt: string;
};
```

`updatedAt` is an ISO timestamp used only as an optimistic concurrency token. The response never includes `userId`, MongoDB version fields, password data, sessions or other account records.

### Update input

```ts
type UpdateProfileInput = {
  displayName: string;
  preferredContactMethod: "in_app" | "email";
  preferredCampusLocationIds: string[];
  notificationSettings: {
    possibleMatches: boolean;
    claimUpdates: boolean;
    statusChanges: boolean;
    handoverInstructions: boolean;
  };
  expectedUpdatedAt: string;
};
```

The body is a strict object. Unknown properties such as `email`, `role`, `status`, `userId`, `password` and extra notification keys are rejected.

### `GET /api/profile`

Authentication is resolved from the session cookie. The route returns:

```json
{
  "profile": {
    "displayName": "Student Name",
    "preferredContactMethod": "in_app",
    "preferredCampusLocationIds": [],
    "notificationSettings": {
      "possibleMatches": true,
      "claimUpdates": true,
      "statusChanges": true,
      "handoverInstructions": true
    },
    "updatedAt": "2026-08-25T00:00:00.000Z"
  }
}
```

### `PATCH /api/profile`

The route parses `UpdateProfileInput`, validates referenced campus locations and updates only the current user's Profile. It returns:

```ts
type UpdateProfileResponse = {
  user: PublicUser;
  profileUpdatedAt: string;
};
```

The browser uses `user` to update the Session Provider and `profileUpdatedAt` as the next concurrency token.

## Validation

### Display name

- Unicode-normalised with NFKC, trimmed and internal whitespace collapsed.
- Between 2 and 80 characters after normalisation.
- Control characters are rejected.

### Contact method

- Exactly `in_app` or `email`.
- Email remains a contact preference, not a promise of automatic email delivery.

### Preferred campus locations

- An array containing at most five values.
- Every value must be a canonical MongoDB ObjectId string.
- Duplicate IDs are rejected rather than silently removed.
- Every selected record must exist with `isActive: true` at save time.
- An empty array is valid.

### Notification preferences

- All four booleans are required.
- No unknown setting is accepted.
- These values record consent preferences for later notification features; this issue does not send or store notifications.

### Concurrency token

- `expectedUpdatedAt` must be a valid offset-aware ISO datetime.
- It must exactly match the persisted Profile `updatedAt` value.

## Service and Persistence

`getOwnProfile(userId)` connects to MongoDB and selects only the editable fields plus `updatedAt`.

`updateOwnProfile(userId, input)` performs these steps:

1. Query active campus locations for the unique selected IDs using `_id` and `isActive: true`.
2. If the number found differs from the input count, throw a field-level validation error for `preferredCampusLocationIds`.
3. Call `ProfileModel.findOneAndUpdate()` with both `userId` and `updatedAt: new Date(input.expectedUpdatedAt)` in the filter.
4. Use one `$set` containing only the four approved editable areas.
5. Request the updated document with Mongoose validation and timestamps enabled.
6. If no document matches, throw `PROFILE_CHANGED` without performing a blind retry.
7. Create the response user by copying the immutable fields from the already-authenticated `PublicUser` and replacing only its public `profile` value from the updated Profile.

The update affects one Profile document, so no transaction is needed. The User collection is neither queried again nor written.

## Error Boundary

The profile module defines exact public errors:

| Code | Status | Public message |
| --- | ---: | --- |
| `VALIDATION_ERROR` | 400 | `Invalid profile settings` |
| `AUTHENTICATION_REQUIRED` | 401 | Existing authentication message |
| `ACCOUNT_UNAVAILABLE` | 403 | Existing account message |
| `PROFILE_CHANGED` | 409 | `Profile settings changed in another session` |
| `PROFILE_FAILED` | 500 | `Unable to manage profile settings` |

Only actual profile and authentication error instances may preserve their public details. Malformed JSON, Mongoose exceptions, forged error-shaped objects and arbitrary exceptions become the generic profile failure. Field errors contain only approved field paths.

The read route uses a generic safe service failure if the authenticated account has no Profile, because that state is an internal data-integrity problem rather than a user-visible absence.

## Page Architecture

### Route and access boundary

`/profile` renders a server page containing a client boundary. The boundary:

- redirects an unauthenticated visitor to `/login`;
- offers Session retry when account checking is unavailable;
- shows an unavailable state for suspended or deactivated accounts;
- allows active student, staff and administrator accounts;
- never renders Profile data before the access decision.

The Session supplies the read-only email, role and account status. `GET /api/profile` supplies the latest editable values and concurrency token. `GET /api/campus-locations` loads active choices in parallel.

### Form layout

The page contains:

1. `Account summary`: read-only email, role and status.
2. `Basic profile`: display-name text input.
3. `Contact preference`: native radio inputs for In-app and Email.
4. `Preferred campus locations`: native checkboxes grouped by campus, with a visible `n of 5 selected` status.
5. `Notification preferences`: four native checkboxes with plain-language descriptions.
6. One `Save profile` action.

Native controls are selected instead of custom widgets or dependencies. Each label remains visible, every interactive target is at least 44 pixels, focus is visible and the layout remains usable at 320 pixels.

### Reference-data degradation

The profile and campus-location requests start in parallel. If the Profile request fails, the form does not render and the user receives a retry action. If only campus locations fail:

- other fields remain editable;
- the campus-location group is disabled and explains that choices are unavailable;
- the currently saved location IDs remain in form state and are submitted unchanged;
- a separate retry reloads only location choices.

### Save behaviour

- Client validation uses the same user-facing limits as the server.
- The first invalid control receives focus.
- A save is single-flight; all controls and the submit button are disabled during the request.
- Server field errors attach to their labelled groups without losing input.
- A generic failure keeps all input and offers another save attempt.
- A successful response calls `setAuthenticatedUser(user)`, updates the local concurrency token and announces `Profile settings saved`.
- A 409 keeps input, explains the conflict and offers `Reload latest profile`. Reload is explicit because it discards local edits.
- A 401 redirects to `/login` without displaying the server error text.

## Navigation

Active authenticated accounts receive a `Profile` link in the site header and a `Manage profile settings` action in the dashboard. Inactive accounts receive neither editing link. No role receives administrative controls through this feature.

## Testing

### Validation tests

- normalise valid display names;
- reject short, long, control-character and unknown-field input;
- reject invalid contact methods;
- accept zero to five unique canonical location IDs;
- reject duplicates, invalid IDs and more than five selections;
- require exactly four boolean notification settings;
- require a valid concurrency timestamp.

### Service tests

- select only safe Profile fields;
- validate every selected location as active;
- update only the authenticated user's Profile with the expected timestamp;
- never call `UserModel` for a write;
- return the updated public user and timestamp;
- reject inactive/missing locations and stale timestamps safely;
- hide arbitrary database error details.

All service tests mock Mongoose models and never connect to or mutate MongoDB Atlas.

### Route tests

- GET and PATCH authentication boundaries;
- strict request parsing and exact safe responses;
- active roles allowed, inactive accounts rejected;
- malformed JSON, service errors and forged errors sanitised;
- response scans for password hashes, tokens, user IDs and MongoDB internals.

### Browser and component tests

- strict response validation and same-origin credentials;
- initial parallel loading and independent reference retry;
- complete active-role access matrix;
- labelled controls and initial values;
- client validation and first-error focus;
- five-location limit;
- successful save updates the Session Provider;
- duplicate-submit prevention;
- field, generic, authentication and conflict states;
- stale response rejection after account changes or unmount;
- header and dashboard navigation gates;
- 44-pixel targets, visible focus and 320-pixel layout.

### Final gates

Run focused tests after each task, then:

```powershell
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
npm audit
git diff --check
```

Verify `.env.local` remains ignored and scan the complete diff for credentials, authentication internals and out-of-scope account fields.

## Success Criteria

The feature is complete when an active user can safely load, edit and save only their own Profile settings; concurrent edits cannot be silently overwritten; updated display data appears immediately across the authenticated interface; all error and narrow-screen states are usable; and all automated, privacy and dependency gates pass without touching real Atlas data.
