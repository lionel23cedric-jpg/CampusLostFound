# Authentication Backend Design

## Goal

Add a secure server-side email-and-password authentication foundation that lets students register, log in, log out and retrieve their current account without exposing passwords or raw session credentials.

## Scope

This change adds:

- A database-backed Session model.
- Password hashing and verification with Node.js `scrypt`.
- Random opaque session-token generation and hashed token storage.
- `POST /api/auth/register`.
- `POST /api/auth/login`.
- `POST /api/auth/logout`.
- `GET /api/auth/me`.
- Automated Vitest coverage that does not write to MongoDB Atlas.

This is a backend-only change. Registration and login pages will be implemented separately.

## Chosen approach

Authentication will use opaque database sessions stored in an HttpOnly cookie. A fresh random token is returned only to the browser cookie; MongoDB stores only its SHA-256 hash.

This approach was selected because a session can be revoked immediately during logout or after an account is suspended. It also avoids placing account data inside a long-lived client token.

The rejected alternatives were:

- JWT cookies, which make immediate revocation and account-status changes harder to enforce.
- Auth.js, which is mature but adds configuration and integration scope that is unnecessary for the initial email-and-password backend.

## Architecture and module boundaries

The implementation will keep HTTP, authentication and persistence responsibilities separate:

- `src/models/session.ts` defines the Session collection and indexes.
- `src/lib/auth/password.ts` hashes and verifies passwords.
- `src/lib/auth/token.ts` creates raw session tokens and hashes them for lookup.
- `src/lib/auth/validation.ts` owns the registration and login Zod schemas.
- `src/lib/auth/service.ts` coordinates User, Profile and Session persistence.
- `src/lib/auth/current-user.ts` resolves a cookie token into an active user and profile.
- Route handlers parse HTTP requests, call the authentication modules, set or clear cookies and translate known failures into safe responses.

The routes will reuse `connectToDatabase`. They will not duplicate database connection logic or query private report data.

## Session model

Session stores:

- `userId`: required ObjectId reference to User.
- `tokenHash`: required unique SHA-256 hash of the raw session token; excluded from normal query results with `select: false`.
- `expiresAt`: required date.
- Mongoose timestamps.

Indexes:

- A unique index on `tokenHash` prevents duplicate credentials.
- A TTL index on `expiresAt` with `expireAfterSeconds: 0` removes expired records asynchronously.
- An index on `userId` supports later account-wide session revocation.

TTL cleanup is not treated as the authorisation boundary. Every session lookup must explicitly require `expiresAt` to be later than the current time because MongoDB TTL deletion is asynchronous.

Multiple sessions per user are allowed so a user can log in from more than one device. A management interface for those sessions is outside this change.

## Password handling

Registration accepts passwords from 10 to 128 characters. Passwords are never trimmed or normalised because spaces may be intentional.

Password hashes use Node.js `crypto.scrypt` with:

- A cryptographically random 16-byte salt.
- A 64-byte derived key.
- Cost parameters `N=16384`, `r=8`, `p=1` and `maxmem=64 MiB`.
- The format `scrypt$16384$8$1$<salt-base64url>$<key-base64url>`, so parameters can be upgraded later.

Verification parses the stored format, derives the candidate key and uses `timingSafeEqual`. Invalid stored formats fail authentication without exposing parsing details.

No plaintext password may be logged, returned, stored in a session or retained after the request completes. The existing `passwordHash` field remains `select: false` and is requested explicitly only by login logic.

## Session token and cookie

Each login or registration creates a new 32-byte random token encoded with base64url. The raw token is placed in the browser cookie and its SHA-256 hash is stored in Session.

Cookie settings:

- Name: `clf_session`.
- `HttpOnly: true`.
- `SameSite: "lax"`.
- `Path: "/"`.
- `Max-Age: 604800` seconds (seven days).
- `Secure: process.env.NODE_ENV === "production"`.

Logout clears the cookie using matching path and security settings. Route responses never include the raw token in JSON.

## Registration flow

`POST /api/auth/register` accepts JSON containing only:

- `email`: a trimmed valid email address, normalised to lowercase.
- `password`: 10-128 characters.
- `displayName`: a trimmed string containing 2-80 characters.

The Zod schema is strict: unknown fields, including client-supplied `role` or `status`, produce HTTP 400 instead of being accepted or silently trusted.

The server controls privileged fields. A new account always receives:

- `role: "student"`.
- `status: "active"`.
- `emailVerifiedAt: null`.
- Default Profile contact and notification settings.

