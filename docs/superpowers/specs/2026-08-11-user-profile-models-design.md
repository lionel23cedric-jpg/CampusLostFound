# User and Profile Models Design

## Goal

Establish the secure account and profile data-model foundation required for authentication, role-based permissions, profile management and later report ownership.

## Scope

This change adds only the `User` and `Profile` Mongoose models. Registration routes, Auth.js, password hashing, profile pages, campus-location records and report history queries will be implemented separately.

## Chosen approach

Authentication and authorisation data will be stored in `users`, while personal preferences will be stored in `profiles`. This separation follows the approved proposal, reduces accidental exposure of account-security data and keeps each model focused.

Alternative approaches were rejected:

- Embedding profile fields in `User` would mix authentication data with personal preferences and conflict with the proposed collection design.
- Splitting credentials into a third collection would add complexity before Auth.js integration requires it.

## User model

The `User` model stores:

- `email`: required, trimmed, lowercased, validated and uniquely indexed.
- `passwordHash`: required and excluded from normal query results.
- `role`: `student`, `staff` or `administrator`; defaults to `student`.
- `status`: `active`, `suspended` or `deactivated`; defaults to `active`.
- `emailVerifiedAt`: optional date.
- `lastLoginAt`: optional date.
- Mongoose timestamps: `createdAt` and `updatedAt`.

Any valid email address may be used for the project demonstration. Users cannot choose privileged roles during registration; role elevation will be an administrator-only service operation.

## Profile model

The `Profile` model stores:

- `userId`: required, uniquely indexed ObjectId reference to `User`.
- `displayName`: required, trimmed, between 2 and 80 characters.
- `preferredContactMethod`: `in_app` or `email`; defaults to `in_app`.
- `preferredCampusLocationIds`: an array of ObjectId references to the future `CampusLocation` model; defaults to an empty array.
- `notificationSettings.possibleMatches`: boolean, defaults to `true`.
- `notificationSettings.claimUpdates`: boolean, defaults to `true`.
- `notificationSettings.statusChanges`: boolean, defaults to `true`.
- `notificationSettings.handoverInstructions`: boolean, defaults to `true`.
- Mongoose timestamps: `createdAt` and `updatedAt`.

Report history will be derived later from item reports linked to the user. It will not be duplicated in Profile. Phone numbers and publicly visible contact details are excluded from this phase to minimise private-data collection.

## Model lifecycle

Both models will reuse an existing compiled Mongoose model when Next.js reloads modules during development. This prevents model overwrite errors without adding a shared model registry abstraction.

Accounts will not be physically deleted by this feature. Future account-management logic will set `status` to `deactivated` so report and claim references remain intact.

## Future data flow

A later registration service will:

1. Validate request data with Zod.
2. Hash the password with bcrypt.
3. Create a `User` with the default `student` role.
4. Create the user's `Profile`.
5. Return a safe response that excludes `passwordHash`.

Duplicate email errors from MongoDB will be translated by the future service layer into a user-friendly conflict response. The models provide validation and indexes but do not implement HTTP error handling.

## Verification

- Confirm representative valid User and Profile documents pass Mongoose validation without writing to Atlas.
- Confirm invalid email, invalid role and missing display name fail validation.
- Confirm the password field is configured with `select: false`.
- Confirm model indexes include unique email and one-profile-per-user constraints.
- Run `npm run lint`.
- Run `npm run build`.
- Run `npm audit`.

## Out of scope

- Registration, login, sessions and Auth.js configuration.
- Password hashing implementation.
- Account-management APIs and administrator role changes.
- Profile pages or forms.
- CampusLocation, ItemReport, Claim and other domain models.
- Writing test users or profiles to MongoDB Atlas.
