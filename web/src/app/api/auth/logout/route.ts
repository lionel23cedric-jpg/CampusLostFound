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