The service hashes the password and creates User, Profile and Session in one MongoDB transaction. The cookie is set only after the transaction commits. A duplicate-email race is translated from MongoDB error code `11000` into a conflict response.

Successful registration returns HTTP 201 and the safe current-user response.

## Login flow

`POST /api/auth/login` accepts a normalised email and an unmodified password.

The service explicitly selects `passwordHash`, verifies the password and then checks account status. An unknown email and an incorrect password both return the same message so the response does not reveal whether an account exists.

Only an `active` account can receive a session. A valid password for a `suspended` or `deactivated` account returns an unavailable-account response. Successful login updates `lastLoginAt`, creates a new Session, sets the cookie and returns the safe current-user response.

## Current-user flow

`GET /api/auth/me` reads `clf_session`, hashes the raw token and searches for an unexpired Session. It then loads the referenced User and Profile.

If the token is missing, invalid or expired, the route responds as unauthenticated. If the account is no longer active, the current session is revoked and the request is also treated as unauthenticated.

The safe response includes:

- User ID, email, role, status, `emailVerifiedAt` and `lastLoginAt`.
- Profile display name, preferred contact method, preferred campus-location IDs and notification settings.

It never includes `passwordHash`, `tokenHash`, the raw session token or other fields excluded by the models.

The exact success envelope is:

```json
{
  "user": {
    "id": "string",
    "email": "student@example.com",
    "role": "student",
    "status": "active",
    "emailVerifiedAt": null,
    "lastLoginAt": null,
    "profile": {
      "displayName": "Student Name",
      "preferredContactMethod": "in_app",
      "preferredCampusLocationIds": [],
      "notificationSettings": {
        "possibleMatches": true,
        "claimUpdates": true,
        "statusChanges": true,
        "handoverInstructions": true
      }
    }
  }
}
```

## Logout flow

`POST /api/auth/logout` is idempotent. If a cookie is present, the route hashes it and deletes the matching Session. It clears the cookie whether or not a matching database record exists, then returns HTTP 204 with no response body.

## API errors

Known errors use this safe JSON structure:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "fields": {}
  }
}
```

`fields` is included only for validation failures and contains Zod field-error string arrays. The exact error codes are `VALIDATION_ERROR`, `INVALID_CREDENTIALS`, `ACCOUNT_UNAVAILABLE`, `EMAIL_ALREADY_REGISTERED`, `AUTHENTICATION_REQUIRED` and `AUTHENTICATION_FAILED`.

- HTTP 400: invalid JSON or invalid registration/login fields.
- HTTP 401: invalid email/password or authentication required.
- HTTP 403: an authenticated password belongs to a suspended or deactivated account.
- HTTP 409: an email address is already registered.
- HTTP 500: unexpected server or database failure with no raw internal details.

Exact public messages:

- `Invalid request`.
- `Invalid email or password`.
- `Account is unavailable`.
- `Email is already registered`.
- `Authentication required`.
- `Unable to complete authentication request`.

Route handlers must not return MongoDB errors, stack traces, password hashes, submitted passwords or session tokens.

## Automated testing

Vitest will be added as a development dependency with a non-interactive `npm test` script.

Automated tests will cover:

- Password hashes use random salts, verify the correct password and reject an incorrect password.
- Malformed stored password hashes fail safely.
- Raw session tokens are random and only their deterministic SHA-256 hashes are persisted.
- Session schema validation and required unique, TTL and user indexes.
- Registration success, invalid input and duplicate-email responses.
- Registration cannot submit a privileged role or status.
- Login success, invalid credentials and inactive-account responses.
- Current-user success plus missing, expired and invalid-session responses.
- Logout deletes the current session, clears the cookie and remains idempotent.
- Successful responses exclude password and session credential fields.

Database access, transactions, model methods and Next.js cookies are mocked for route and service tests. Tests do not read `.env.local`, connect to Atlas or create application records.

Final verification runs:

- `npm test`.
- `npm run lint`.
- `npm run build`.
- `npm audit`.
- A Git scope check confirming `.env.local` remains ignored.

## Security limitations and future work

The following are intentionally deferred and must be documented as future security work:

- Email verification.
- Password reset and password changes.
- Login rate limiting and abuse monitoring.
- Third-party identity providers.
- Multi-device session-management UI and revoke-all control.
- Cross-site deployment support beyond the same-site application architecture.

## Out of scope

- Registration, login, account or profile pages.
- Report creation or report browsing APIs.
- Role elevation and administrator account controls.
- Email delivery.
- Password recovery.
- OAuth or social login.
- Creating test users in MongoDB Atlas.
