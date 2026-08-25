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

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

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
    return noStore(notificationErrorResponse(error));
  }

  let parsed;
  try {
    parsed = notificationListQuerySchema.safeParse(
      toNotificationListQueryInput(new URL(request.url).searchParams),
    );
  } catch (error) {
    return noStore(notificationErrorResponse(error));
  }
  if (!parsed.success) {
    return noStore(invalidNotificationResponse(parsed.error));
  }

  try {
    return Response.json(await listNotifications(user, parsed.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return noStore(notificationErrorResponse(error));
  }
}
