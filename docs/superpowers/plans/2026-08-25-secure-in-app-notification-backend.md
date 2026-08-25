# Secure In-App Notification Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent, preference-aware, privacy-safe in-app notification backend that commits Claim lifecycle notifications atomically and exposes an owner-isolated unread API.

**Architecture:** Add a focused `lib/notifications` boundary for public contracts, strict transport validation, safe errors, transactional delivery, and recipient-owned reads. Existing claimant and staff Claim services remain transaction owners and pass typed event plans to the delivery helper. Two thin App Router endpoints authenticate first, then expose cursor-paginated reads and idempotent single-notification read updates.

**Tech Stack:** Next.js 16 App Router, TypeScript 5, Mongoose 9, Zod 4, Vitest 4, MongoDB transactions, and the repository's existing cookie-session authentication.

## Global Constraints

- Persist only structured notification state: `recipientId`, `kind`, `reportId`, `claimId`, `eventKey`, `readAt`, and timestamps.
- Supported kinds are exactly `claim_received`, `claim_withdrawn`, `claim_approved`, `claim_rejected`, `claim_handover_ready`, `claim_completed`, and `report_recovered`.
- Respect `claimUpdates`, `statusChanges`, and `handoverInstructions`; do not use `possibleMatches` in this issue.
- Deliver only to an existing active User with an existing Profile and an enabled mapped preference.
- Treat a missing User, inactive User, missing Profile, or disabled preference as a privacy-safe skip.
- Once a recipient is eligible, notification write failure must fail the Claim transaction.
- All Claim-originated notification writes use the caller's existing `ClientSession`; delivery never opens or commits a transaction.
- Use deterministic versioned `eventKey` values and `$setOnInsert` upserts to tolerate transaction callback retries.
- Never persist or return free-form messages, actor identity, reporter identity, claimant identity, emails, contact preferences, review notes, verification data, internal match counts, or raw errors.
- Generate title, summary, action label, and action path from an exhaustive server-owned kind mapping.
- `GET /api/notifications` returns only the active current user's records, defaults to 20 entries, caps at 50, and uses a strict opaque Base64URL seek cursor.
- `PATCH /api/notifications/{id}/read` accepts no body or `{}`, filters by `_id` and `recipientId`, preserves the first `readAt`, and is idempotent.
- A missing notification and another user's notification both return the same `404` response.
- Add no runtime dependency, frontend, email/SMS/push channel, WebSocket, background job, possible-match delivery, persisted Match, mark-all-read, deletion, or retention policy.
- Tests mock models, sessions, and database access; they never read `.env.local` or connect to the real Atlas cluster.
- Do not modify `.env.local`, `package.json`, or `package-lock.json`.

---

## File map

- Create `web/src/models/notification.ts`: notification kinds, persisted schema, model, defaults, validation, and indexes.
- Create `web/src/models/notification.test.ts`: model validation, defaults, enum, index, and timestamp tests.
- Create `web/src/lib/notifications/contracts.ts`: strict public schema, safe static copy/action map, record mapping, and page types.
- Create `web/src/lib/notifications/contracts.test.ts`: exhaustive mapping, strict schema, privacy, date, and action tests.
- Create `web/src/lib/notifications/validation.ts`: route ID, empty body, list query, canonical cursor decoding, and cursor encoding.
- Create `web/src/lib/notifications/validation.test.ts`: cursor round-trip and malformed/duplicate/unknown query tests.
- Create `web/src/lib/notifications/errors.ts`: closed error union plus safe validation and operation responses.
- Create `web/src/lib/notifications/errors.test.ts`: authentication preservation, known error, unknown error, and redaction tests.
- Create `web/src/lib/notifications/request-body.ts`: bounded, fatal-UTF-8 body reader for the PATCH route.
- Create `web/src/lib/notifications/request-body.test.ts`: empty, bounded, oversized, invalid UTF-8, and failed-stream tests.
- Create `web/src/lib/notifications/delivery.ts`: event plan type, preference mapping, recipient eligibility, deterministic keys, and transactional idempotent bulk upserts.
- Create `web/src/lib/notifications/delivery.test.ts`: mapping, skip, deduplication, session, bulk operation, and failure tests.
- Modify `web/src/lib/claims/claimant-service.ts`: expose report owner internally and plan create/withdraw events in existing transactions.
- Modify `web/src/lib/claims/claimant-service.test.ts`: claimant transition notification and rollback ordering tests.
- Modify `web/src/lib/claims/staff-service.ts`: plan decision, competing rejection, handover, completion, and report recovery events.
- Modify `web/src/lib/claims/staff-service.test.ts`: staff transition batches, competing update count, session, and failure tests.
- Create `web/src/lib/notifications/service.ts`: active-user gate, stable seek pagination, unread count, and atomic idempotent read update.
- Create `web/src/lib/notifications/service.test.ts`: permission, ownership, pagination, unread, idempotency, and error tests.
- Create `web/src/app/api/notifications/route.ts`: authenticated GET route with strict query handling and no-store response.
- Create `web/src/app/api/notifications/[id]/read/route.ts`: authenticated PATCH route with safe parameter/body handling and no-store response.
- Create `web/src/app/api/notifications/notification-routes.test.ts`: route ordering, validation, privacy, response, and cache tests.
- Create `docs/superpowers/verification/2026-08-25-secure-in-app-notification-backend.md`: final focused/full verification evidence and privacy statement.

### Task 1: Persisted Notification model

**Files:**
- Create: `web/src/models/notification.test.ts`
- Create: `web/src/models/notification.ts`

**Interfaces:**
- Consumes: Mongoose `Schema.Types.ObjectId`, timestamps, and the existing model-registration pattern.
- Produces: `NOTIFICATION_KINDS`, `NotificationKind`, `notificationSchema`, `Notification`, and `NotificationModel`.

- [ ] **Step 1: Write the failing model tests**

Create `web/src/models/notification.test.ts`:

```ts
import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_KINDS,
  NotificationModel,
  notificationSchema,
} from "./notification";

const recipientId = new mongoose.Types.ObjectId();
const reportId = new mongoose.Types.ObjectId();
const claimId = new mongoose.Types.ObjectId();

function validNotification() {
  return {
    recipientId,
    reportId,
    claimId,
    kind: "claim_approved",
    eventKey: `notification:v1:claim_approved:${claimId}:${recipientId}`,
  };
}

describe("Notification model", () => {
  it("applies an unread default", async () => {
    const notification = new NotificationModel(validNotification());
    await expect(notification.validate()).resolves.toBeUndefined();
    expect(notification.readAt).toBeNull();
  });

  it.each(NOTIFICATION_KINDS)("accepts kind %s", async (kind) => {
    const notification = new NotificationModel({
      ...validNotification(),
      kind,
      eventKey: `notification:v1:${kind}:${claimId}:${recipientId}`,
    });
    await expect(notification.validate()).resolves.toBeUndefined();
  });

  it("rejects an unknown kind", async () => {
    const notification = new NotificationModel({
      ...validNotification(),
      kind: "private_staff_message",
    });
    await expect(notification.validate()).rejects.toMatchObject({
      errors: { kind: expect.anything() },
    });
  });

  it("requires recipient, report, claim, kind and event key", async () => {
    const notification = new NotificationModel({});
    await expect(notification.validate()).rejects.toMatchObject({
      errors: {
        recipientId: expect.anything(),
        reportId: expect.anything(),
        claimId: expect.anything(),
        kind: expect.anything(),
        eventKey: expect.anything(),
      },
    });
  });

  it("trims and bounds event keys", async () => {
    const trimmed = new NotificationModel({
      ...validNotification(),
      eventKey: "  notification:v1:test  ",
    });
    await expect(trimmed.validate()).resolves.toBeUndefined();
    expect(trimmed.eventKey).toBe("notification:v1:test");

    const oversized = new NotificationModel({
      ...validNotification(),
      eventKey: "x".repeat(201),
    });
    await expect(oversized.validate()).rejects.toMatchObject({
      errors: { eventKey: expect.anything() },
    });
  });

  it("defines recipient seek, unread and unique event indexes", () => {
    expect(notificationSchema.indexes()).toEqual(
      expect.arrayContaining([
        [
          { recipientId: 1, createdAt: -1, _id: -1 },
          expect.any(Object),
        ],
        [{ recipientId: 1, readAt: 1 }, expect.any(Object)],
        [
          { eventKey: 1 },
          expect.objectContaining({ unique: true }),
        ],
      ]),
    );
    expect(notificationSchema.indexes()).toHaveLength(3);
  });

  it("enables timestamps", () => {
    expect(notificationSchema.get("timestamps")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the model test to verify the red state**

Run from `web/`:

```powershell
npm.cmd test -- src/models/notification.test.ts
```

Expected: FAIL because `./notification` does not exist.

- [ ] **Step 3: Implement the minimal model**

Create `web/src/models/notification.ts`:

```ts
import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

