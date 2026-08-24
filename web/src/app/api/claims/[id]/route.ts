import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { getOwnClaim } from "@/lib/claims/claimant-service";
import {
  claimErrorResponse,
  invalidClaimResponse,
} from "@/lib/claims/errors";
import { claimIdSchema } from "@/lib/claims/validation";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  let user: PublicUser;
  try {
    const current = await getCurrentUser(await readSessionCookie());
    if (!current) throw new AuthError("AUTHENTICATION_REQUIRED");
    user = current;
  } catch (error) {
    return claimErrorResponse(error);
  }

  let rawId: string;
  try {
    rawId = (await context.params).id;
  } catch (error) {
    return claimErrorResponse(error);
  }

  const parsedId = claimIdSchema.safeParse(rawId);
  if (!parsedId.success) return invalidClaimResponse();

  try {
    return Response.json({ claim: await getOwnClaim(user, parsedId.data) });
  } catch (error) {
    return claimErrorResponse(error);
  }
}
