import {
  reportAssistantRequestSchema,
  reportAssistantResponseSchema,
} from "@/lib/ai/contracts";
import { suggestReportDetails } from "@/lib/ai/report-assistant";
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { PublicUser } from "@/lib/auth/public-user";
import { consumeRateLimit, rateLimitedResponse, rateLimitPolicies } from "@/lib/rate-limit";
import {
  AuthError,
  authErrorResponse,
  invalidRequestResponse,
} from "@/lib/auth/errors";
import {
  RequestBodyError,
  readJsonRequestBody,
  requestBodyErrorResponse,
} from "@/lib/request-body";

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function assistantErrorResponse() {
  return noStore(Response.json(
    {
      error: {
        code: "AI_ASSISTANT_FAILED",
        message: "Unable to suggest report wording",
      },
    },
    { status: 500 },
  ));
}

export async function POST(request: Request) {
  let user: PublicUser;
  try {
    const current = await getCurrentUser(await readSessionCookie(), {
      includeInactive: true,
    });
    if (!current) throw new AuthError("AUTHENTICATION_REQUIRED");
    if (current.status !== "active") throw new AuthError("ACCOUNT_UNAVAILABLE");
    user = current;
  } catch (error) {
    return noStore(authErrorResponse(error));
  }

  const limit = consumeRateLimit(`ai:${user.id}`, rateLimitPolicies.aiInference);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

  let body: unknown;
  try {
    body = await readJsonRequestBody(request);
  } catch (error) {
    return error instanceof RequestBodyError
      ? noStore(requestBodyErrorResponse(error))
      : assistantErrorResponse();
  }

  const parsed = reportAssistantRequestSchema.safeParse(body);
  if (!parsed.success) return noStore(invalidRequestResponse(parsed.error));

  try {
    const suggestion = reportAssistantResponseSchema.parse(
      await suggestReportDetails(parsed.data),
    );
    return noStore(Response.json(suggestion));
  } catch {
    return assistantErrorResponse();
  }
}
