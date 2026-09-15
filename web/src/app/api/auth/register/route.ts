import { setSessionCookie } from "@/lib/auth/cookie";
import {
  authErrorResponse,
  invalidRequestResponse,
} from "@/lib/auth/errors";
import { registerUser } from "@/lib/auth/service";
import { registerSchema } from "@/lib/auth/validation";
import {
  RequestBodyError,
  readJsonRequestBody,
  requestBodyErrorResponse,
} from "@/lib/request-body";
import {
  clientAddress,
  consumeRateLimit,
  rateLimitedResponse,
  rateLimitPolicies,
} from "@/lib/rate-limit";

export async function POST(request: Request) {
  const limit = consumeRateLimit(
    `auth:register:${clientAddress(request)}`,
    rateLimitPolicies.register,
  );
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

  let body: unknown;

  try {
    body = await readJsonRequestBody(request);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return error.code === "BODY_TOO_LARGE"
        ? requestBodyErrorResponse(error)
        : invalidRequestResponse();
    }
    return authErrorResponse(error);
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequestResponse(parsed.error);
  }

  try {
    const result = await registerUser(parsed.data);
    await setSessionCookie(result.sessionToken);

    return Response.json({ user: result.user }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
