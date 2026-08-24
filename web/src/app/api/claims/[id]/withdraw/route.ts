import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { withdrawOwnClaim } from "@/lib/claims/claimant-service";
import {
  claimErrorResponse,
  invalidClaimResponse,
} from "@/lib/claims/errors";
import {
  BodyTooLarge,
  InvalidBodyEncoding,
  readClaimRequestBody,
} from "@/lib/claims/request-body";
import {
  claimIdSchema,
  emptyClaimBodySchema,
} from "@/lib/claims/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
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

  let text: string;
  try {
    text = await readClaimRequestBody(request);
  } catch (error) {
    return error instanceof BodyTooLarge || error instanceof InvalidBodyEncoding
      ? invalidClaimResponse()
      : claimErrorResponse(error);
  }

  let body: unknown = {};
  if (text.trim() !== "") {
    try {
      body = JSON.parse(text);
    } catch (error) {
      return error instanceof SyntaxError
        ? invalidClaimResponse()
        : claimErrorResponse(error);
    }
  }

  const parsed = emptyClaimBodySchema.safeParse(body);
  if (!parsed.success) return invalidClaimResponse(parsed.error);

  try {
    return Response.json({
      claim: await withdrawOwnClaim(user, parsedId.data),
    });
  } catch (error) {
    return claimErrorResponse(error);
  }
}
