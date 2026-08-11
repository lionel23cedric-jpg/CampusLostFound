# Authentication Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure student registration, login, logout and current-user APIs backed by revocable MongoDB sessions and an HttpOnly cookie.

**Architecture:** Thin Next.js Route Handlers delegate to focused authentication modules. Passwords use versioned Node.js scrypt hashes, browsers receive opaque random session tokens, and MongoDB stores only SHA-256 token hashes with explicit expiry checks and a TTL cleanup index. Vitest tests mock database and cookie boundaries so no test reads `.env.local` or writes to Atlas.

**Tech Stack:** Next.js 16.2.12 App Router, TypeScript 5, Node.js 20.9+, MongoDB Atlas, Mongoose 9.9.1, Zod 4.4.3, Vitest.

## Global Constraints

- Implement only the Session model, authentication utilities/services, four authentication API routes and their automated tests.
- Routes are exactly `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout` and `GET /api/auth/me`.
- Registration accepts only `email`, `password` and `displayName`; unknown fields are rejected.
- New accounts always use `role: "student"`, `status: "active"` and `emailVerifiedAt: null`.
- Passwords are 10-128 characters and are never trimmed, logged, returned or stored in plaintext.
- Password hashes use scrypt parameters `N=16384`, `r=8`, `p=1`, `maxmem=64 MiB`, a random 16-byte salt and a 64-byte derived key.
- Raw sessions use 32 random bytes encoded as base64url; MongoDB stores only a SHA-256 hexadecimal hash.
- The cookie is named `clf_session`, has a seven-day lifetime, and uses HttpOnly, SameSite=Lax, Path=/ and Secure only in production.
- Session authorisation must explicitly require `expiresAt > now`; the TTL index is cleanup only.
- Suspended and deactivated users cannot log in; an existing session becomes unauthenticated if its account is no longer active.
- JSON responses never include `passwordHash`, `tokenHash` or the raw session token.
- Automated tests mock database, transactions and cookies; they must not read `.env.local`, connect to Atlas or create Atlas records.
- Do not add pages, email verification or delivery, password reset or changes, third-party/OAuth login, login rate limiting or abuse monitoring, multi-device session-management UI, report APIs or administrator role controls.
- Do not modify the existing database health route or the six existing domain models except where an import is required by new authentication code.
- Preserve `.env.local` as ignored and never inspect or stage it.

---

### Task 1: Vitest Harness and Cryptographic Primitives

**Files:**
- Modify: `web/package.json`
- Modify: `web/package-lock.json`
- Create: `web/vitest.config.ts`
- Create: `web/src/lib/auth/password.test.ts`
- Create: `web/src/lib/auth/password.ts`
- Create: `web/src/lib/auth/token.test.ts`
- Create: `web/src/lib/auth/token.ts`

**Interfaces:**
- Produces: `hashPassword(password: string): Promise<string>`.
- Produces: `verifyPassword(password: string, storedHash: string): Promise<boolean>`.
- Produces: `SESSION_DURATION_SECONDS`, `createSessionToken()`, `hashSessionToken(token)` and `createSessionExpiry(now?)`.
- Later tasks consume these functions without importing Node crypto directly.

- [ ] **Step 1: Install and configure Vitest**

Run from `web/`:

```powershell
npm.cmd install --save-dev vitest
```

Set the `package.json` scripts block to:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run"
}
```

Create `vitest.config.ts`:

```ts
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    clearMocks: true,
    environment: "node",
  },
});
```

Verify the installed runner:

```powershell
npm.cmd exec vitest -- --version
```

Expected: the installed Vitest version is printed and the command exits 0.

- [ ] **Step 2: Write failing password tests**

Create `src/lib/auth/password.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("uses a fresh salt and verifies only the correct password", async () => {
    const first = await hashPassword("correct horse battery staple");
    const second = await hashPassword("correct horse battery staple");

    expect(first).toMatch(/^scrypt\$16384\$8\$1\$[^$]+\$[^$]+$/);
    expect(second).not.toBe(first);
    expect(first).not.toContain("correct horse battery staple");
    await expect(
      verifyPassword("correct horse battery staple", first),
    ).resolves.toBe(true);
    await expect(verifyPassword("wrong password", first)).resolves.toBe(false);
  });

  it.each([
    "",
    "bcrypt$not-scrypt",
    "scrypt$16384$8$1$bad$bad",
    "scrypt$999999$8$1$c2FsdA$a2V5",
  ])("fails safely for malformed stored hash %s", async (storedHash) => {
    await expect(verifyPassword("password", storedHash)).resolves.toBe(false);
  });
});
```

- [ ] **Step 3: Write failing session-token tests**

Create `src/lib/auth/token.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  SESSION_DURATION_SECONDS,
  createSessionExpiry,
  createSessionToken,
  hashSessionToken,
} from "./token";

