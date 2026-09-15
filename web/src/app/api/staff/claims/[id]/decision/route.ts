import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import {
  claimErrorResponse,
  invalidClaimResponse,
} from "@/lib/claims/errors";
import {
  RequestBodyError,
  readJsonRequestBody,
  requestBodyErrorResponse,
} from "@/lib/request-body";
import {
  consumeRateLimit,
  rateLimitedResponse,
  rateLimitPolicies,
} from "@/lib/rate-limit";
import { decideClaim } from "@/lib/claims/staff-service";
import {
  claimDecisionSchema,
  claimIdSchema,
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

  const limit = consumeRateLimit(
    `staff:claim-decision:${user.id}`,
    rateLimitPolicies.privilegedWrite,
  );
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

  let body: unknown;
  try {
    body = await readJsonRequestBody(request);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return error.code === "BODY_TOO_LARGE"
        ? requestBodyErrorResponse(error)
        : invalidClaimResponse();
    }
    return claimErrorResponse(error);
  }
  const parsed = claimDecisionSchema.safeParse(body);
  if (!parsed.success) return invalidClaimResponse(parsed.error);

  try {
    return Response.json({
      claim: await decideClaim(user, parsedId.data, parsed.data),
    });
  } catch (error) {
    return claimErrorResponse(error);
  }
}
