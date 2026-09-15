import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import {
  invalidProfileResponse,
  profileErrorResponse,
} from "@/lib/profile/errors";
import { getOwnProfile, updateOwnProfile } from "@/lib/profile/service";
import { updateProfileSchema } from "@/lib/profile/validation";
import {
  RequestBodyError,
  readJsonRequestBody,
  requestBodyErrorResponse,
} from "@/lib/request-body";

async function requireCurrentUser(): Promise<PublicUser> {
  const user = await getCurrentUser(await readSessionCookie());
  if (!user) throw new AuthError("AUTHENTICATION_REQUIRED");
  return user;
}

export async function GET() {
  try {
    const user = await requireCurrentUser();
    return Response.json({ profile: await getOwnProfile(user.id) });
  } catch (error) {
    return profileErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  let user: PublicUser;

  try {
    user = await requireCurrentUser();
  } catch (error) {
    return profileErrorResponse(error);
  }

  let body: unknown;
  try {
    body = await readJsonRequestBody(request);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return error.code === "BODY_TOO_LARGE"
        ? requestBodyErrorResponse(error)
        : invalidProfileResponse();
    }
    return profileErrorResponse(error);
  }

  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) return invalidProfileResponse(parsed.error);

  try {
    return Response.json(await updateOwnProfile(user, parsed.data));
  } catch (error) {
    return profileErrorResponse(error);
  }
}