describe("session token utilities", () => {
  it("creates unpredictable 32-byte base64url tokens", () => {
    const first = createSessionToken();
    const second = createSessionToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });

  it("hashes a token deterministically without retaining the raw value", () => {
    const token = "a".repeat(43);
    const hash = hashSessionToken(token);

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hashSessionToken(token)).toBe(hash);
    expect(hash).not.toContain(token);
  });

  it("sets expiry exactly seven days after the supplied time", () => {
    const now = new Date("2026-08-11T00:00:00.000Z");

    expect(SESSION_DURATION_SECONDS).toBe(604800);
    expect(createSessionExpiry(now).toISOString()).toBe(
      "2026-08-18T00:00:00.000Z",
    );
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

```powershell
npm.cmd test -- src/lib/auth/password.test.ts src/lib/auth/token.test.ts
```

Expected: FAIL because `./password` and `./token` do not exist.

- [ ] **Step 5: Implement the password module**

Create `src/lib/auth/password.ts`:

```ts
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const ALGORITHM = "scrypt";
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const MAX_MEMORY = 64 * 1024 * 1024;
const SALT_LENGTH = 16;
const KEY_LENGTH = 64;

async function deriveKey(password: string, salt: Buffer) {
  return (await scryptAsync(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    maxmem: MAX_MEMORY,
  })) as Buffer;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt);

  return [
    ALGORITHM,
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, cost, blockSize, parallelization, encodedSalt, encodedKey] =
    storedHash.split("$");

  if (
    algorithm !== ALGORITHM ||
    cost !== String(COST) ||
    blockSize !== String(BLOCK_SIZE) ||
    parallelization !== String(PARALLELIZATION) ||
    !encodedSalt ||
    !encodedKey
  ) {
    return false;
  }

  try {
    const salt = Buffer.from(encodedSalt, "base64url");
    const expectedKey = Buffer.from(encodedKey, "base64url");

    if (salt.length !== SALT_LENGTH || expectedKey.length !== KEY_LENGTH) {
      return false;
    }

    const actualKey = await deriveKey(password, salt);
    return timingSafeEqual(actualKey, expectedKey);
  } catch {
    return false;
  }
}
```

- [ ] **Step 6: Implement the token module**

Create `src/lib/auth/token.ts`:

```ts
import { createHash, randomBytes } from "node:crypto";

export const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60;

export function createSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createSessionExpiry(now = new Date()) {
  return new Date(now.getTime() + SESSION_DURATION_SECONDS * 1000);
}
```

- [ ] **Step 7: Run focused tests and lint**

```powershell
npm.cmd test -- src/lib/auth/password.test.ts src/lib/auth/token.test.ts
npm.cmd run lint -- src/lib/auth/password.ts src/lib/auth/password.test.ts src/lib/auth/token.ts src/lib/auth/token.test.ts vitest.config.ts
```

Expected: all tests pass and ESLint exits 0.

- [ ] **Step 8: Commit the harness and crypto primitives**

```powershell
git add web/package.json web/package-lock.json web/vitest.config.ts web/src/lib/auth/password.ts web/src/lib/auth/password.test.ts web/src/lib/auth/token.ts web/src/lib/auth/token.test.ts
git commit -m "feat(auth): add tested password and token utilities" -m "Refs #10"
```

---

### Task 2: Session Persistence Model

**Files:**
- Create: `web/src/models/session.test.ts`
- Create: `web/src/models/session.ts`

**Interfaces:**
- Consumes: 64-character lowercase hexadecimal token hashes from `hashSessionToken`.
- Produces: `sessionSchema`, `Session`, `SessionModel`.
- Later services query Session by `tokenHash` and an explicit `expiresAt: { $gt: now }` condition.

- [ ] **Step 1: Write the failing Session model tests**

Create `src/models/session.test.ts`:

```ts
import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import { SessionModel, sessionSchema } from "./session";

describe("Session model", () => {
  it("validates a complete session", async () => {
    const session = new SessionModel({
      userId: new mongoose.Types.ObjectId(),
      tokenHash: "a".repeat(64),
      expiresAt: new Date("2026-08-18T00:00:00.000Z"),
    });

    await expect(session.validate()).resolves.toBeUndefined();
  });

  it("rejects a malformed token hash", async () => {
    const session = new SessionModel({
      userId: new mongoose.Types.ObjectId(),
      tokenHash: "not-a-sha256-hash",
      expiresAt: new Date("2026-08-18T00:00:00.000Z"),
    });

    await expect(session.validate()).rejects.toMatchObject({
      errors: { tokenHash: expect.anything() },
    });
  });

  it("defines unique token, TTL expiry and user lookup indexes", () => {
    const indexes = sessionSchema.indexes();

    expect(indexes).toEqual(
      expect.arrayContaining([
        [{ tokenHash: 1 }, expect.objectContaining({ unique: true })],
        [
          { expiresAt: 1 },
          expect.objectContaining({ expireAfterSeconds: 0 }),
        ],
        [{ userId: 1 }, expect.any(Object)],
      ]),
    );
  });

  it("hides tokenHash from ordinary query selection", () => {
    expect(sessionSchema.path("tokenHash").options.select).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
npm.cmd test -- src/models/session.test.ts
```

Expected: FAIL because `src/models/session.ts` does not exist.

- [ ] **Step 3: Implement the Session model**

Create `src/models/session.ts`:

```ts
import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

export const sessionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
    tokenHash: {
      type: String,
      required: [true, "Session token hash is required"],
      match: [/^[a-f0-9]{64}$/, "Session token hash must be SHA-256"],
      select: false,
    },
    expiresAt: {
      type: Date,
      required: [true, "Session expiry is required"],
    },
  },
  {
    collection: "sessions",
    timestamps: true,
  },
);

sessionSchema.index({ tokenHash: 1 }, { unique: true });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ userId: 1 });

export type Session = InferSchemaType<typeof sessionSchema>;

export const SessionModel =
  (models.Session as Model<Session> | undefined) ??
  model<Session>("Session", sessionSchema);
```

- [ ] **Step 4: Run focused tests and lint**

```powershell
npm.cmd test -- src/models/session.test.ts
npm.cmd run lint -- src/models/session.ts src/models/session.test.ts
```

Expected: four tests pass and ESLint exits 0.

- [ ] **Step 5: Commit the Session model**

```powershell
git add web/src/models/session.ts web/src/models/session.test.ts
git commit -m "feat(auth): add revocable session model" -m "Refs #10"
```

---

### Task 3: Authentication Input, Error and Public-User Contracts

**Files:**
- Create: `web/src/lib/auth/validation.test.ts`
- Create: `web/src/lib/auth/validation.ts`
- Create: `web/src/lib/auth/errors.test.ts`
- Create: `web/src/lib/auth/errors.ts`
- Create: `web/src/lib/auth/public-user.test.ts`
- Create: `web/src/lib/auth/public-user.ts`

**Interfaces:**
- Produces: strict `registerSchema`, `loginSchema`, `RegisterInput` and `LoginInput`.
- Produces: `AuthError`, `AuthErrorCode`, `invalidRequestResponse(error?)` and `authErrorResponse(error)`.
- Produces: `toPublicUser(user, profile)` and `PublicUser`; this is the only mapper authentication routes use for user JSON.

- [ ] **Step 1: Write failing validation tests**

Create `src/lib/auth/validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { loginSchema, registerSchema } from "./validation";

describe("authentication validation", () => {
  it("normalises a valid registration", () => {
    expect(
      registerSchema.parse({
        email: "  STUDENT@EXAMPLE.COM ",
        password: "a secure password",
        displayName: "  Student Name  ",
      }),
    ).toEqual({
      email: "student@example.com",
      password: "a secure password",
      displayName: "Student Name",
    });
  });

  it("rejects short passwords and privileged fields", () => {
    expect(
      registerSchema.safeParse({
        email: "student@example.com",
        password: "short",
        displayName: "Student Name",
        role: "administrator",
      }).success,
    ).toBe(false);
  });

  it("normalises login email but preserves password whitespace", () => {
    expect(
      loginSchema.parse({
        email: " STUDENT@EXAMPLE.COM ",
        password: "  intentional spaces  ",
      }),
    ).toEqual({
      email: "student@example.com",
      password: "  intentional spaces  ",
    });
  });

  it("rejects unknown login fields", () => {
    expect(
      loginSchema.safeParse({
        email: "student@example.com",
        password: "a secure password",
        rememberForever: true,
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Write failing error-response tests**

Create `src/lib/auth/errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { registerSchema } from "./validation";
import {
  AuthError,
  authErrorResponse,
  invalidRequestResponse,
} from "./errors";

describe("authentication errors", () => {
  it("returns field details for a Zod validation error", async () => {
    const parsed = registerSchema.safeParse({});
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("Expected invalid registration");

    const response = invalidRequestResponse(parsed.error);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request",
        fields: {
          email: expect.any(Array),
          password: expect.any(Array),
          displayName: expect.any(Array),
        },
      },
    });
  });

  it("maps known authentication errors", async () => {
    const response = authErrorResponse(
      new AuthError("EMAIL_ALREADY_REGISTERED"),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "EMAIL_ALREADY_REGISTERED",
        message: "Email is already registered",
      },
    });
  });

  it("hides unknown internal errors", async () => {
    const response = authErrorResponse(new Error("mongodb connection text"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "AUTHENTICATION_FAILED",
        message: "Unable to complete authentication request",
      },
    });
  });
});
```

- [ ] **Step 3: Write the failing public-user mapper test**

Create `src/lib/auth/public-user.test.ts`:

```ts
import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import { ProfileModel } from "@/models/profile";
import { UserModel } from "@/models/user";

