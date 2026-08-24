import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { listOwnClaims } from "@/lib/claims/claimant-service";
import {
  claimErrorResponse,
  invalidClaimResponse,
} from "@/lib/claims/errors";
import {
  claimListQuerySchema,
  toClaimListQueryInput,
} from "@/lib/claims/validation";

export async function GET(request: Request) {
  let user: PublicUser;
  try {
    const current = await getCurrentUser(await readSessionCookie());
    if (!current) throw new AuthError("AUTHENTICATION_REQUIRED");
    user = current;
  } catch (error) {
    return claimErrorResponse(error);
  }

  let parsed;
  try {
    parsed = claimListQuerySchema.safeParse(
      toClaimListQueryInput(new URL(request.url).searchParams),
    );
  } catch (error) {
    return claimErrorResponse(error);
  }

  if (!parsed.success) return invalidClaimResponse(parsed.error);

  try {
    return Response.json(await listOwnClaims(user, parsed.data));
  } catch (error) {
    return claimErrorResponse(error);
  }
}