export const NOTIFICATION_KINDS = [
  "claim_received",
  "claim_withdrawn",
  "claim_approved",
  "claim_rejected",
  "claim_handover_ready",
  "claim_completed",
  "report_recovered",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const notificationSchema = new Schema(
  {
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    kind: {
      type: String,
      enum: NOTIFICATION_KINDS,
      required: true,
    },
    reportId: {
      type: Schema.Types.ObjectId,
      ref: "ItemReport",
      required: true,
    },
    claimId: {
      type: Schema.Types.ObjectId,
      ref: "Claim",
      required: true,
    },
    eventKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    readAt: { type: Date, default: null },
  },
  { collection: "notifications", timestamps: true },
);

notificationSchema.index({ recipientId: 1, createdAt: -1, _id: -1 });
notificationSchema.index({ recipientId: 1, readAt: 1 });
notificationSchema.index({ eventKey: 1 }, { unique: true });

export type Notification = InferSchemaType<typeof notificationSchema>;
export const NotificationModel =
  (models.Notification as Model<Notification> | undefined) ??
  model<Notification>("Notification", notificationSchema);
```

- [ ] **Step 4: Run the model test to verify the green state**

Run:

```powershell
npm.cmd test -- src/models/notification.test.ts
```

Expected: PASS with all Notification model cases green.

- [ ] **Step 5: Commit the model boundary**

```powershell
git add web/src/models/notification.ts web/src/models/notification.test.ts
git commit -m "feat(notifications): add persisted notification model"
```

### Task 2: Strict public contracts and static copy

**Files:**
- Create: `web/src/lib/notifications/contracts.test.ts`
- Create: `web/src/lib/notifications/contracts.ts`

**Interfaces:**
- Consumes: `NOTIFICATION_KINDS` and `NotificationKind` from Task 1 plus validated internal record values.
- Produces: `NotificationRecord`, `PublicNotification`, `NotificationPage`, `publicNotificationSchema`, `notificationPageSchema`, and `toPublicNotification(record)`.

- [ ] **Step 1: Write the failing public-contract tests**

Create `web/src/lib/notifications/contracts.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { NOTIFICATION_KINDS } from "@/models/notification";

import {
  notificationPageSchema,
  publicNotificationSchema,
  toPublicNotification,
  type NotificationRecord,
} from "./contracts";

const reportId = "64b64c6f2f4d9f1a2b3c4d52";
const claimId = "64b64c6f2f4d9f1a2b3c4d53";
const createdAt = new Date("2026-08-25T06:00:00.000Z");

function identifier(value: string) {
  return { toString: () => value };
}

function record(
  kind: (typeof NOTIFICATION_KINDS)[number],
  readAt: Date | null = null,
): NotificationRecord {
  return {
    _id: identifier("64b64c6f2f4d9f1a2b3c4d54"),
    kind,
    reportId: identifier(reportId),
    claimId: identifier(claimId),
    readAt,
    createdAt,
  };
}

describe("notification public contracts", () => {
  it.each(NOTIFICATION_KINDS)("maps %s through controlled copy", (kind) => {
    const mapped = toPublicNotification(record(kind));
    expect(publicNotificationSchema.parse(mapped)).toEqual(mapped);
    expect(mapped.kind).toBe(kind);
    expect(mapped.title.length).toBeGreaterThan(0);
    expect(mapped.summary.length).toBeGreaterThan(0);
    expect(mapped.action.label.length).toBeGreaterThan(0);
    expect(mapped.action.href).toMatch(/^\/(claims|reports)\/[a-f\d]{24}$/);
    expect(mapped.isRead).toBe(false);
    expect(mapped.readAt).toBeNull();
  });

  it("uses report links for owner events and claim links for claimant events", () => {
    expect(toPublicNotification(record("claim_received")).action.href).toBe(
      `/reports/${reportId}`,
    );
    expect(toPublicNotification(record("claim_withdrawn")).action.href).toBe(
      `/reports/${reportId}`,
    );
    expect(toPublicNotification(record("report_recovered")).action.href).toBe(
      `/reports/${reportId}`,
    );
    expect(toPublicNotification(record("claim_approved")).action.href).toBe(
      `/claims/${claimId}`,
    );
  });

  it("preserves read time and derives a consistent read flag", () => {
    const readAt = new Date("2026-08-25T06:05:00.000Z");
    expect(toPublicNotification(record("claim_completed", readAt))).toMatchObject({
      readAt: readAt.toISOString(),
      isRead: true,
    });
  });

  it("rejects private extras and inconsistent read state", () => {
    const mapped = toPublicNotification(record("claim_rejected"));
    expect(
      publicNotificationSchema.safeParse({
        ...mapped,
        claimantId: "PRIVATE-CLAIMANT",
      }).success,
    ).toBe(false);
    expect(
      publicNotificationSchema.safeParse({ ...mapped, isRead: true }).success,
    ).toBe(false);
  });

  it("validates an empty page without leaking internal fields", () => {
    const page = notificationPageSchema.parse({
      notifications: [],
      pagination: { nextCursor: null, hasMore: false },
      unreadCount: 0,
    });
    expect(page).toEqual({
      notifications: [],
      pagination: { nextCursor: null, hasMore: false },
      unreadCount: 0,
    });
    expect(JSON.stringify(page)).not.toMatch(
      /recipientId|claimantId|reporterId|reviewNote|verification|email/,
    );
  });
});
```

- [ ] **Step 2: Run the contract test to verify the red state**

Run:

```powershell
npm.cmd test -- src/lib/notifications/contracts.test.ts
```

Expected: FAIL because `./contracts` does not exist.

- [ ] **Step 3: Implement strict schemas and the exhaustive mapping**

Create `web/src/lib/notifications/contracts.ts` with a complete mapping for every kind:

```ts
import { z } from "zod";

import {
  NOTIFICATION_KINDS,
  type NotificationKind,
} from "@/models/notification";

type Identifier = { toString(): string };

export type NotificationRecord = {
  _id: Identifier;
  kind: NotificationKind;
  reportId: Identifier;
  claimId: Identifier;
  readAt: Date | null;
  createdAt: Date;
};

const content = {
  claim_received: {
    title: "New claim received",
    summary: "A claim was submitted for one of your reports.",
    label: "View report",
    target: "report",
  },
  claim_withdrawn: {
    title: "Claim withdrawn",
    summary: "A claim on one of your reports was withdrawn.",
    label: "View report",
    target: "report",
  },
  claim_approved: {
    title: "Claim approved",
    summary: "Campus staff approved your claim.",
    label: "View claim",
    target: "claim",
  },
  claim_rejected: {
    title: "Claim not approved",
    summary: "Campus staff did not approve your claim.",
    label: "View claim",
    target: "claim",
  },
  claim_handover_ready: {
    title: "Recovery handover ready",
    summary: "Review your approved claim before arranging recovery with campus staff.",
    label: "View claim",
    target: "claim",
  },
  claim_completed: {
    title: "Recovery completed",
    summary: "Campus staff marked your recovery as completed.",
    label: "View claim",
    target: "claim",
  },
  report_recovered: {
    title: "Report resolved",
    summary: "Recovery for one of your reports was completed.",
    label: "View report",
    target: "report",
  },
} as const satisfies Record<
  NotificationKind,
  {
    title: string;
    summary: string;
    label: string;
    target: "claim" | "report";
  }
>;

export const publicNotificationSchema = z
  .strictObject({
    id: z.string().regex(/^[a-f\d]{24}$/),
    kind: z.enum(NOTIFICATION_KINDS),
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(240),
    action: z.strictObject({
      label: z.string().min(1).max(40),
      href: z.string().regex(/^\/(claims|reports)\/[a-f\d]{24}$/),
    }),
    createdAt: z.string().datetime({ offset: true }),
    readAt: z.string().datetime({ offset: true }).nullable(),
    isRead: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.isRead !== (value.readAt !== null)) {
      context.addIssue({
        code: "custom",
        path: ["isRead"],
        message: "Read state is inconsistent",
      });
    }
  });

