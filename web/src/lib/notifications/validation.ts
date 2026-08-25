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
        throw new Error("Cursor encoding is not canonical");
      }

      const parsed = cursorPayloadSchema.safeParse(JSON.parse(decoded));
      if (!parsed.success) throw new Error("Cursor payload is invalid");

      const cursor = {
        createdAt: new Date(parsed.data.createdAt),
        id: parsed.data.id,
      };
      if (encodeNotificationCursor(cursor) !== value) {
        throw new Error("Cursor payload is not canonical");
      }
      return cursor;
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