import { toPublicUser } from "./public-user";

describe("public authentication user", () => {
  it("returns the approved response shape without credential fields", () => {
    const user = new UserModel({
      _id: new mongoose.Types.ObjectId(),
      email: "student@example.com",
      passwordHash: "must-not-leak",
      role: "student",
      status: "active",
    });
    const profile = new ProfileModel({
      userId: user._id,
      displayName: "Student Name",
    });

    const result = toPublicUser(user, profile);

    expect(result).toMatchObject({
      id: user._id.toString(),
      email: "student@example.com",
      role: "student",
      status: "active",
      emailVerifiedAt: null,
      lastLoginAt: null,
      profile: {
        displayName: "Student Name",
        preferredContactMethod: "in_app",
        preferredCampusLocationIds: [],
        notificationSettings: {
          possibleMatches: true,
          claimUpdates: true,
          statusChanges: true,
          handoverInstructions: true,
        },
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/passwordHash|tokenHash|session/i);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

```powershell
npm.cmd test -- src/lib/auth/validation.test.ts src/lib/auth/errors.test.ts src/lib/auth/public-user.test.ts
```

Expected: FAIL because the three implementation modules do not exist.

- [ ] **Step 5: Implement strict Zod schemas**

Create `src/lib/auth/validation.ts`:

```ts
import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Email must be valid");

const passwordSchema = z
  .string()
  .min(10, "Password must contain at least 10 characters")
  .max(128, "Password must contain at most 128 characters");

export const registerSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
  displayName: z
    .string()
    .trim()
    .min(2, "Display name must contain at least 2 characters")
    .max(80, "Display name must contain at most 80 characters"),
});

export const loginSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
```

- [ ] **Step 6: Implement safe API errors**

Create `src/lib/auth/errors.ts`:

```ts
import { z, type ZodError } from "zod";

const errorDefinitions = {
  INVALID_CREDENTIALS: {
    message: "Invalid email or password",
    status: 401,
  },
  ACCOUNT_UNAVAILABLE: {
    message: "Account is unavailable",
    status: 403,
  },
  EMAIL_ALREADY_REGISTERED: {
    message: "Email is already registered",
    status: 409,
  },
  AUTHENTICATION_REQUIRED: {
    message: "Authentication required",
    status: 401,
  },
  AUTHENTICATION_FAILED: {
    message: "Unable to complete authentication request",
    status: 500,
  },
} as const;

export type AuthErrorCode = keyof typeof errorDefinitions;

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number;

  constructor(code: AuthErrorCode) {
    const definition = errorDefinitions[code];
    super(definition.message);
    this.name = "AuthError";
    this.code = code;
    this.status = definition.status;
  }
}

export function invalidRequestResponse(error?: ZodError) {
  const fields = error ? z.flattenError(error).fieldErrors : undefined;

  return Response.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request",
        ...(fields ? { fields } : {}),
      },
    },
    { status: 400 },
  );
}

export function authErrorResponse(error: unknown) {
  const safeError =
    error instanceof AuthError
      ? error
      : new AuthError("AUTHENTICATION_FAILED");

  return Response.json(
    {
      error: {
        code: safeError.code,
        message: safeError.message,
      },
    },
    { status: safeError.status },
  );
}
```

- [ ] **Step 7: Implement the public-user mapper**

Create `src/lib/auth/public-user.ts`:

```ts
import type { HydratedDocument } from "mongoose";

import type { Profile } from "@/models/profile";
import type { User } from "@/models/user";

export function toPublicUser(
  user: HydratedDocument<User>,
  profile: HydratedDocument<Profile>,
) {
  return {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    profile: {
      displayName: profile.displayName,
      preferredContactMethod: profile.preferredContactMethod,
      preferredCampusLocationIds: profile.preferredCampusLocationIds.map(
        (id) => id.toString(),
      ),
      notificationSettings: {
        possibleMatches: profile.notificationSettings.possibleMatches,
        claimUpdates: profile.notificationSettings.claimUpdates,
        statusChanges: profile.notificationSettings.statusChanges,
        handoverInstructions:
          profile.notificationSettings.handoverInstructions,
      },
    },
  };
}

export type PublicUser = ReturnType<typeof toPublicUser>;
```

- [ ] **Step 8: Run focused tests and lint**

```powershell
npm.cmd test -- src/lib/auth/validation.test.ts src/lib/auth/errors.test.ts src/lib/auth/public-user.test.ts
npm.cmd run lint -- src/lib/auth/validation.ts src/lib/auth/validation.test.ts src/lib/auth/errors.ts src/lib/auth/errors.test.ts src/lib/auth/public-user.ts src/lib/auth/public-user.test.ts
```

Expected: eight tests pass and ESLint exits 0.

- [ ] **Step 9: Commit the authentication contracts**

```powershell
git add web/src/lib/auth/validation.ts web/src/lib/auth/validation.test.ts web/src/lib/auth/errors.ts web/src/lib/auth/errors.test.ts web/src/lib/auth/public-user.ts web/src/lib/auth/public-user.test.ts
git commit -m "feat(auth): define safe authentication contracts" -m "Refs #10"
```

---

### Task 4: Registration, Login and Logout Service

**Files:**
- Create: `web/src/lib/auth/service.test.ts`
- Create: `web/src/lib/auth/service.ts`

**Interfaces:**
- Consumes: `RegisterInput`, `LoginInput`, password/token utilities, User/Profile/Session models and `connectToDatabase`.
- Produces: `AuthResult = { user: PublicUser; sessionToken: string }`.
- Produces: `registerUser(input): Promise<AuthResult>`.
- Produces: `loginUser(input): Promise<AuthResult>`.
- Produces: `logoutUser(rawToken?: string): Promise<void>`.
- Known business failures throw `AuthError`; unexpected persistence failures remain unknown for safe HTTP translation.

- [ ] **Step 1: Write failing service tests**

Create `src/lib/auth/service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/user", () => ({
  UserModel: { create: vi.fn(), findOne: vi.fn() },
}));
vi.mock("@/models/profile", () => ({
  ProfileModel: { create: vi.fn(), findOne: vi.fn() },
}));
vi.mock("@/models/session", () => ({
  SessionModel: { create: vi.fn(), deleteOne: vi.fn() },
}));
vi.mock("./password", () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));
vi.mock("./token", () => ({
  createSessionExpiry: vi.fn(),
  createSessionToken: vi.fn(),
  hashSessionToken: vi.fn(),
}));
vi.mock("./public-user", () => ({ toPublicUser: vi.fn() }));

import { connectToDatabase } from "@/lib/db";
import { ProfileModel } from "@/models/profile";
import { SessionModel } from "@/models/session";
import { UserModel } from "@/models/user";

import { hashPassword, verifyPassword } from "./password";
import { toPublicUser } from "./public-user";
import { loginUser, logoutUser, registerUser } from "./service";
import {
  createSessionExpiry,
  createSessionToken,
  hashSessionToken,
} from "./token";

const safeUser = {
  id: "user-id",
  email: "student@example.com",
  role: "student" as const,
  status: "active" as const,
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Student Name",
    preferredContactMethod: "in_app" as const,
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
};

const transaction = {
  withTransaction: vi.fn(async (work: () => Promise<void>) => work()),
  endSession: vi.fn(),
};

describe("authentication service", () => {
  beforeEach(() => {
    vi.mocked(connectToDatabase).mockResolvedValue({
      startSession: vi.fn().mockResolvedValue(transaction),
    } as never);
    vi.mocked(hashPassword).mockResolvedValue("stored-password-hash");
    vi.mocked(createSessionToken).mockReturnValue("raw-session-token");
    vi.mocked(hashSessionToken).mockReturnValue("a".repeat(64));
    vi.mocked(createSessionExpiry).mockReturnValue(
      new Date("2026-08-18T00:00:00.000Z"),
    );
    vi.mocked(toPublicUser).mockReturnValue(safeUser);
  });

  it("registers User, Profile and Session in one transaction", async () => {
    const user = { _id: "user-id" };
    const profile = { userId: "user-id" };
    vi.mocked(UserModel.create).mockResolvedValue([user] as never);
    vi.mocked(ProfileModel.create).mockResolvedValue([profile] as never);
    vi.mocked(SessionModel.create).mockResolvedValue([] as never);

    await expect(
      registerUser({
        email: "student@example.com",
        password: "a secure password",
        displayName: "Student Name",
      }),
    ).resolves.toEqual({ user: safeUser, sessionToken: "raw-session-token" });

    expect(UserModel.create).toHaveBeenCalledWith(
      [
        {
          email: "student@example.com",
          passwordHash: "stored-password-hash",
          role: "student",
          status: "active",
          emailVerifiedAt: null,
        },
      ],
      { session: transaction },
    );
    expect(SessionModel.create).toHaveBeenCalledWith(
      [
        {
          userId: "user-id",
          tokenHash: "a".repeat(64),
          expiresAt: new Date("2026-08-18T00:00:00.000Z"),
        },
      ],
      { session: transaction },
    );
  });

  it("translates a duplicate-email database error", async () => {
    vi.mocked(UserModel.create).mockRejectedValue(
      Object.assign(new Error("duplicate details"), {
        code: 11000,
        keyPattern: { email: 1 },
      }),
    );

    await expect(
      registerUser({
        email: "student@example.com",
        password: "a secure password",
        displayName: "Student Name",
      }),
    ).rejects.toMatchObject({
      code: "EMAIL_ALREADY_REGISTERED",
      status: 409,
    });
    expect(transaction.endSession).toHaveBeenCalled();
  });

  it("logs in an active account and creates a fresh session", async () => {
    const user = {
      _id: "user-id",
      email: "student@example.com",
      passwordHash: "stored-password-hash",
      status: "active",
      lastLoginAt: null,
      save: vi.fn(),
    };
    const select = vi.fn().mockResolvedValue(user);
    vi.mocked(UserModel.findOne).mockReturnValue({ select } as never);
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(ProfileModel.findOne).mockResolvedValue({ userId: "user-id" } as never);
    vi.mocked(SessionModel.create).mockResolvedValue({} as never);

    await expect(
      loginUser({
        email: "student@example.com",
        password: "a secure password",
      }),
    ).resolves.toEqual({ user: safeUser, sessionToken: "raw-session-token" });

    expect(select).toHaveBeenCalledWith("+passwordHash");
    expect(user.save).toHaveBeenCalled();
    expect(SessionModel.create).toHaveBeenCalledWith({
      userId: "user-id",
      tokenHash: "a".repeat(64),
      expiresAt: new Date("2026-08-18T00:00:00.000Z"),
    });
  });

  it("uses one generic failure for an unknown email or wrong password", async () => {
    const select = vi.fn().mockResolvedValue(null);
    vi.mocked(UserModel.findOne).mockReturnValue({ select } as never);

    await expect(
      loginUser({
        email: "unknown@example.com",
        password: "a secure password",
      }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });

    const user = {
      passwordHash: "stored-password-hash",
      status: "active",
    };
    select.mockResolvedValue(user);
    vi.mocked(verifyPassword).mockResolvedValue(false);

    await expect(
      loginUser({
        email: "student@example.com",
        password: "wrong password",
      }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("rejects a non-active account after password verification", async () => {
    const select = vi.fn().mockResolvedValue({
      passwordHash: "stored-password-hash",
      status: "suspended",
    });
    vi.mocked(UserModel.findOne).mockReturnValue({ select } as never);
    vi.mocked(verifyPassword).mockResolvedValue(true);

    await expect(
      loginUser({
        email: "student@example.com",
        password: "a secure password",
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_UNAVAILABLE" });
  });

  it("revokes only the supplied raw session token", async () => {
    vi.mocked(SessionModel.deleteOne).mockResolvedValue({ deletedCount: 1 } as never);

    await logoutUser("raw-session-token");

    expect(SessionModel.deleteOne).toHaveBeenCalledWith({
      tokenHash: "a".repeat(64),
    });
  });

  it("treats logout without a cookie as an idempotent success", async () => {
    await logoutUser();

    expect(connectToDatabase).not.toHaveBeenCalled();
    expect(SessionModel.deleteOne).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
npm.cmd test -- src/lib/auth/service.test.ts
```

Expected: FAIL because `src/lib/auth/service.ts` does not exist.

- [ ] **Step 3: Implement the authentication service**

Create `src/lib/auth/service.ts`:

```ts
import { connectToDatabase } from "@/lib/db";
import { ProfileModel } from "@/models/profile";
import { SessionModel } from "@/models/session";
import { UserModel } from "@/models/user";

import { AuthError } from "./errors";
import { hashPassword, verifyPassword } from "./password";
import { type PublicUser, toPublicUser } from "./public-user";
import {
  createSessionExpiry,
  createSessionToken,
  hashSessionToken,
} from "./token";
import type { LoginInput, RegisterInput } from "./validation";

export type AuthResult = {
  user: PublicUser;
  sessionToken: string;
};

function isDuplicateEmailError(error: unknown): error is {
  code: 11000;
  keyPattern: { email: 1 };
} {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000 &&
    "keyPattern" in error &&
    typeof error.keyPattern === "object" &&
    error.keyPattern !== null &&
    "email" in error.keyPattern &&
    error.keyPattern.email === 1
  );
}

export async function registerUser(input: RegisterInput): Promise<AuthResult> {
  const passwordHash = await hashPassword(input.password);
  const rawToken = createSessionToken();
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = createSessionExpiry();
  const database = await connectToDatabase();
  const transaction = await database.startSession();
  let result: AuthResult | undefined;

  try {
    await transaction.withTransaction(async () => {
      const [user] = await UserModel.create(
        [
          {
            email: input.email,
            passwordHash,
            role: "student",
            status: "active",
            emailVerifiedAt: null,
          },
        ],
        { session: transaction },
      );
      const [profile] = await ProfileModel.create(
        [{ userId: user._id, displayName: input.displayName }],
        { session: transaction },
      );
      await SessionModel.create(
        [{ userId: user._id, tokenHash, expiresAt }],
        { session: transaction },
      );

      result = { user: toPublicUser(user, profile), sessionToken: rawToken };
    });
  } catch (error) {
    if (isDuplicateEmailError(error)) {
      throw new AuthError("EMAIL_ALREADY_REGISTERED");
    }
    throw error;
  } finally {
    await transaction.endSession();
  }

  if (!result) {
    throw new Error("Authentication transaction did not produce a result");
  }

  return result;
}

export async function loginUser(input: LoginInput): Promise<AuthResult> {
  await connectToDatabase();
  const user = await UserModel.findOne({ email: input.email }).select(
    "+passwordHash",
  );

  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new AuthError("INVALID_CREDENTIALS");
  }

  if (user.status !== "active") {
    throw new AuthError("ACCOUNT_UNAVAILABLE");
  }

  const profile = await ProfileModel.findOne({ userId: user._id });
  if (!profile) {
    throw new Error("Authenticated user profile is missing");
  }

  user.lastLoginAt = new Date();
  await user.save();

  const rawToken = createSessionToken();
  await SessionModel.create({
    userId: user._id,
    tokenHash: hashSessionToken(rawToken),
    expiresAt: createSessionExpiry(),
  });

  return { user: toPublicUser(user, profile), sessionToken: rawToken };
}

export async function logoutUser(rawToken?: string) {
  if (!rawToken) return;

  await connectToDatabase();
  await SessionModel.deleteOne({ tokenHash: hashSessionToken(rawToken) });
}
```

- [ ] **Step 4: Run focused tests and lint**

```powershell
npm.cmd test -- src/lib/auth/service.test.ts
npm.cmd run lint -- src/lib/auth/service.ts src/lib/auth/service.test.ts
```

Expected: seven tests pass and ESLint exits 0.

- [ ] **Step 5: Commit the authentication service**

```powershell
git add web/src/lib/auth/service.ts web/src/lib/auth/service.test.ts
git commit -m "feat(auth): add registration and login service" -m "Refs #10"
```

---

### Task 5: Current-User Resolution and Cookie Boundary

**Files:**
- Create: `web/src/lib/auth/current-user.test.ts`
- Create: `web/src/lib/auth/current-user.ts`
- Create: `web/src/lib/auth/cookie.test.ts`
- Create: `web/src/lib/auth/cookie.ts`

**Interfaces:**
- Consumes: `hashSessionToken`, Session/User/Profile models, `toPublicUser` and Next.js `cookies()`.
- Produces: `getCurrentUser(rawToken?: string): Promise<PublicUser | null>`.
- Produces: `SESSION_COOKIE_NAME`, `readSessionCookie()`, `setSessionCookie(token)` and `clearSessionCookie()`.
- API routes never access `next/headers` or cookie option literals directly.

- [ ] **Step 1: Write failing current-user tests**

Create `src/lib/auth/current-user.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/session", () => ({
  SessionModel: { findOne: vi.fn(), deleteOne: vi.fn() },
}));
vi.mock("@/models/user", () => ({
  UserModel: { findById: vi.fn() },
}));
vi.mock("@/models/profile", () => ({
  ProfileModel: { findOne: vi.fn() },
}));
vi.mock("./token", () => ({ hashSessionToken: vi.fn() }));
vi.mock("./public-user", () => ({ toPublicUser: vi.fn() }));

import { connectToDatabase } from "@/lib/db";
import { ProfileModel } from "@/models/profile";
import { SessionModel } from "@/models/session";
import { UserModel } from "@/models/user";

import { getCurrentUser } from "./current-user";
import { toPublicUser } from "./public-user";
import { hashSessionToken } from "./token";

const safeUser = { id: "user-id", email: "student@example.com" };

describe("current-user resolution", () => {
  beforeEach(() => {
    vi.mocked(connectToDatabase).mockResolvedValue({} as never);
    vi.mocked(hashSessionToken).mockReturnValue("a".repeat(64));
    vi.mocked(toPublicUser).mockReturnValue(safeUser as never);
  });

  it("returns null without touching the database when no cookie exists", async () => {
    await expect(getCurrentUser()).resolves.toBeNull();
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  it("resolves an unexpired session for an active user", async () => {
    const session = { _id: "session-id", userId: "user-id" };
    const user = { _id: "user-id", status: "active" };
    const profile = { userId: "user-id" };
    vi.mocked(SessionModel.findOne).mockResolvedValue(session as never);
    vi.mocked(UserModel.findById).mockResolvedValue(user as never);
    vi.mocked(ProfileModel.findOne).mockResolvedValue(profile as never);

    await expect(getCurrentUser("raw-session-token")).resolves.toEqual(safeUser);

    expect(SessionModel.findOne).toHaveBeenCalledWith({
      tokenHash: "a".repeat(64),
      expiresAt: { $gt: expect.any(Date) },
    });
    expect(toPublicUser).toHaveBeenCalledWith(user, profile);
  });

  it("returns null for an invalid or expired session", async () => {
    vi.mocked(SessionModel.findOne).mockResolvedValue(null);

    await expect(getCurrentUser("invalid-token")).resolves.toBeNull();
    expect(UserModel.findById).not.toHaveBeenCalled();
  });

  it("revokes the session when the account is no longer active", async () => {
    vi.mocked(SessionModel.findOne).mockResolvedValue({
      _id: "session-id",
      userId: "user-id",
    } as never);
    vi.mocked(UserModel.findById).mockResolvedValue({
      _id: "user-id",
      status: "suspended",
    } as never);

    await expect(getCurrentUser("raw-session-token")).resolves.toBeNull();
    expect(SessionModel.deleteOne).toHaveBeenCalledWith({ _id: "session-id" });
  });
});
```

- [ ] **Step 2: Write failing cookie tests**

Create `src/lib/auth/cookie.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import { cookies } from "next/headers";

import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
} from "./cookie";

const get = vi.fn();
const set = vi.fn();

describe("authentication cookie", () => {
  beforeEach(() => {
    vi.mocked(cookies).mockResolvedValue({ get, set } as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reads the raw token from the named cookie", async () => {
    get.mockReturnValue({ value: "raw-session-token" });

    await expect(readSessionCookie()).resolves.toBe("raw-session-token");
    expect(get).toHaveBeenCalledWith("clf_session");
  });

  it("sets a seven-day secure production cookie", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await setSessionCookie("raw-session-token");

    expect(SESSION_COOKIE_NAME).toBe("clf_session");
    expect(set).toHaveBeenCalledWith("clf_session", "raw-session-token", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 604800,
      secure: true,
    });
  });

  it("clears the cookie using the same security boundary", async () => {
    await clearSessionCookie();

    expect(set).toHaveBeenCalledWith(
      "clf_session",
      "",
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
        secure: false,
      }),
    );
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```powershell
npm.cmd test -- src/lib/auth/current-user.test.ts src/lib/auth/cookie.test.ts
```

Expected: FAIL because `current-user.ts` and `cookie.ts` do not exist.

- [ ] **Step 4: Implement current-user resolution**

Create `src/lib/auth/current-user.ts`:

```ts
import { connectToDatabase } from "@/lib/db";
import { ProfileModel } from "@/models/profile";
import { SessionModel } from "@/models/session";
import { UserModel } from "@/models/user";

import { type PublicUser, toPublicUser } from "./public-user";
import { hashSessionToken } from "./token";

export async function getCurrentUser(
  rawToken?: string,
): Promise<PublicUser | null> {
  if (!rawToken) return null;

  await connectToDatabase();
  const session = await SessionModel.findOne({
    tokenHash: hashSessionToken(rawToken),
    expiresAt: { $gt: new Date() },
  });

  if (!session) return null;

  const user = await UserModel.findById(session.userId);
  if (!user || user.status !== "active") {
    await SessionModel.deleteOne({ _id: session._id });
    return null;
  }

  const profile = await ProfileModel.findOne({ userId: user._id });
  if (!profile) {
    await SessionModel.deleteOne({ _id: session._id });
    return null;
  }

  return toPublicUser(user, profile);
}
```

- [ ] **Step 5: Implement the cookie boundary**

Create `src/lib/auth/cookie.ts`:

```ts
import { cookies } from "next/headers";

import { SESSION_DURATION_SECONDS } from "./token";

export const SESSION_COOKIE_NAME = "clf_session";

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function readSessionCookie() {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value;
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}

export async function clearSessionCookie() {
  (await cookies()).set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions(),
    expires: new Date(0),
    maxAge: 0,
  });
}
```

- [ ] **Step 6: Run focused tests and lint**

```powershell
npm.cmd test -- src/lib/auth/current-user.test.ts src/lib/auth/cookie.test.ts
npm.cmd run lint -- src/lib/auth/current-user.ts src/lib/auth/current-user.test.ts src/lib/auth/cookie.ts src/lib/auth/cookie.test.ts
```

Expected: seven tests pass and ESLint exits 0.

- [ ] **Step 7: Commit the current-user and cookie boundary**

```powershell
git add web/src/lib/auth/current-user.ts web/src/lib/auth/current-user.test.ts web/src/lib/auth/cookie.ts web/src/lib/auth/cookie.test.ts
git commit -m "feat(auth): resolve cookie sessions safely" -m "Refs #10"
```

---

### Task 6: Authentication Route Handlers

**Files:**
- Create: `web/src/app/api/auth/auth-routes.test.ts`
- Create: `web/src/app/api/auth/register/route.ts`
- Create: `web/src/app/api/auth/login/route.ts`
- Create: `web/src/app/api/auth/logout/route.ts`
- Create: `web/src/app/api/auth/me/route.ts`

**Interfaces:**
- Consumes: validation schemas, service functions, current-user resolver, cookie boundary and safe error responses.
- Produces the four exact HTTP routes in Global Constraints.
- Register and login return `{ user: PublicUser }`; the session token is sent only through `setSessionCookie`.
- Logout returns an empty HTTP 204 response; `/me` returns 401 when no active user resolves.

- [ ] **Step 1: Write failing route contract tests**

Create `src/app/api/auth/auth-routes.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/service", () => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  logoutUser: vi.fn(),
}));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth/cookie", () => ({
  readSessionCookie: vi.fn(),
  setSessionCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
}));

