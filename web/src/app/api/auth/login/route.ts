import { createHash } from "node:crypto";

import { setSessionCookie } from "@/lib/auth/cookie";
import {
  authErrorResponse,
  invalidRequestResponse,
} from "@/lib/auth/errors";
import { loginUser } from "@/lib/auth/service";
import { loginSchema } from "@/lib/auth/validation";
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

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequestResponse(parsed.error);
  }

  const identity = createHash("sha256")
    .update(parsed.data.email)
    .digest("hex");
  const limit = consumeRateLimit(
    `auth:login:${clientAddress(request)}:${identity}`,
    rateLimitPolicies.login,
  );
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

  try {
    const result = await loginUser(parsed.data);
    await setSessionCookie(result.sessionToken);

    return Response.json({ user: result.user });
  } catch (error) {
    return authErrorResponse(error);
  }
}
