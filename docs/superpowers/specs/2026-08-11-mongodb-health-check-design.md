# MongoDB Database Health Check Design

## Goal

Verify that the Next.js application can securely connect to the existing MongoDB Atlas cluster.

## Architecture

Add a server-only GET endpoint at `/api/health/database`.

The endpoint will reuse `connectToDatabase()` from `web/src/lib/db.ts`. That module reads `MONGODB_URI` through the existing validated server environment configuration.

## API behaviour

- Return HTTP 200 with `{ "status": "ok" }` when MongoDB is available.
- Return HTTP 503 with `{ "status": "error" }` when MongoDB is unavailable.
- Do not return the connection string, credentials, stack trace, or raw database error.

## Security

The real connection string remains only in `web/.env.local`. Git must continue to ignore this file. The committed `.env.example` must contain placeholders only.

## Verification

- Confirm `.env.local` is ignored by Git.
- Start the development server and request `/api/health/database`.
- Run `npm run lint`.
- Run `npm run build`.
- Run `npm audit`.

## Out of scope

This change will not add database models, authentication, seed data, or user-facing database status components.