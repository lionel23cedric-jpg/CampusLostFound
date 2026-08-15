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