import {
  clearSessionCookie,
  readSessionCookie,
  setSessionCookie,
} from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import { loginUser, logoutUser, registerUser } from "@/lib/auth/service";

import { POST as loginPost } from "./login/route";
import { POST as logoutPost } from "./logout/route";
import { GET as meGet } from "./me/route";
import { POST as registerPost } from "./register/route";

const safeUser = {
  id: "user-id",
  email: "student@example.com",
  role: "student" as const,
  status: "active" as const,
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Student Name",
    preferredContactMethod: "in_app" as const,
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
};

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("authentication routes", () => {
  beforeEach(() => {
    vi.mocked(readSessionCookie).mockResolvedValue("raw-session-token");
    vi.mocked(setSessionCookie).mockResolvedValue(undefined);
    vi.mocked(clearSessionCookie).mockResolvedValue(undefined);
    vi.mocked(logoutUser).mockResolvedValue(undefined);
  });

  it("registers a student, sets the cookie and returns only safe user data", async () => {
    vi.mocked(registerUser).mockResolvedValue({
      user: safeUser,
      sessionToken: "raw-session-token",
    });

    const response = await registerPost(
      jsonRequest("http://localhost/api/auth/register", {
        email: "student@example.com",
        password: "a secure password",
        displayName: "Student Name",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(setSessionCookie).toHaveBeenCalledWith("raw-session-token");
    expect(body).toEqual({ user: safeUser });
    expect(JSON.stringify(body)).not.toMatch(
      /passwordHash|tokenHash|raw-session-token/,
    );
  });

  it("rejects privileged registration input before calling the service", async () => {
    const response = await registerPost(
      jsonRequest("http://localhost/api/auth/register", {
        email: "student@example.com",
        password: "a secure password",
        displayName: "Student Name",
        role: "administrator",
      }),
    );

    expect(response.status).toBe(400);
    expect(registerUser).not.toHaveBeenCalled();
  });

  it("returns HTTP 400 for malformed JSON", async () => {
    const response = await registerPost(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request",
      },
    });
  });

  it("returns the approved conflict response for duplicate registration", async () => {
    vi.mocked(registerUser).mockRejectedValue(
      new AuthError("EMAIL_ALREADY_REGISTERED"),
    );

    const response = await registerPost(
      jsonRequest("http://localhost/api/auth/register", {
        email: "student@example.com",
        password: "a secure password",
        displayName: "Student Name",
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "EMAIL_ALREADY_REGISTERED",
        message: "Email is already registered",
      },
    });
  });

  it("logs in and maps invalid credentials without exposing details", async () => {
    vi.mocked(loginUser).mockResolvedValueOnce({
      user: safeUser,
      sessionToken: "raw-session-token",
    });

    const success = await loginPost(
      jsonRequest("http://localhost/api/auth/login", {
        email: "student@example.com",
        password: "a secure password",
      }),
    );
    expect(success.status).toBe(200);
    await expect(success.json()).resolves.toEqual({ user: safeUser });

    vi.mocked(loginUser).mockRejectedValueOnce(
      new AuthError("INVALID_CREDENTIALS"),
    );
    const failure = await loginPost(
      jsonRequest("http://localhost/api/auth/login", {
        email: "student@example.com",
        password: "wrong password",
      }),
    );
    expect(failure.status).toBe(401);
    await expect(failure.json()).resolves.toEqual({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password",
      },
    });
  });

  it("returns the current safe user or the approved 401 response", async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(safeUser);
    const success = await meGet();
    expect(success.status).toBe(200);
    await expect(success.json()).resolves.toEqual({ user: safeUser });

    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    const failure = await meGet();
    expect(failure.status).toBe(401);
    await expect(failure.json()).resolves.toEqual({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Authentication required",
      },
    });
  });

  it("logs out idempotently, clears the cookie and returns no body", async () => {
    const response = await logoutPost();

    expect(readSessionCookie).toHaveBeenCalled();
    expect(clearSessionCookie).toHaveBeenCalled();
    expect(logoutUser).toHaveBeenCalledWith("raw-session-token");
    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe("");
  });

  it("clears the browser cookie even when session deletion fails", async () => {
    vi.mocked(logoutUser).mockRejectedValue(new Error("database unavailable"));

    const response = await logoutPost();

    expect(clearSessionCookie).toHaveBeenCalled();
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "AUTHENTICATION_FAILED" },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```powershell
npm.cmd test -- src/app/api/auth/auth-routes.test.ts
```

Expected: FAIL because the four route modules do not exist.

- [ ] **Step 3: Implement the registration route**

Create `src/app/api/auth/register/route.ts`:

```ts
import { z } from "zod";

import { setSessionCookie } from "@/lib/auth/cookie";
import {
  authErrorResponse,
  invalidRequestResponse,
} from "@/lib/auth/errors";
import { registerUser } from "@/lib/auth/service";
import { registerSchema } from "@/lib/auth/validation";

export async function POST(request: Request) {
  try {
    const input = registerSchema.parse(await request.json());
    const result = await registerUser(input);
    await setSessionCookie(result.sessionToken);
    return Response.json({ user: result.user }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return invalidRequestResponse(
        error instanceof z.ZodError ? error : undefined,
      );
    }
    return authErrorResponse(error);
  }
}
```

- [ ] **Step 4: Implement the login route**

Create `src/app/api/auth/login/route.ts`:

```ts
import { z } from "zod";

import { setSessionCookie } from "@/lib/auth/cookie";
import {
  authErrorResponse,
  invalidRequestResponse,
} from "@/lib/auth/errors";
import { loginUser } from "@/lib/auth/service";
import { loginSchema } from "@/lib/auth/validation";

export async function POST(request: Request) {
  try {
    const input = loginSchema.parse(await request.json());
    const result = await loginUser(input);
    await setSessionCookie(result.sessionToken);
    return Response.json({ user: result.user });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return invalidRequestResponse(
        error instanceof z.ZodError ? error : undefined,
      );
    }
    return authErrorResponse(error);
  }
}
```

- [ ] **Step 5: Implement the current-user route**

Create `src/app/api/auth/me/route.ts`:

```ts
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError, authErrorResponse } from "@/lib/auth/errors";

export async function GET() {
  try {
    const user = await getCurrentUser(await readSessionCookie());
    if (!user) {
      throw new AuthError("AUTHENTICATION_REQUIRED");
    }

    return Response.json({ user });
  } catch (error) {
    return authErrorResponse(error);
  }
}
```

- [ ] **Step 6: Implement the logout route**

Create `src/app/api/auth/logout/route.ts`:

```ts
import {
  clearSessionCookie,
  readSessionCookie,
} from "@/lib/auth/cookie";
import { authErrorResponse } from "@/lib/auth/errors";
import { logoutUser } from "@/lib/auth/service";

export async function POST() {
  try {
    const rawToken = await readSessionCookie();
    await clearSessionCookie();
    await logoutUser(rawToken);
    return new Response(null, { status: 204 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
```

- [ ] **Step 7: Run focused route tests and lint**

```powershell
npm.cmd test -- src/app/api/auth/auth-routes.test.ts
npm.cmd run lint -- src/app/api/auth/auth-routes.test.ts src/app/api/auth/register/route.ts src/app/api/auth/login/route.ts src/app/api/auth/logout/route.ts src/app/api/auth/me/route.ts
```

Expected: eight tests pass and ESLint exits 0.

- [ ] **Step 8: Commit the four route handlers**

```powershell
git add web/src/app/api/auth/auth-routes.test.ts web/src/app/api/auth/register/route.ts web/src/app/api/auth/login/route.ts web/src/app/api/auth/logout/route.ts web/src/app/api/auth/me/route.ts
git commit -m "feat(auth): add authentication API routes" -m "Refs #10"
```

---

### Task 7: Full Regression, Security and Scope Verification

**Files:**
- Review: `web/package.json`
- Review: `web/vitest.config.ts`
- Review: `web/src/models/session.ts`
- Review: `web/src/lib/auth/`
- Review: `web/src/app/api/auth/`
- Review: `docs/superpowers/specs/2026-08-11-authentication-backend-design.md`

**Interfaces:**
- Consumes all Task 1-6 deliverables.
- Produces a clean, reviewable Issue #10 branch with test evidence and no Atlas test records.

- [ ] **Step 1: Run the complete automated test suite**

```powershell
npm.cmd test
```

Expected: all password, token, model, contract, service, cookie, current-user and route tests pass in non-watch mode.

- [ ] **Step 2: Run full lint**

```powershell
npm.cmd run lint
```

Expected: exit code 0 with no ESLint errors or warnings.

- [ ] **Step 3: Run the production build**

```powershell
npm.cmd run build
```

Expected: Next.js compilation and TypeScript checks succeed. The build route table includes dynamic routes for `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/register` and the existing `/api/health/database`.

- [ ] **Step 4: Run the dependency security audit**

```powershell
npm.cmd audit
```

Expected: `found 0 vulnerabilities`.

- [ ] **Step 5: Verify credential safety and branch scope**

Run from the repository root:

```powershell
git status --short --ignored web/.env.local
git diff --check
git diff --name-status develop...HEAD
git diff --stat develop...HEAD
git log --oneline develop..HEAD
```

Expected ignored-secret result:

```text
!! web/.env.local
```

The branch may contain only:

- The approved authentication design and implementation plan.
- `web/package.json` and `web/package-lock.json` changes required for Vitest.
- `web/vitest.config.ts`.
- The new Session model and its tests.
- New files under `web/src/lib/auth/`.
- The four authentication route files and their route test.

No existing health route, report model, User/Profile schema, page or environment file may be changed.

- [ ] **Step 6: Push only after user approval**

```powershell
git push -u origin feature/issue-10-authentication-backend
```

The pull request targets `develop`, lists test/lint/build/audit evidence and ends with `Closes #10`.
