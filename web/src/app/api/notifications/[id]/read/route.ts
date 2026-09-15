import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import {
  invalidNotificationResponse,
  notificationErrorResponse,
} from "@/lib/notifications/errors";
import { markNotificationRead } from "@/lib/notifications/service";
import {
  emptyNotificationBodySchema,
  notificationIdSchema,
} from "@/lib/notifications/validation";
import {
  RequestBodyError,
  readJsonRequestBody,
  requestBodyErrorResponse,
} from "@/lib/request-body";

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

  let body: unknown = {};
  try {
    body = await readJsonRequestBody(request);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      if (error.code === "EMPTY_BODY") {
        body = {};
      } else {
        return noStore(
          error.code === "BODY_TOO_LARGE"
            ? requestBodyErrorResponse(error)
            : invalidNotificationResponse(),
        );
      }
    } else {
      return noStore(notificationErrorResponse(error));
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
