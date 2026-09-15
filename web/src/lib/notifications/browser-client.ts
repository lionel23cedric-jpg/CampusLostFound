import { z } from "zod";

const GENERIC_MESSAGE = "We could not complete that request. Please try again.";
const NETWORK_MESSAGE = "We could not reach the service. Please try again.";

export const NOTIFICATION_KINDS = [
  "possible_match",
  "claim_received",
  "claim_withdrawn",
  "claim_approved",
  "claim_rejected",
  "claim_handover_ready",
  "claim_completed",
  "report_recovered",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];
export type PublicNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  summary: string;
  action: { label: string; href: string };
  createdAt: string;
  readAt: string | null;
  isRead: boolean;
};
export type NotificationPage = {
  notifications: PublicNotification[];
  pagination: { nextCursor: string | null; hasMore: boolean };
  unreadCount: number;
};
export type NotificationListInput = { pageSize?: number; cursor?: string };

export type NotificationBrowserErrorCode =
  | "VALIDATION_ERROR"
  | "AUTHENTICATION_REQUIRED"
  | "NOTIFICATION_FORBIDDEN"
  | "NOTIFICATION_NOT_FOUND"
  | "NOTIFICATION_OPERATION_FAILED"
  | "REQUEST_FAILED"
  | "NETWORK_ERROR";

const SAFE_ERROR_CODES = [
  "VALIDATION_ERROR",
  "AUTHENTICATION_REQUIRED",
  "NOTIFICATION_FORBIDDEN",
  "NOTIFICATION_NOT_FOUND",
  "NOTIFICATION_OPERATION_FAILED",
] as const;

const errorDefinitions = {
  VALIDATION_ERROR: { status: 400, message: "Invalid notification request" },
  AUTHENTICATION_REQUIRED: {
    status: 401,
    message: "Authentication required",
  },
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

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/);
const notificationSchema = z
  .strictObject({
    id: objectIdSchema,
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
  .refine((value) => value.isRead === (value.readAt !== null));

const notificationPageSchema = z.strictObject({
  notifications: z.array(notificationSchema).max(50),
  pagination: z.strictObject({
    nextCursor: z.string().min(1).max(512).nullable(),
    hasMore: z.boolean(),
  }),
  unreadCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

const markReadResponseSchema = z.strictObject({
  notification: notificationSchema,
});

const listInputSchema = z.strictObject({
  pageSize: z.number().int().min(1).max(50).optional(),
  cursor: z.string().min(1).max(512).optional(),
});

const errorResponseSchema = z.strictObject({
  error: z.strictObject({
    code: z.enum(SAFE_ERROR_CODES),
    message: z.string().min(1),
    fields: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

export class NotificationBrowserError extends Error {
  constructor(
    readonly code: NotificationBrowserErrorCode,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "NotificationBrowserError";
  }
}

function requestFailedError(status: number) {
  return new NotificationBrowserError("REQUEST_FAILED", status, GENERIC_MESSAGE);
}

function validationError() {
  const definition = errorDefinitions.VALIDATION_ERROR;
  return new NotificationBrowserError(
    "VALIDATION_ERROR",
    definition.status,
    definition.message,
  );
}

async function fetchSameOrigin(path: string, init: RequestInit) {
  try {
    return await fetch(path, { ...init, credentials: "same-origin" });
  } catch {
    throw new NotificationBrowserError("NETWORK_ERROR", 0, NETWORK_MESSAGE);
  }
}

async function parseResponse<T>(response: Response, schema: z.ZodType<T>) {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw requestFailedError(response.status);
  }

  if (!response.ok) {
    const parsed = errorResponseSchema.safeParse(body);
    if (!parsed.success) throw requestFailedError(response.status);

    const { code, fields } = parsed.data.error;
    const definition = errorDefinitions[code];
    if (
      response.status !== definition.status ||
      (code !== "VALIDATION_ERROR" && fields !== undefined)
    ) {
      throw requestFailedError(response.status);
    }

    throw new NotificationBrowserError(code, definition.status, definition.message);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) throw requestFailedError(response.status);
  return parsed.data;
}

export async function getNotifications(
  input: NotificationListInput = {},
): Promise<NotificationPage> {
  const parsed = listInputSchema.safeParse(input);
  if (!parsed.success) throw validationError();

  const search = new URLSearchParams();
  if (parsed.data.pageSize !== undefined) {
    search.set("pageSize", String(parsed.data.pageSize));
  }
  if (parsed.data.cursor !== undefined) {
    search.set("cursor", parsed.data.cursor);
  }
  const query = search.toString();
  const response = await fetchSameOrigin(
    query ? `/api/notifications?${query}` : "/api/notifications",
    { method: "GET" },
  );
  return parseResponse(response, notificationPageSchema);
}

export async function markNotificationRead(
  notificationId: string,
): Promise<PublicNotification> {
  const parsed = objectIdSchema.safeParse(notificationId);
  if (!parsed.success) throw validationError();

  const response = await fetchSameOrigin(
    `/api/notifications/${parsed.data}/read`,
    { method: "PATCH" },
  );
  return (await parseResponse(response, markReadResponseSchema)).notification;
}
