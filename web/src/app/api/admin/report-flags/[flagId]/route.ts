import type { PublicUser } from "@/lib/auth/public-user";
import { getCurrentModerationAdministrator } from "@/lib/moderation/access";
import { resolveReportFlag } from "@/lib/moderation/admin-service";
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
import {
  invalidModerationResponse,
  moderationErrorResponse,
} from "@/lib/moderation/errors";
import {
  isJsonRequest,
  moderationObjectIdSchema,
  reportFlagDecisionSchema,
} from "@/lib/moderation/validation";

type Context = {
  params: Promise<{ flagId: string }>;
};

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function PATCH(request: Request, context: Context) {
  let administrator: PublicUser;
  try {
    // The server session supplies the administrator; strict parsing limits the body
    // to one documented decision shape and its concurrency timestamps.
    administrator = await getCurrentModerationAdministrator();
  } catch (error) {
    return noStore(moderationErrorResponse(error));
  }

  let rawId: string;
  try {
    rawId = (await context.params).flagId;
  } catch (error) {
    return noStore(moderationErrorResponse(error));
  }

  const parsedId = moderationObjectIdSchema.safeParse(rawId);
  if (!parsedId.success) {
    return noStore(invalidModerationResponse(parsedId.error));
  }
  if (!isJsonRequest(request)) {
    return noStore(invalidModerationResponse());
  }

  const limit = consumeRateLimit(
    `admin:flag-decision:${administrator.id}`,
    rateLimitPolicies.privilegedWrite,
  );
  if (!limit.allowed) {
    return noStore(rateLimitedResponse(limit.retryAfterSeconds));
  }

  let body: unknown;
  try {
    body = await readJsonRequestBody(request);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return noStore(
        error.code === "BODY_TOO_LARGE"
          ? requestBodyErrorResponse(error)
          : invalidModerationResponse(),
      );
    }
    return noStore(moderationErrorResponse(error));
  }

  const parsedBody = reportFlagDecisionSchema.safeParse(body);
  if (!parsedBody.success) {
    return noStore(invalidModerationResponse(parsedBody.error));
  }

  try {
    return noStore(
      Response.json(
        await resolveReportFlag(
          administrator,
          parsedId.data,
          parsedBody.data,
        ),
      ),
    );
  } catch (error) {
    return noStore(moderationErrorResponse(error));
  }
}
