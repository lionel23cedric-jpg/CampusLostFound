import { requireAccountAdministrator } from "@/lib/admin/account-access";
import { accountRoleInputSchema, accountUserIdSchema } from "@/lib/admin/account-contract";
import { accountManagementErrorResponse, invalidAccountManagementResponse } from "@/lib/admin/account-errors";
import { updateManagedAccountRole } from "@/lib/admin/account-role-service";
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { RequestBodyError, readJsonRequestBody, requestBodyErrorResponse } from "@/lib/request-body";
import { consumeRateLimit, rateLimitedResponse, rateLimitPolicies } from "@/lib/rate-limit";

type Context = { params: Promise<{ userId: string }> };

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function currentAdministrator(): Promise<PublicUser> {
  const user = await getCurrentUser(await readSessionCookie());
  if (!user) throw new AuthError("AUTHENTICATION_REQUIRED");
  requireAccountAdministrator(user);
  return user;
}

export async function PATCH(request: Request, context: Context) {
  let administrator: PublicUser;
  try {
    administrator = await currentAdministrator();
  } catch (error) {
    return noStore(accountManagementErrorResponse(error));
  }

  let userId: string;
  try {
    userId = (await context.params).userId;
  } catch (error) {
    return noStore(accountManagementErrorResponse(error));
  }
  const parsedId = accountUserIdSchema.safeParse(userId);
  const contentType = request.headers.get("content-type");
  if (!parsedId.success || !contentType || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return noStore(invalidAccountManagementResponse());
  }

  const limit = consumeRateLimit(`admin:account-role:${administrator.id}`, rateLimitPolicies.privilegedWrite);
  if (!limit.allowed) return noStore(rateLimitedResponse(limit.retryAfterSeconds));

  let body: unknown;
  try {
    body = await readJsonRequestBody(request);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return noStore(error.code === "BODY_TOO_LARGE"
        ? requestBodyErrorResponse(error)
        : invalidAccountManagementResponse());
    }
    return noStore(accountManagementErrorResponse(error));
  }
  const parsedBody = accountRoleInputSchema.safeParse(body);
  if (!parsedBody.success) return noStore(invalidAccountManagementResponse());

  try {
    return Response.json({
      account: await updateManagedAccountRole(administrator, parsedId.data, parsedBody.data),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return noStore(accountManagementErrorResponse(error));
  }
}
