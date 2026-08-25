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

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function requireCurrentUser(): Promise<PublicUser> {
  const user = await getCurrentUser(await readSessionCookie());
  if (!user) throw new AuthError("AUTHENTICATION_REQUIRED");
  return user;
}

function isJsonContentType(request: Request) {
  const contentType = request.headers.get("content-type");
  return contentType !== null && /^application\/json(?:\s*;|$)/i.test(contentType);
}

export async function PATCH(request: Request, context: Context) {
  let user: PublicUser;
  try {
    user = await requireCurrentUser();
  } catch (error) {
    return noStore(notificationErrorResponse(error));
  }

  let rawId: string;
  try {
    rawId = (await context.params).id;
  } catch (error) {
    return noStore(notificationErrorResponse(error));
  }

  const parsedId = notificationIdSchema.safeParse(rawId);
  if (!parsedId.success) {
    return noStore(invalidNotificationResponse());
  }

  let text: string;
  try {
    text = await readNotificationRequestBody(request);
  } catch (error) {
    const response =
      error instanceof NotificationBodyTooLarge ||
      error instanceof InvalidNotificationBodyEncoding
        ? invalidNotificationResponse()
        : notificationErrorResponse(error);
    return noStore(response);
  }

  let body: unknown = {};
  if (text.trim() !== "") {
    if (!isJsonContentType(request)) {
      return noStore(invalidNotificationResponse());
    }
    try {
      body = JSON.parse(text);
    } catch (error) {
      const response =
        error instanceof SyntaxError
          ? invalidNotificationResponse()
          : notificationErrorResponse(error);
      return noStore(response);
    }
  }

  const parsedBody = emptyNotificationBodySchema.safeParse(body);
  if (!parsedBody.success) {
    return noStore(invalidNotificationResponse(parsedBody.error));
  }

  try {
    return Response.json(
      {
        notification: await markNotificationRead(user, parsedId.data),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return noStore(notificationErrorResponse(error));
  }
}