export const notificationPageSchema = z.strictObject({
  notifications: z.array(publicNotificationSchema).max(50),
  pagination: z.strictObject({
    nextCursor: z.string().min(1).max(512).nullable(),
    hasMore: z.boolean(),
  }),
  unreadCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

export type PublicNotification = z.infer<typeof publicNotificationSchema>;
export type NotificationPage = z.infer<typeof notificationPageSchema>;

export function toPublicNotification(
  record: NotificationRecord,
): PublicNotification {
  const copy = content[record.kind];
  const targetId =
    copy.target === "report"
      ? record.reportId.toString()
      : record.claimId.toString();
  const readAt = record.readAt?.toISOString() ?? null;

  return publicNotificationSchema.parse({
    id: record._id.toString(),
    kind: record.kind,
    title: copy.title,
    summary: copy.summary,
    action: {
      label: copy.label,
      href: `/${copy.target}s/${targetId}`,
    },
    createdAt: record.createdAt.toISOString(),
    readAt,
    isRead: readAt !== null,
  });
}
```

- [ ] **Step 4: Run the contract tests to verify the green state**

Run:

```powershell
npm.cmd test -- src/lib/notifications/contracts.test.ts
```

Expected: PASS for all seven kinds, actions, read invariants, strictness, and empty-page parsing.

- [ ] **Step 5: Commit the public contract**

```powershell
git add web/src/lib/notifications/contracts.ts web/src/lib/notifications/contracts.test.ts
git commit -m "feat(notifications): define privacy-safe contracts"
```

### Task 3: Strict transport validation, safe errors, and bounded body reads

**Files:**
- Create: `web/src/lib/notifications/validation.test.ts`
- Create: `web/src/lib/notifications/validation.ts`
- Create: `web/src/lib/notifications/errors.test.ts`
- Create: `web/src/lib/notifications/errors.ts`
- Create: `web/src/lib/notifications/request-body.test.ts`
- Create: `web/src/lib/notifications/request-body.ts`

**Interfaces:**
- Consumes: URL query pairs, notification route IDs, request streams, and `AuthError`.
- Produces: `NotificationCursor`, `NotificationListQuery`, `notificationListQuerySchema`, `notificationIdSchema`, `emptyNotificationBodySchema`, `toNotificationListQueryInput`, `encodeNotificationCursor`, `NotificationError`, `invalidNotificationResponse`, `notificationErrorResponse`, `readNotificationRequestBody`, `NotificationBodyTooLarge`, and `InvalidNotificationBodyEncoding`.

- [ ] **Step 1: Write failing validation tests**

Create `web/src/lib/notifications/validation.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  emptyNotificationBodySchema,
  encodeNotificationCursor,
  notificationIdSchema,
  notificationListQuerySchema,
  toNotificationListQueryInput,
} from "./validation";

const id = "64b64c6f2f4d9f1a2b3c4d54";
const createdAt = new Date("2026-08-25T06:00:00.000Z");

describe("notification validation", () => {
  it("applies the default page size and decodes a canonical cursor", () => {
    expect(notificationListQuerySchema.parse({})).toEqual({ pageSize: 20 });
    const cursor = encodeNotificationCursor({ createdAt, id });
    expect(notificationListQuerySchema.parse({ cursor })).toEqual({
      pageSize: 20,
      cursor: { createdAt, id },
    });
  });

  it.each(["0", "51", "1.5", "01", "value"])(
    "rejects page size %s",
    (pageSize) => {
      expect(notificationListQuerySchema.safeParse({ pageSize }).success).toBe(
        false,
      );
    },
  );

  it.each([
    "not-base64!",
    Buffer.from("{", "utf8").toString("base64url"),
    Buffer.from(JSON.stringify({ createdAt: "invalid", id }), "utf8").toString("base64url"),
    Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id: "bad" }), "utf8").toString("base64url"),
    "a".repeat(513),
  ])("rejects malformed cursor %s", (cursor) => {
    expect(notificationListQuerySchema.safeParse({ cursor }).success).toBe(false);
  });

  it("rejects unknown and duplicate query keys", () => {
    expect(
      notificationListQuerySchema.safeParse(
        toNotificationListQueryInput(
          new URLSearchParams("pageSize=10&pageSize=20"),
        ),
      ).success,
    ).toBe(false);
    expect(
      notificationListQuerySchema.safeParse({ pageSize: "20", owner: "other" })
        .success,
    ).toBe(false);
  });

  it("accepts only canonical ObjectIds and an empty object body", () => {
    expect(notificationIdSchema.parse(id)).toBe(id);
    expect(notificationIdSchema.safeParse(id.toUpperCase()).success).toBe(false);
    expect(emptyNotificationBodySchema.parse({})).toEqual({});
    expect(emptyNotificationBodySchema.safeParse({ readAt: createdAt }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run validation tests to verify the red state**

Run:

```powershell
npm.cmd test -- src/lib/notifications/validation.test.ts
```

Expected: FAIL because `./validation` does not exist.

- [ ] **Step 3: Implement strict query and cursor validation**

Create `web/src/lib/notifications/validation.ts`:

```ts
import { z } from "zod";

const canonicalObjectIdSchema = z.string().regex(/^[a-f\d]{24}$/);
const cursorPayloadSchema = z.strictObject({
  createdAt: z.string().datetime({ offset: true }),
  id: canonicalObjectIdSchema,
});
const positiveInteger = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(50));

export type NotificationCursor = { createdAt: Date; id: string };

const cursorSchema = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/)
  .transform((value, context): NotificationCursor => {
    try {
      const decoded = Buffer.from(value, "base64url").toString("utf8");
      if (Buffer.from(decoded, "utf8").toString("base64url") !== value) {
        throw new Error("Cursor is not canonical");
      }
      const parsed = cursorPayloadSchema.safeParse(JSON.parse(decoded));
      if (!parsed.success) throw new Error("Cursor payload is invalid");
      return {
        createdAt: new Date(parsed.data.createdAt),
        id: parsed.data.id,
      };
    } catch {
      context.addIssue({ code: "custom", message: "Cursor is invalid" });
      return z.NEVER;
    }
  });

export const notificationListQuerySchema = z.strictObject({
  pageSize: positiveInteger.default(20),
  cursor: cursorSchema.optional(),
});
export type NotificationListQuery = z.output<
  typeof notificationListQuerySchema
>;

export const notificationIdSchema = canonicalObjectIdSchema;
export const emptyNotificationBodySchema = z.strictObject({});

export function encodeNotificationCursor(cursor: NotificationCursor) {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
    }),
    "utf8",
  ).toString("base64url");
}

export function toNotificationListQueryInput(searchParams: URLSearchParams) {
  const input: Record<string, string | string[]> = {};
  for (const [key, value] of searchParams) {
    const current = input[key];
    input[key] =
      current === undefined
        ? value
        : Array.isArray(current)
          ? [...current, value]
          : [current, value];
  }
  return input;
}
```

- [ ] **Step 4: Write failing error and request-body tests**

Create `web/src/lib/notifications/errors.test.ts` with these exact assertions:

```ts
import { describe, expect, it } from "vitest";

import { AuthError } from "@/lib/auth/errors";

import {
  NotificationError,
  invalidNotificationResponse,
  notificationErrorResponse,
} from "./errors";

describe("notification errors", () => {
  it("preserves authentication-required", async () => {
    const response = notificationErrorResponse(
      new AuthError("AUTHENTICATION_REQUIRED"),
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "Authentication required",
      },
    });
  });

  it.each([
    ["NOTIFICATION_FORBIDDEN", 403, "Notification access is not permitted"],
    ["NOTIFICATION_NOT_FOUND", 404, "Notification not found"],
  ] as const)("maps %s", async (code, status, message) => {
    const response = notificationErrorResponse(new NotificationError(code));
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({
      error: { code, message },
    });
  });

  it("redacts unknown errors", async () => {
    const response = notificationErrorResponse(
      new Error("PRIVATE-DATABASE-DETAIL"),
    );
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: "NOTIFICATION_OPERATION_FAILED",
        message: "Notification operation failed",
      },
    });
    expect(JSON.stringify(body)).not.toContain("PRIVATE-DATABASE-DETAIL");
  });

  it("returns one stable validation error", async () => {
    const response = invalidNotificationResponse();
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid notification request",
      },
    });
  });
});
```

Create `web/src/lib/notifications/request-body.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  InvalidNotificationBodyEncoding,
  NOTIFICATION_REQUEST_BODY_LIMIT,
  NotificationBodyTooLarge,
  readNotificationRequestBody,
} from "./request-body";

describe("notification request body", () => {
  it("accepts absent and bounded UTF-8 bodies", async () => {
    await expect(
      readNotificationRequestBody(new Request("http://localhost/read")),
    ).resolves.toBe("");
    await expect(
      readNotificationRequestBody(
        new Request("http://localhost/read", {
          method: "PATCH",
          body: "{}",
        }),
      ),
    ).resolves.toBe("{}");
  });

  it("rejects declared and streamed oversized bodies", async () => {
    await expect(
      readNotificationRequestBody(
        new Request("http://localhost/read", {
          method: "PATCH",
          headers: {
            "content-length": String(NOTIFICATION_REQUEST_BODY_LIMIT + 1),
          },
          body: "{}",
        }),
      ),
    ).rejects.toBeInstanceOf(NotificationBodyTooLarge);
    await expect(
      readNotificationRequestBody(
        new Request("http://localhost/read", {
          method: "PATCH",
          body: "x".repeat(NOTIFICATION_REQUEST_BODY_LIMIT + 1),
        }),
      ),
    ).rejects.toBeInstanceOf(NotificationBodyTooLarge);
  });

  it("rejects invalid UTF-8 and failed streams", async () => {
    await expect(
      readNotificationRequestBody(
        new Request("http://localhost/read", {
          method: "PATCH",
          body: new Blob([new Uint8Array([0xff])]),
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidNotificationBodyEncoding);

    const failed = {
      headers: new Headers(),
      body: new ReadableStream<Uint8Array>({
        pull() {
          throw new Error("PRIVATE-STREAM-FAILURE");
        },
      }),
    } as Request;
    await expect(readNotificationRequestBody(failed)).rejects.toThrow(
      "Notification request body stream failed",
    );
  });
});
```

- [ ] **Step 5: Run the new tests to verify the red state**

Run:

```powershell
npm.cmd test -- src/lib/notifications/validation.test.ts src/lib/notifications/errors.test.ts src/lib/notifications/request-body.test.ts
```

Expected: validation may compile after Step 3, while errors and request-body tests FAIL because their modules do not exist.

- [ ] **Step 6: Implement closed errors and bounded body reading**

Create `web/src/lib/notifications/errors.ts`:

```ts
import { z, type ZodError } from "zod";

import { AuthError, authErrorResponse } from "@/lib/auth/errors";

const definitions = {
  NOTIFICATION_FORBIDDEN: {
    status: 403,
    message: "Notification access is not permitted",
  },
  NOTIFICATION_NOT_FOUND: {
    status: 404,
    message: "Notification not found",
  },
  NOTIFICATION_OPERATION_FAILED: {
    status: 500,
    message: "Notification operation failed",
  },
} as const;

export type NotificationErrorCode = keyof typeof definitions;

export class NotificationError extends Error {
  readonly code: NotificationErrorCode;
  readonly status: number;

  constructor(code: NotificationErrorCode) {
    const definition = definitions[code];
    super(definition.message);
    this.name = "NotificationError";
    this.code = code;
    this.status = definition.status;
  }
}

export function invalidNotificationResponse(error?: ZodError) {
  const fields = error ? z.flattenError(error).fieldErrors : undefined;
  const includeFields = fields && Object.keys(fields).length > 0;
  return Response.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid notification request",
        ...(includeFields ? { fields } : {}),
      },
    },
    { status: 400 },
  );
}

export function notificationErrorResponse(error: unknown) {
  if (
    error instanceof AuthError &&
    error.code === "AUTHENTICATION_REQUIRED"
  ) {
    return authErrorResponse(error);
  }
  const code = error instanceof NotificationError ? error.code : undefined;
  const safe =
    code !== undefined && Object.hasOwn(definitions, code)
      ? new NotificationError(code)
      : new NotificationError("NOTIFICATION_OPERATION_FAILED");
  return Response.json(
    { error: { code: safe.code, message: safe.message } },
    { status: safe.status },
  );
}
```

Create `web/src/lib/notifications/request-body.ts` by using the existing Claim reader's bounded-stream pattern with notification-specific names:

```ts
export const NOTIFICATION_REQUEST_BODY_LIMIT = 16 * 1024;

export class NotificationBodyTooLarge extends Error {
  constructor() {
    super("Notification request body exceeds the size limit");
    this.name = "NotificationBodyTooLarge";
  }
}

export class InvalidNotificationBodyEncoding extends Error {
  constructor() {
    super("Notification request body is not valid UTF-8");
    this.name = "InvalidNotificationBodyEncoding";
  }
}

async function cancelBody(body: ReadableStream<Uint8Array> | null) {
  try {
    await body?.cancel();
  } catch {
    return;
  }
}

export async function readNotificationRequestBody(request: Request) {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    /^\d+$/.test(declaredLength) &&
    Number(declaredLength) > NOTIFICATION_REQUEST_BODY_LIMIT
  ) {
    await cancelBody(request.body);
    throw new NotificationBodyTooLarge();
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let byteLength = 0;
  let text = "";
  try {
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        throw new Error("Notification request body stream failed");
      }
      if (chunk.done) {
        try {
          return text + decoder.decode();
        } catch {
          throw new InvalidNotificationBodyEncoding();
        }
      }
      byteLength += chunk.value.byteLength;
      if (byteLength > NOTIFICATION_REQUEST_BODY_LIMIT) {
        throw new NotificationBodyTooLarge();
      }
      try {
        text += decoder.decode(chunk.value, { stream: true });
      } catch {
        throw new InvalidNotificationBodyEncoding();
      }
    }
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // Preserve the original request-body error classification.
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}
```

- [ ] **Step 7: Run all Task 3 tests and TypeScript**

Run:

```powershell
npm.cmd test -- src/lib/notifications/validation.test.ts src/lib/notifications/errors.test.ts src/lib/notifications/request-body.test.ts
npm.cmd exec -- tsc --noEmit --incremental false
```

Expected: all Task 3 tests PASS and TypeScript exits 0.

- [ ] **Step 8: Commit the transport boundary**

```powershell
git add web/src/lib/notifications/validation.ts web/src/lib/notifications/validation.test.ts web/src/lib/notifications/errors.ts web/src/lib/notifications/errors.test.ts web/src/lib/notifications/request-body.ts web/src/lib/notifications/request-body.test.ts
git commit -m "feat(notifications): validate notification transport"
```

### Task 4: Transactional, preference-aware delivery

**Files:**
- Create: `web/src/lib/notifications/delivery.test.ts`
- Create: `web/src/lib/notifications/delivery.ts`

**Interfaces:**
- Consumes: `NotificationKind`, `NotificationModel`, `UserModel`, `ProfileModel`, and a required caller-owned `ClientSession`.
- Produces: `NotificationPlan`, `createNotificationPlan(input)`, `notificationEventKey(plan)`, and `deliverNotifications(plans, session): Promise<void>`.

- [ ] **Step 1: Write the failing delivery tests**

Create `web/src/lib/notifications/delivery.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/models/notification", () => ({
  NotificationModel: { bulkWrite: vi.fn() },
}));
vi.mock("@/models/profile", () => ({
  ProfileModel: { find: vi.fn() },
}));
vi.mock("@/models/user", () => ({
  UserModel: { find: vi.fn() },
}));

import { NotificationModel } from "@/models/notification";
import { ProfileModel } from "@/models/profile";
import { UserModel } from "@/models/user";

import {
  createNotificationPlan,
  deliverNotifications,
  notificationEventKey,
} from "./delivery";

function identifier(value: string) {
  return { toString: () => value };
}

function queryChain<T>(result: T) {
  const chain = {
    session: vi.fn(),
    lean: vi.fn(),
    exec: vi.fn(async () => result),
  };
  chain.session.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  return chain;
}

const recipientId = "64b64c6f2f4d9f1a2b3c4d51";
const reportId = "64b64c6f2f4d9f1a2b3c4d52";
const claimId = "64b64c6f2f4d9f1a2b3c4d53";
const session = { id: "transaction-session" };
const enabled = {
  possibleMatches: false,
  claimUpdates: true,
  statusChanges: true,
  handoverInstructions: true,
};

function configureRecipients(
  users = [{ _id: identifier(recipientId), status: "active" as const }],
  profiles = [
    {
      userId: identifier(recipientId),
      notificationSettings: enabled,
    },
  ],
) {
  const userQuery = queryChain(users);
  const profileQuery = queryChain(profiles);
  vi.mocked(UserModel.find).mockReturnValue(userQuery as never);
  vi.mocked(ProfileModel.find).mockReturnValue(profileQuery as never);
  return { userQuery, profileQuery };
}

function plan(kind: Parameters<typeof createNotificationPlan>[0]["kind"] = "claim_received") {
  return createNotificationPlan({
    kind,
    recipientId,
    reportId,
    claimId,
  });
}

describe("notification delivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureRecipients();
    vi.mocked(NotificationModel.bulkWrite).mockResolvedValue({} as never);
  });

  it("builds canonical deterministic event keys", () => {
    const created = createNotificationPlan({
      kind: "claim_approved",
      recipientId: recipientId.toUpperCase(),
      reportId: reportId.toUpperCase(),
      claimId: claimId.toUpperCase(),
    });
    expect(created).toEqual({
      kind: "claim_approved",
      recipientId,
      reportId,
      claimId,
    });
    expect(notificationEventKey(created)).toBe(
      `notification:v1:claim_approved:${claimId}:${recipientId}`,
    );
    expect(() =>
      createNotificationPlan({
        kind: "claim_approved",
        recipientId: "invalid",
        reportId,
        claimId,
      }),
    ).toThrow("Notification plan ID is invalid");
  });

  it("writes an opted-in event once with the caller session", async () => {
    const { userQuery, profileQuery } = configureRecipients();
    await deliverNotifications([plan(), plan()], session as never);

    expect(userQuery.session).toHaveBeenCalledWith(session);
    expect(profileQuery.session).toHaveBeenCalledWith(session);
    expect(NotificationModel.bulkWrite).toHaveBeenCalledWith(
      [
        {
          updateOne: {
            filter: {
              eventKey: `notification:v1:claim_received:${claimId}:${recipientId}`,
            },
            update: {
              $setOnInsert: {
                recipientId,
                kind: "claim_received",
                reportId,
                claimId,
                eventKey: `notification:v1:claim_received:${claimId}:${recipientId}`,
                readAt: null,
              },
            },
            upsert: true,
          },
        },
      ],
      { session, ordered: true },
    );
  });

  it.each([
    ["claim_received", "claimUpdates"],
    ["claim_withdrawn", "claimUpdates"],
    ["claim_approved", "statusChanges"],
    ["claim_rejected", "statusChanges"],
    ["claim_completed", "statusChanges"],
    ["report_recovered", "statusChanges"],
    ["claim_handover_ready", "handoverInstructions"],
  ] as const)("maps %s to %s", async (kind, preference) => {
    configureRecipients(undefined, [
      {
        userId: identifier(recipientId),
        notificationSettings: { ...enabled, [preference]: false },
      },
    ]);
    await deliverNotifications([plan(kind)], session as never);
    expect(NotificationModel.bulkWrite).not.toHaveBeenCalled();
  });

  it.each([
    [[], undefined, "missing user"],
    [
      [{ _id: identifier(recipientId), status: "suspended" as const }],
      undefined,
      "inactive user",
    ],
    [undefined, [], "missing profile"],
  ])("skips %s without failing", async (users, profiles) => {
    configureRecipients(users as never, profiles as never);
    await expect(
      deliverNotifications([plan()], session as never),
    ).resolves.toBeUndefined();
    expect(NotificationModel.bulkWrite).not.toHaveBeenCalled();
  });

  it("preserves eligible write failures for transaction rollback", async () => {
    const failure = new Error("notification write failed");
    vi.mocked(NotificationModel.bulkWrite).mockRejectedValueOnce(failure);
    await expect(
      deliverNotifications([plan()], session as never),
    ).rejects.toBe(failure);
  });
});
```

- [ ] **Step 2: Run the delivery test to verify the red state**

Run:

```powershell
npm.cmd test -- src/lib/notifications/delivery.test.ts
```

Expected: FAIL because `./delivery` does not exist.

- [ ] **Step 3: Implement typed plans, preference mapping, and idempotent writes**

Create `web/src/lib/notifications/delivery.ts`:

```ts
import type { ClientSession } from "mongoose";

import {
  type NotificationKind,
  NotificationModel,
} from "@/models/notification";
import { ProfileModel } from "@/models/profile";
import { UserModel } from "@/models/user";

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

type NotificationPreference =
  | "claimUpdates"
  | "statusChanges"
  | "handoverInstructions";

const preferenceByKind = {
  claim_received: "claimUpdates",
  claim_withdrawn: "claimUpdates",
  claim_approved: "statusChanges",
  claim_rejected: "statusChanges",
  claim_handover_ready: "handoverInstructions",
  claim_completed: "statusChanges",
  report_recovered: "statusChanges",
} as const satisfies Record<NotificationKind, NotificationPreference>;

export type NotificationPlan = {
  kind: NotificationKind;
  recipientId: string;
  reportId: string;
  claimId: string;
};

type UserRow = {
  _id: { toString(): string };
  status: "active" | "suspended" | "deactivated";
};

type ProfileRow = {
  userId: { toString(): string };
  notificationSettings: {
    possibleMatches: boolean;
    claimUpdates: boolean;
    statusChanges: boolean;
    handoverInstructions: boolean;
  };
};

function canonicalId(value: string) {
  if (!OBJECT_ID_PATTERN.test(value)) {
    throw new Error("Notification plan ID is invalid");
  }
  return value.toLowerCase();
}

export function createNotificationPlan(
  input: NotificationPlan,
): NotificationPlan {
  return {
    kind: input.kind,
    recipientId: canonicalId(input.recipientId),
    reportId: canonicalId(input.reportId),
    claimId: canonicalId(input.claimId),
  };
}

export function notificationEventKey(plan: NotificationPlan) {
  return `notification:v1:${plan.kind}:${plan.claimId}:${plan.recipientId}`;
}

export async function deliverNotifications(
  plans: readonly NotificationPlan[],
  session: ClientSession,
) {
  const uniquePlans = new Map<string, NotificationPlan>();
  for (const input of plans) {
    const plan = createNotificationPlan(input);
    uniquePlans.set(notificationEventKey(plan), plan);
  }
  if (uniquePlans.size === 0) return;

  const recipientIds = [
    ...new Set(
      [...uniquePlans.values()].map(({ recipientId }) => recipientId),
    ),
  ];
  const users = await UserModel.find(
    { _id: { $in: recipientIds }, status: "active" },
    { _id: 1, status: 1 },
  )
    .session(session)
    .lean<UserRow[]>()
    .exec();
  const activeIds = new Set(
    users
      .filter(({ status }) => status === "active")
      .map(({ _id }) => _id.toString()),
  );
  if (activeIds.size === 0) return;

  const profiles = await ProfileModel.find(
    { userId: { $in: [...activeIds] } },
    { userId: 1, notificationSettings: 1 },
  )
    .session(session)
    .lean<ProfileRow[]>()
    .exec();
  const profileByUser = new Map(
    profiles.map((profile) => [profile.userId.toString(), profile]),
  );

  const operations = [...uniquePlans.entries()].flatMap(
    ([eventKey, plan]) => {
      const profile = profileByUser.get(plan.recipientId);
      const preference = preferenceByKind[plan.kind];
      if (!profile?.notificationSettings[preference]) return [];
      return [
        {
          updateOne: {
            filter: { eventKey },
            update: {
              $setOnInsert: {
                recipientId: plan.recipientId,
                kind: plan.kind,
                reportId: plan.reportId,
                claimId: plan.claimId,
                eventKey,
                readAt: null,
              },
            },
            upsert: true,
          },
        },
      ];
    },
  );
  if (operations.length === 0) return;

  await NotificationModel.bulkWrite(operations, {
    session,
    ordered: true,
  });
}
```

Do not wrap the User and Profile reads in `Promise.all`; MongoDB does not support parallel operations within one transaction.

- [ ] **Step 4: Run focused delivery and model tests**

Run:

```powershell
npm.cmd test -- src/models/notification.test.ts src/lib/notifications/delivery.test.ts
npm.cmd exec -- tsc --noEmit --incremental false
```

Expected: both files PASS and TypeScript exits 0.

- [ ] **Step 5: Commit transactional delivery**

```powershell
git add web/src/lib/notifications/delivery.ts web/src/lib/notifications/delivery.test.ts
git commit -m "feat(notifications): deliver opted-in events atomically"
```

### Task 5: Claimant create and withdrawal notifications

**Files:**
- Modify: `web/src/lib/claims/claimant-service.test.ts`
- Modify: `web/src/lib/claims/claimant-service.ts`

**Interfaces:**
- Consumes: `createNotificationPlan` and `deliverNotifications` from Task 4.
- Produces: unchanged Claimant public contracts plus transactional `claim_received` and `claim_withdrawn` event plans.

- [ ] **Step 1: Add failing notification assertions to claimant service tests**

At the top of `web/src/lib/claims/claimant-service.test.ts`, add this mock before importing the service:

```ts
vi.mock("@/lib/notifications/delivery", () => ({
  createNotificationPlan: vi.fn((input) => input),
  deliverNotifications: vi.fn(),
}));
```

Import the two functions:

```ts
import {
  createNotificationPlan,
  deliverNotifications,
} from "@/lib/notifications/delivery";
```

Add a report owner and expose it on the existing `foundReport` fixture:

```ts
const reportOwnerId = "64b64c6f2f4d9f1a2b3c4d50";

const foundReport = {
  _id: reportObjectId,
  reporterId: identifier(reportOwnerId),
  title: "Black charger",
  reportType: "found" as const,
  status: "open" as const,
};
```

In `beforeEach`, make delivery resolve and retain the identity constructor:

```ts
vi.mocked(createNotificationPlan).mockImplementation((input) => input);
vi.mocked(deliverNotifications).mockResolvedValue(undefined);
```

Add these focused cases inside the existing `describe`:

```ts
it("notifies the report owner after Claim evidence is created", async () => {
  configureCreate();
  await createClaim(student, reportId, validInput);

  expect(createNotificationPlan).toHaveBeenCalledWith({
    kind: "claim_received",
    recipientId: reportOwnerId,
    reportId,
    claimId,
  });
  expect(deliverNotifications).toHaveBeenCalledWith(
    [
      {
        kind: "claim_received",
        recipientId: reportOwnerId,
        reportId,
        claimId,
      },
    ],
    transaction,
  );
  expect(vi.mocked(ClaimEvidenceModel.create).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(deliverNotifications).mock.invocationCallOrder[0],
  );
});

it("notifies the report owner after a successful withdrawal", async () => {
  vi.mocked(ClaimModel.findOne).mockReturnValue(
    queryChain(pendingClaim) as never,
  );
  vi.mocked(ClaimModel.findOneAndUpdate).mockReturnValue(
    queryChain(withdrawnClaim) as never,
  );
  vi.mocked(ItemReportModel.findById).mockReturnValue(
    queryChain(foundReport) as never,
  );

  await withdrawOwnClaim(student, claimId);

  expect(deliverNotifications).toHaveBeenCalledWith(
    [
      {
        kind: "claim_withdrawn",
        recipientId: reportOwnerId,
        reportId,
        claimId,
      },
    ],
    transaction,
  );
});

it("does not deliver when Claim creation fails before persistence", async () => {
  configureCreate();
  vi.mocked(ClaimModel.create).mockRejectedValueOnce(
    new Error("claim insert failed"),
  );
  await expect(createClaim(student, reportId, validInput)).rejects.toThrow(
    "claim insert failed",
  );
  expect(deliverNotifications).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the claimant service test to verify the red state**

Run:

```powershell
npm.cmd test -- src/lib/claims/claimant-service.test.ts
```

Expected: the new cases FAIL because the service does not call notification delivery and its report projection does not retain `reporterId`.

- [ ] **Step 3: Add internal owner projection and transactional event plans**

In `web/src/lib/claims/claimant-service.ts`, import delivery:

```ts
import {
  createNotificationPlan,
  deliverNotifications,
} from "@/lib/notifications/delivery";
```

Extend the internal report projection without changing `toClaimantClaim`:

```ts
const CLAIM_REPORT_PROJECTION = {
  _id: 1,
  reporterId: 1,
  title: 1,
  reportType: 1,
  status: 1,
} as const;
```

After Claim evidence creation and before assigning `result` in `createClaim`, insert:

```ts
await deliverNotifications(
  [
    createNotificationPlan({
      kind: "claim_received",
      recipientId: report.reporterId.toString(),
      reportId: report._id.toString(),
      claimId: claim._id.toString(),
    }),
  ],
  transaction,
);
```

After `loadReport` succeeds and before assigning `result` in `withdrawOwnClaim`, insert:

```ts
await deliverNotifications(
  [
    createNotificationPlan({
      kind: "claim_withdrawn",
      recipientId: report.reporterId.toString(),
      reportId: report._id.toString(),
      claimId: updated._id.toString(),
    }),
  ],
  transaction,
);
```

Define the internal report type locally so TypeScript knows the owner exists while the public mapper continues consuming only `ClaimReportRecord`:

```ts
type ClaimReportWithOwner = ClaimReportRecord & {
  reporterId: { toString(): string };
};
```

Use `ClaimReportWithOwner` as the `lean` type in `loadReport`, and cast the transactional `findOneAndUpdate` result to that type only after its null check.

- [ ] **Step 4: Run claimant regression tests and TypeScript**

Run:

```powershell
npm.cmd test -- src/lib/claims/claimant-service.test.ts src/app/api/claims/claimant-routes.test.ts
npm.cmd exec -- tsc --noEmit --incremental false
```

Expected: both existing Claimant suites PASS, public route fixtures remain unchanged, and TypeScript exits 0.

- [ ] **Step 5: Commit claimant notification integration**

```powershell
git add web/src/lib/claims/claimant-service.ts web/src/lib/claims/claimant-service.test.ts
git commit -m "feat(notifications): notify report owners of claims"
```

### Task 6: Staff decision, competition, handover, and completion notifications

**Files:**
- Modify: `web/src/lib/claims/staff-service.test.ts`
- Modify: `web/src/lib/claims/staff-service.ts`

**Interfaces:**
- Consumes: `createNotificationPlan` and `deliverNotifications` from Task 4.
- Produces: unchanged Staff Claim contracts plus exact transactional event batches for rejection, approval, competing rejection, completion, and report recovery.

- [ ] **Step 1: Add failing staff transition tests**

Add the delivery mock above service imports in `web/src/lib/claims/staff-service.test.ts`:

```ts
vi.mock("@/lib/notifications/delivery", () => ({
  createNotificationPlan: vi.fn((input) => input),
  deliverNotifications: vi.fn(),
}));
```

Import the delivery functions and add `reporterId` to the report fixture:

```ts
import {
  createNotificationPlan,
  deliverNotifications,
} from "@/lib/notifications/delivery";

const reportOwnerId = "64b64c6f2f4d9f1a2b3c4d54";

const report = {
  _id: identifier(reportId),
  reporterId: identifier(reportOwnerId),
  title: "Black charger",
  reportType: "found" as const,
  status: "open" as const,
};
```

Reset delivery in `beforeEach`:

```ts
vi.mocked(createNotificationPlan).mockImplementation((input) => input);
vi.mocked(deliverNotifications).mockResolvedValue(undefined);
```

Add a competing fixture and three exact cases:

```ts
const competingClaimId = "64b64c6f2f4d9f1a2b3c4d55";
const competingClaimantId = "64b64c6f2f4d9f1a2b3c4d56";
const competingClaim = {
  _id: identifier(competingClaimId),
  claimantId: identifier(competingClaimantId),
};

it("notifies a directly rejected claimant", async () => {
  configureDetail(pendingClaim);
  vi.mocked(ClaimModel.findOneAndUpdate).mockReturnValue(
    queryChain({ ...pendingClaim, status: "rejected" as const }) as never,
  );

  await decideClaim(staff, claimId, { decision: "reject", reviewNote: null });

  expect(deliverNotifications).toHaveBeenCalledWith(
    [
      {
        kind: "claim_rejected",
        recipientId: claimantId,
        reportId,
        claimId,
      },
    ],
    transaction,
  );
});

it("notifies approval, handover and every competing claimant", async () => {
  configureDetail(pendingClaim);
  vi.mocked(ItemReportModel.findOneAndUpdate).mockReturnValue(
    queryChain({ ...report, status: "claim_pending" as const }) as never,
  );
  vi.mocked(ClaimModel.findOneAndUpdate).mockReturnValue(
    queryChain(approvedClaim) as never,
  );
  vi.mocked(ClaimModel.find).mockReturnValue(
    queryChain([competingClaim]) as never,
  );
  vi.mocked(ClaimModel.updateMany).mockResolvedValue({ modifiedCount: 1 } as never);

  await decideClaim(staff, claimId, { decision: "approve", reviewNote: null });

  expect(deliverNotifications).toHaveBeenCalledWith(
    [
      {
        kind: "claim_approved",
        recipientId: claimantId,
        reportId,
        claimId,
      },
      {
        kind: "claim_handover_ready",
        recipientId: claimantId,
        reportId,
        claimId,
      },
      {
        kind: "claim_rejected",
        recipientId: competingClaimantId,
        reportId,
        claimId: competingClaimId,
      },
    ],
    transaction,
  );
});

it("notifies claimant and report owner when recovery completes", async () => {
  configureDetail(approvedClaim, resolvedReport);
  vi.mocked(ItemReportModel.findOneAndUpdate).mockReturnValue(
    queryChain(resolvedReport) as never,
  );
  vi.mocked(ClaimModel.findOneAndUpdate).mockReturnValue(
    queryChain(completedClaim) as never,
  );

  await completeClaim(staff, claimId);

  expect(deliverNotifications).toHaveBeenCalledWith(
    [
      {
        kind: "claim_completed",
        recipientId: claimantId,
        reportId,
        claimId,
      },
      {
        kind: "report_recovered",
        recipientId: reportOwnerId,
        reportId,
        claimId,
      },
    ],
    transaction,
  );
});
```

Add a stale competing-write test:

```ts
it("aborts approval when the competing update count changes", async () => {
  configureDetail(pendingClaim);
  vi.mocked(ItemReportModel.findOneAndUpdate).mockReturnValue(
    queryChain({ ...report, status: "claim_pending" as const }) as never,
  );
  vi.mocked(ClaimModel.findOneAndUpdate).mockReturnValue(
    queryChain(approvedClaim) as never,
  );
  vi.mocked(ClaimModel.find).mockReturnValue(
    queryChain([competingClaim]) as never,
  );
  vi.mocked(ClaimModel.updateMany).mockResolvedValue({ modifiedCount: 0 } as never);

  await expect(
    decideClaim(staff, claimId, { decision: "approve", reviewNote: null }),
  ).rejects.toMatchObject({ code: "CLAIM_STATE_CONFLICT" });
  expect(deliverNotifications).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run staff service tests to verify the red state**

Run:

```powershell
npm.cmd test -- src/lib/claims/staff-service.test.ts
```

Expected: the new cases FAIL because staff transitions do not load competing recipient IDs or deliver notifications.

- [ ] **Step 3: Implement exact staff event batches**

Import delivery and add `reporterId: 1` to `CLAIM_REPORT_PROJECTION` in `web/src/lib/claims/staff-service.ts`:

```ts
import {
  createNotificationPlan,
  deliverNotifications,
  type NotificationPlan,
} from "@/lib/notifications/delivery";
```

Add this internal row type:

```ts
type CompetingClaimRow = {
  _id: { toString(): string };
  claimantId: { toString(): string };
};
```

Inside `decideClaim`, initialise an event list after `current` is validated:

```ts
const plans: NotificationPlan[] = [];
```

In the approval branch, before `updateMany`, select the exact competing rows with the transaction session:

```ts
const competing = await ClaimModel.find(
  {
    reportId: current.reportId,
    _id: { $ne: current._id },
    status: "pending",
  },
  { _id: 1, claimantId: 1 },
)
  .session(transaction)
  .lean<CompetingClaimRow[]>()
  .exec();

if (competing.length > 0) {
  const rejected = await ClaimModel.updateMany(
    {
      _id: { $in: competing.map(({ _id }) => _id) },
      status: "pending",
    },
    {
      $set: {
        status: "rejected",
        activeClaimKey: null,
        reviewedBy: user.id,
        reviewedAt: now,
        reviewNote: null,
      },
    },
    { session: transaction },
  );
  if (rejected.modifiedCount !== competing.length) {
    throw new ClaimError("CLAIM_STATE_CONFLICT");
  }
}
```

Replace the former broad `updateMany` call; never leave both versions active. Then append approval and competing plans:

```ts
plans.push(
  createNotificationPlan({
    kind: "claim_approved",
    recipientId: current.claimantId.toString(),
    reportId: current.reportId.toString(),
    claimId: current._id.toString(),
  }),
  createNotificationPlan({
    kind: "claim_handover_ready",
    recipientId: current.claimantId.toString(),
    reportId: current.reportId.toString(),
    claimId: current._id.toString(),
  }),
  ...competing.map((claim) =>
    createNotificationPlan({
      kind: "claim_rejected",
      recipientId: claim.claimantId.toString(),
      reportId: current.reportId.toString(),
      claimId: claim._id.toString(),
    }),
  ),
);
```

In the direct rejection branch append exactly one `claim_rejected` plan:

```ts
plans.push(
  createNotificationPlan({
    kind: "claim_rejected",
    recipientId: current.claimantId.toString(),
    reportId: current.reportId.toString(),
    claimId: current._id.toString(),
  }),
);
```

After the decision branch and before loading the final staff detail, call:

```ts
await deliverNotifications(plans, transaction);
```

In `completeClaim`, the updated report contains the internal `reporterId`. After both conditional writes succeed and before loading final detail, call:

```ts
await deliverNotifications(
  [
    createNotificationPlan({
      kind: "claim_completed",
      recipientId: current.claimantId.toString(),
      reportId: current.reportId.toString(),
      claimId: current._id.toString(),
    }),
    createNotificationPlan({
      kind: "report_recovered",
      recipientId: report.reporterId.toString(),
      reportId: report._id.toString(),
      claimId: current._id.toString(),
    }),
  ],
  transaction,
);
```

- [ ] **Step 4: Run staff regression tests and TypeScript**

Run:

```powershell
npm.cmd test -- src/lib/claims/staff-service.test.ts src/app/api/staff/claims/staff-claim-routes.test.ts
npm.cmd exec -- tsc --noEmit --incremental false
```

Expected: both Staff Claim suites PASS, competing updates are bounded to selected IDs, public route shapes remain unchanged, and TypeScript exits 0.

- [ ] **Step 5: Commit staff lifecycle integration**

```powershell
git add web/src/lib/claims/staff-service.ts web/src/lib/claims/staff-service.test.ts
git commit -m "feat(notifications): emit claim lifecycle events"
```

### Task 7: Recipient-owned list and idempotent read service

**Files:**
- Create: `web/src/lib/notifications/service.test.ts`
- Create: `web/src/lib/notifications/service.ts`

**Interfaces:**
- Consumes: `PublicUser`, `NotificationModel`, Task 2 public mappers/schemas, Task 3 `NotificationListQuery`, and `connectToDatabase`.
- Produces: `requireNotificationUser(user)`, `listNotifications(user, query): Promise<NotificationPage>`, and `markNotificationRead(user, notificationId): Promise<PublicNotification>`.

- [ ] **Step 1: Write the failing service tests**

Create `web/src/lib/notifications/service.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/notification", () => ({
  NotificationModel: {
    find: vi.fn(),
    countDocuments: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));

import { connectToDatabase } from "@/lib/db";
import type { PublicUser } from "@/lib/auth/public-user";
import { NotificationModel } from "@/models/notification";

import { NotificationError } from "./errors";
import {
  listNotifications,
  markNotificationRead,
  requireNotificationUser,
} from "./service";
import { encodeNotificationCursor } from "./validation";

function identifier(value: string) {
  return { toString: () => value };
}

function queryChain<T>(result: T) {
  const chain = {
    sort: vi.fn(),
    limit: vi.fn(),
    lean: vi.fn(),
    exec: vi.fn(async () => result),
  };
  chain.sort.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.lean.mockReturnValue(chain);
  return chain;
}

const user = {
  id: "64b64c6f2f4d9f1a2b3c4d51",
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
} satisfies PublicUser;

const reportId = "64b64c6f2f4d9f1a2b3c4d52";
const claimId = "64b64c6f2f4d9f1a2b3c4d53";
const firstId = "64b64c6f2f4d9f1a2b3c4d54";
const secondId = "64b64c6f2f4d9f1a2b3c4d55";
const firstCreatedAt = new Date("2026-08-25T06:02:00.000Z");
const secondCreatedAt = new Date("2026-08-25T06:01:00.000Z");

const first = {
  _id: identifier(firstId),
  kind: "claim_approved" as const,
  reportId: identifier(reportId),
  claimId: identifier(claimId),
  readAt: null,
  createdAt: firstCreatedAt,
};
const second = {
  ...first,
  _id: identifier(secondId),
  kind: "claim_handover_ready" as const,
  createdAt: secondCreatedAt,
};

describe("notification service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectToDatabase).mockResolvedValue({} as never);
    vi.mocked(NotificationModel.find).mockReturnValue(
      queryChain([first, second]) as never,
    );
    vi.mocked(NotificationModel.countDocuments).mockReturnValue(
      queryChain(2) as never,
    );
    vi.mocked(NotificationModel.findOneAndUpdate).mockReturnValue(
      queryChain({ ...first, readAt: firstCreatedAt }) as never,
    );
  });

  it.each([
    { ...user, status: "suspended" as const },
    { ...user, status: "deactivated" as const },
  ])("rejects $status before database access", async (account) => {
    expect(() => requireNotificationUser(account)).toThrowError(
      new NotificationError("NOTIFICATION_FORBIDDEN"),
    );
    await expect(
      listNotifications(account, { pageSize: 20 }),
    ).rejects.toMatchObject({ code: "NOTIFICATION_FORBIDDEN" });
    expect(connectToDatabase).not.toHaveBeenCalled();
  });

  it("lists only the current recipient with bounded seek pagination", async () => {
    const findQuery = queryChain([first, second]);
    vi.mocked(NotificationModel.find).mockReturnValue(findQuery as never);
    const cursorDate = new Date("2026-08-25T06:03:00.000Z");
    const cursorId = "64b64c6f2f4d9f1a2b3c4d59";

    const page = await listNotifications(user, {
      pageSize: 1,
      cursor: { createdAt: cursorDate, id: cursorId },
    });

    expect(NotificationModel.find).toHaveBeenCalledWith({
      recipientId: user.id,
      $or: [
        { createdAt: { $lt: cursorDate } },
        { createdAt: cursorDate, _id: { $lt: cursorId } },
      ],
    });
    expect(findQuery.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(findQuery.limit).toHaveBeenCalledWith(2);
    expect(NotificationModel.countDocuments).toHaveBeenCalledWith({
      recipientId: user.id,
      readAt: null,
    });
    expect(page.notifications).toHaveLength(1);
    expect(page.unreadCount).toBe(2);
    expect(page.pagination).toEqual({
      hasMore: true,
      nextCursor: encodeNotificationCursor({
        createdAt: firstCreatedAt,
        id: firstId,
      }),
    });
    expect(JSON.stringify(page)).not.toMatch(
      /recipientId|claimantId|reporterId|reviewNote|verification|email/,
    );
  });

  it("returns a stable empty page", async () => {
    vi.mocked(NotificationModel.find).mockReturnValue(queryChain([]) as never);
    vi.mocked(NotificationModel.countDocuments).mockReturnValue(
      queryChain(0) as never,
    );
    await expect(
      listNotifications(user, { pageSize: 20 }),
    ).resolves.toEqual({
      notifications: [],
      pagination: { nextCursor: null, hasMore: false },
      unreadCount: 0,
    });
  });

  it("marks only the current recipient notification read atomically", async () => {
    const updateQuery = queryChain({ ...first, readAt: firstCreatedAt });
    vi.mocked(NotificationModel.findOneAndUpdate).mockReturnValue(
      updateQuery as never,
    );
    const result = await markNotificationRead(user, firstId);

    expect(NotificationModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: firstId, recipientId: user.id },
      [
        {
          $set: {
            readAt: { $ifNull: ["$readAt", expect.any(Date)] },
          },
        },
      ],
      { new: true },
    );
    expect(updateQuery.lean).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      id: firstId,
      readAt: firstCreatedAt.toISOString(),
      isRead: true,
    });
  });

  it("hides missing and foreign notification records behind one error", async () => {
    vi.mocked(NotificationModel.findOneAndUpdate).mockReturnValue(
      queryChain(null) as never,
    );
    await expect(markNotificationRead(user, firstId)).rejects.toMatchObject({
      code: "NOTIFICATION_NOT_FOUND",
    });
  });

  it("preserves database failures for safe route mapping", async () => {
    const failure = new Error("PRIVATE-DATABASE-DETAIL");
    vi.mocked(NotificationModel.find).mockReturnValue({
      sort: () => ({
        limit: () => ({
          lean: () => ({ exec: async () => Promise.reject(failure) }),
        }),
      }),
    } as never);
    await expect(
      listNotifications(user, { pageSize: 20 }),
    ).rejects.toBe(failure);
  });
});
```

- [ ] **Step 2: Run the service test to verify the red state**

Run:

```powershell
npm.cmd test -- src/lib/notifications/service.test.ts
```

Expected: FAIL because `./service` does not exist.

- [ ] **Step 3: Implement the active-user gate, seek query, and read update**

Create `web/src/lib/notifications/service.ts`:

```ts
import type { FilterQuery } from "mongoose";

import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import {
  type Notification,
  NotificationModel,
} from "@/models/notification";

import {
  notificationPageSchema,
  toPublicNotification,
  type NotificationPage,
  type NotificationRecord,
  type PublicNotification,
} from "./contracts";
import { NotificationError } from "./errors";
import {
  encodeNotificationCursor,
  type NotificationListQuery,
} from "./validation";

export function requireNotificationUser(user: PublicUser) {
  if (user.status !== "active") {
    throw new NotificationError("NOTIFICATION_FORBIDDEN");
  }
}

export async function listNotifications(
  user: PublicUser,
  query: NotificationListQuery,
): Promise<NotificationPage> {
  requireNotificationUser(user);
  await connectToDatabase();

  const filter: FilterQuery<Notification> = {
    recipientId: user.id,
    ...(query.cursor
      ? {
          $or: [
            { createdAt: { $lt: query.cursor.createdAt } },
            {
              createdAt: query.cursor.createdAt,
              _id: { $lt: query.cursor.id },
            },
          ],
        }
      : {}),
  };
  const rowsQuery = NotificationModel.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(query.pageSize + 1)
    .lean<NotificationRecord[]>();
  const [rows, unreadCount] = await Promise.all([
    rowsQuery.exec(),
    NotificationModel.countDocuments({
      recipientId: user.id,
      readAt: null,
    }).exec(),
  ]);

  const hasMore = rows.length > query.pageSize;
  const visible = rows.slice(0, query.pageSize);
  const last = visible.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeNotificationCursor({
          createdAt: last.createdAt,
          id: last._id.toString(),
        })
      : null;

  return notificationPageSchema.parse({
    notifications: visible.map(toPublicNotification),
    pagination: { nextCursor, hasMore },
    unreadCount,
  });
}

export async function markNotificationRead(
  user: PublicUser,
  notificationId: string,
): Promise<PublicNotification> {
  requireNotificationUser(user);
  await connectToDatabase();
  const updated = await NotificationModel.findOneAndUpdate(
    { _id: notificationId, recipientId: user.id },
    [
      {
        $set: {
          readAt: { $ifNull: ["$readAt", new Date()] },
        },
      },
    ],
    { new: true },
  )
    .lean<NotificationRecord | null>()
    .exec();
  if (!updated) throw new NotificationError("NOTIFICATION_NOT_FOUND");
  return toPublicNotification(updated);
}
```

- [ ] **Step 4: Run service, contract, and validation tests**

Run:

```powershell
npm.cmd test -- src/lib/notifications/service.test.ts src/lib/notifications/contracts.test.ts src/lib/notifications/validation.test.ts
npm.cmd exec -- tsc --noEmit --incremental false
```

Expected: all focused tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit the recipient-owned service**

```powershell
git add web/src/lib/notifications/service.ts web/src/lib/notifications/service.test.ts
git commit -m "feat(notifications): list and read owned notifications"
```

### Task 8: Authenticated notification API routes

**Files:**
- Create: `web/src/app/api/notifications/notification-routes.test.ts`
- Create: `web/src/app/api/notifications/route.ts`
- Create: `web/src/app/api/notifications/[id]/read/route.ts`

**Interfaces:**
- Consumes: existing session cookie/current-user helpers, Task 3 validation/errors/body reader, and Task 7 service functions.
- Produces: `GET /api/notifications` and `PATCH /api/notifications/{id}/read`, both with `Cache-Control: no-store`.

- [ ] **Step 1: Write failing route tests**

Create `web/src/app/api/notifications/notification-routes.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/cookie", () => ({ readSessionCookie: vi.fn() }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/notifications/service", () => ({
  listNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
}));

import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { PublicUser } from "@/lib/auth/public-user";
import { NotificationError } from "@/lib/notifications/errors";
import {
  listNotifications,
  markNotificationRead,
} from "@/lib/notifications/service";

import { PATCH as readPatch } from "./[id]/read/route";
import { GET as notificationsGet } from "./route";

const notificationId = "64b64c6f2f4d9f1a2b3c4d54";
const user = {
  id: "64b64c6f2f4d9f1a2b3c4d51",
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
} satisfies PublicUser;
const notification = {
  id: notificationId,
  kind: "claim_approved" as const,
  title: "Claim approved",
  summary: "Campus staff approved your claim.",
  action: {
    label: "View claim",
    href: "/claims/64b64c6f2f4d9f1a2b3c4d53",
  },
  createdAt: "2026-08-25T06:00:00.000Z",
  readAt: null,
  isRead: false,
};
const page = {
  notifications: [notification],
  pagination: { nextCursor: null, hasMore: false },
  unreadCount: 1,
};
const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe("notification routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readSessionCookie).mockResolvedValue("raw-session-token");
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(listNotifications).mockResolvedValue(page);
    vi.mocked(markNotificationRead).mockResolvedValue({
      ...notification,
      readAt: "2026-08-25T06:05:00.000Z",
      isRead: true,
    });
  });

  it("authenticates before rejecting a malformed list query", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const response = await notificationsGet(
      new Request("http://localhost/api/notifications?pageSize=0"),
    );
    expect(response.status).toBe(401);
    expect(listNotifications).not.toHaveBeenCalled();
  });

  it("returns the strict notification page without caching", async () => {
    const response = await notificationsGet(
      new Request("http://localhost/api/notifications?pageSize=10"),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(listNotifications).toHaveBeenCalledWith(user, { pageSize: 10 });
    await expect(response.json()).resolves.toEqual(page);
  });

  it.each([
    "?pageSize=0",
    "?pageSize=10&pageSize=20",
    "?owner=other",
    "?cursor=PRIVATE-CURSOR!",
  ])("rejects invalid list query %s", async (query) => {
    const response = await notificationsGet(
      new Request(`http://localhost/api/notifications${query}`),
    );
    expect(response.status).toBe(400);
    expect(listNotifications).not.toHaveBeenCalled();
  });

  it("marks one owned notification read with an empty body", async () => {
    const response = await readPatch(
      new Request(`http://localhost/api/notifications/${notificationId}/read`, {
        method: "PATCH",
      }),
      context(notificationId),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(markNotificationRead).toHaveBeenCalledWith(user, notificationId);
    expect(await response.json()).toEqual({
      notification: expect.objectContaining({ isRead: true }),
    });
  });

  it.each([
    ["invalid ID", "invalid", undefined],
    ["unknown body field", notificationId, { force: true }],
  ] as const)("rejects %s", async (_case, id, body) => {
    const request = new Request(
      `http://localhost/api/notifications/${id}/read`,
      {
        method: "PATCH",
        ...(body === undefined
          ? {}
          : {
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            }),
      },
    );
    const response = await readPatch(request, context(id));
    expect(response.status).toBe(400);
    expect(markNotificationRead).not.toHaveBeenCalled();
  });

  it("maps foreign and missing notifications to the same safe 404", async () => {
    vi.mocked(markNotificationRead).mockRejectedValue(
      new NotificationError("NOTIFICATION_NOT_FOUND"),
    );
    const response = await readPatch(
      new Request(`http://localhost/api/notifications/${notificationId}/read`, {
        method: "PATCH",
      }),
      context(notificationId),
    );
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body).toEqual({
      error: {
        code: "NOTIFICATION_NOT_FOUND",
        message: "Notification not found",
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/recipientId|PRIVATE|database/);
  });

  it("redacts rejected route parameters and service failures", async () => {
    const rejectedContext = {
      params: {
        then() {
          throw new Error("PRIVATE-PARAMS");
        },
      } as unknown as Promise<{ id: string }>,
    };
    const parameterResponse = await readPatch(
      new Request("http://localhost/api/notifications/private/read", {
        method: "PATCH",
      }),
      rejectedContext,
    );
    expect(parameterResponse.status).toBe(500);
    expect(JSON.stringify(await parameterResponse.json())).not.toContain(
      "PRIVATE-PARAMS",
    );

    vi.mocked(listNotifications).mockRejectedValue(
      new Error("PRIVATE-DATABASE-DETAIL"),
    );
    const serviceResponse = await notificationsGet(
      new Request("http://localhost/api/notifications"),
    );
    expect(serviceResponse.status).toBe(500);
    expect(JSON.stringify(await serviceResponse.json())).not.toContain(
      "PRIVATE-DATABASE-DETAIL",
    );
  });
});
```

- [ ] **Step 2: Run route tests to verify the red state**

Run:

```powershell
npm.cmd test -- src/app/api/notifications/notification-routes.test.ts
```

Expected: FAIL because the two routes do not exist.

- [ ] **Step 3: Implement the authenticated GET route**

Create `web/src/app/api/notifications/route.ts`:

```ts
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import {
  invalidNotificationResponse,
  notificationErrorResponse,
} from "@/lib/notifications/errors";
import { listNotifications } from "@/lib/notifications/service";
import {
  notificationListQuerySchema,
  toNotificationListQueryInput,
} from "@/lib/notifications/validation";

async function requireCurrentUser(): Promise<PublicUser> {
  const user = await getCurrentUser(await readSessionCookie());
  if (!user) throw new AuthError("AUTHENTICATION_REQUIRED");
  return user;
}

export async function GET(request: Request) {
  let user: PublicUser;
  try {
    user = await requireCurrentUser();
  } catch (error) {
    return notificationErrorResponse(error);
  }

  let parsed;
  try {
    parsed = notificationListQuerySchema.safeParse(
      toNotificationListQueryInput(new URL(request.url).searchParams),
    );
  } catch (error) {
    return notificationErrorResponse(error);
  }
  if (!parsed.success) return invalidNotificationResponse(parsed.error);

  try {
    return Response.json(await listNotifications(user, parsed.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return notificationErrorResponse(error);
  }
}
```

- [ ] **Step 4: Implement the authenticated PATCH route**

Create `web/src/app/api/notifications/[id]/read/route.ts`:

```ts
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import {
  invalidNotificationResponse,
  notificationErrorResponse,
} from "@/lib/notifications/errors";
import {
  InvalidNotificationBodyEncoding,
  NotificationBodyTooLarge,
  readNotificationRequestBody,
} from "@/lib/notifications/request-body";
import { markNotificationRead } from "@/lib/notifications/service";
import {
  emptyNotificationBodySchema,
  notificationIdSchema,
} from "@/lib/notifications/validation";

type Context = { params: Promise<{ id: string }> };

async function requireCurrentUser(): Promise<PublicUser> {
  const user = await getCurrentUser(await readSessionCookie());
  if (!user) throw new AuthError("AUTHENTICATION_REQUIRED");
  return user;
}

export async function PATCH(request: Request, context: Context) {
  let user: PublicUser;
  try {
    user = await requireCurrentUser();
  } catch (error) {
    return notificationErrorResponse(error);
  }

  let rawId: string;
  try {
    rawId = (await context.params).id;
  } catch (error) {
    return notificationErrorResponse(error);
  }
  const parsedId = notificationIdSchema.safeParse(rawId);
  if (!parsedId.success) return invalidNotificationResponse();

  let text: string;
  try {
    text = await readNotificationRequestBody(request);
  } catch (error) {
    return error instanceof NotificationBodyTooLarge ||
      error instanceof InvalidNotificationBodyEncoding
      ? invalidNotificationResponse()
      : notificationErrorResponse(error);
  }

  let body: unknown = {};
  if (text.trim() !== "") {
    try {
      body = JSON.parse(text);
    } catch (error) {
      return error instanceof SyntaxError
        ? invalidNotificationResponse()
        : notificationErrorResponse(error);
    }
  }
  const parsedBody = emptyNotificationBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return invalidNotificationResponse(parsedBody.error);
  }

  try {
    return Response.json(
      {
        notification: await markNotificationRead(user, parsedId.data),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return notificationErrorResponse(error);
  }
}
```

- [ ] **Step 5: Run route and service tests, then TypeScript**

Run:

```powershell
npm.cmd test -- src/app/api/notifications/notification-routes.test.ts src/lib/notifications/service.test.ts src/lib/notifications/errors.test.ts src/lib/notifications/request-body.test.ts src/lib/notifications/validation.test.ts
npm.cmd exec -- tsc --noEmit --incremental false
```

Expected: all focused tests PASS, both routes type-check, invalid transport never reaches the service, and TypeScript exits 0.

- [ ] **Step 6: Commit the notification API**

```powershell
git add web/src/app/api/notifications/route.ts web/src/app/api/notifications/[id]/read/route.ts web/src/app/api/notifications/notification-routes.test.ts
git commit -m "feat(notifications): expose owned notification API"
```

### Task 9: Full regression, privacy verification, and evidence

**Files:**
- Create: `docs/superpowers/verification/2026-08-25-secure-in-app-notification-backend.md`

**Interfaces:**
- Consumes: the complete implementation and repository quality commands.
- Produces: auditable verification evidence with no secrets and one final documentation commit.

- [ ] **Step 1: Run the complete notification and Claim regression slice**

Run from `web/`:

```powershell
npm.cmd test -- src/models/notification.test.ts src/lib/notifications/contracts.test.ts src/lib/notifications/validation.test.ts src/lib/notifications/errors.test.ts src/lib/notifications/request-body.test.ts src/lib/notifications/delivery.test.ts src/lib/notifications/service.test.ts src/lib/claims/claimant-service.test.ts src/lib/claims/staff-service.test.ts src/app/api/claims/claimant-routes.test.ts src/app/api/staff/claims/staff-claim-routes.test.ts src/app/api/notifications/notification-routes.test.ts
```

Expected: every focused file PASS, including all pre-existing Claim route/service regressions.

- [ ] **Step 2: Run the full repository gates**

Run from `web/` in this order:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd exec -- tsc --noEmit --incremental false
npm.cmd run build
npm.cmd audit
```

Expected: full tests PASS, lint exits 0, TypeScript exits 0, the production build includes `/api/notifications` and `/api/notifications/[id]/read`, and audit reports `found 0 vulnerabilities`.

- [ ] **Step 3: Run repository and privacy checks**

Run from the repository root:

```powershell
git diff --check
git status --short --branch
rg -n "recipientId|claimantId|reporterId|reviewNote|verificationMatchedCount|expectedAnswer|passwordHash|tokenHash" web/src/lib/notifications web/src/app/api/notifications
git check-ignore web/.env.local
```

Expected:

- `git diff --check` produces no output.
- Only the intended implementation/evidence files are changed before the final commit.
- Any internal identifiers found by `rg` occur only in model filters, internal records, or explicit redaction tests; none occurs in `PublicNotification` fields or static copy.
- `git check-ignore` prints `web/.env.local` when that local file exists.
- No command reads the contents of `.env.local`.

- [ ] **Step 4: Record exact verification evidence**

Create `docs/superpowers/verification/2026-08-25-secure-in-app-notification-backend.md`:

```md
# Secure In-App Notification Backend Verification

**Date:** 2026-08-25
**Branch:** `feature/issue-35-notification-backend`

## Implemented scope

- Added a validated, indexed, persisted Notification model.
- Added preference-aware and transaction-owned Claim lifecycle delivery.
- Added owner-isolated cursor pagination, unread counts, and idempotent read state.
- Added authenticated no-store list and mark-read API routes.
- Preserved existing Claim public response contracts.

## Automated verification

- Focused Notification and Claim regression suite: passed.
- Full `npm test`: passed.
- `npm run lint`: passed.
- `npm exec -- tsc --noEmit --incremental false`: passed.
- `npm run build`: passed; both Notification API routes were generated.
- `npm audit`: passed with zero vulnerabilities.
- `git diff --check`: passed.

## Security and privacy verification

- Notification reads filter by the authenticated user's `recipientId` in MongoDB.
- Missing and foreign notifications share the same safe `404` response.
- Public notification copy is generated only from a closed kind mapping.
- Public responses omit recipient, claimant, reporter, email, contact, review, verification, password, token, and raw-error data.
- Delivery skips inactive, missing, or opted-out recipients and fails the owner transaction on eligible write failure.
- Deterministic event keys and `$setOnInsert` prevent duplicate delivery during transaction callback retries.
- Automated tests mocked database/model/session boundaries and did not connect to Atlas.
- `.env.local` remained ignored; no verification command read or displayed credentials.

## Deferred scope

The notification centre frontend, possible-match delivery, external channels, realtime transport, background jobs, free-form communication, mark-all-read, deletion, and retention remain outside Issue #35.
```

- [ ] **Step 5: Commit verification evidence**

Run from the repository root:

```powershell
git add docs/superpowers/verification/2026-08-25-secure-in-app-notification-backend.md
git commit -m "docs: record notification backend verification"
git status --short --branch
```

Expected: the verification commit succeeds and the branch is clean with only its ahead-of-upstream commits.
