import { requireAccountAdministrator } from "@/lib/admin/account-access";
import {
  accountStatusInputSchema,
  accountUserIdSchema,
} from "@/lib/admin/account-contract";
import {
  accountManagementErrorResponse,
  invalidAccountManagementResponse,
} from "@/lib/admin/account-errors";
import {
  AccountBodyTooLarge,
  InvalidAccountBodyEncoding,
  readAccountRequestBody,
} from "@/lib/admin/account-request-body";
import { updateManagedAccountStatus } from "@/lib/admin/account-status-service";
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";

type Context = { params: Promise<{ userId: string }> };

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function isJsonContentType(request: Request) {
  const value = request.headers.get("content-type");
  return value !== null && /^application\/json(?:\s*;|$)/i.test(value);
}

async function requireCurrentAdministrator(): Promise<PublicUser> {
  const user = await getCurrentUser(await readSessionCookie());
  if (!user) throw new AuthError("AUTHENTICATION_REQUIRED");
  requireAccountAdministrator(user);
  return user;
}

export async function PATCH(request: Request, context: Context) {
  let administrator: PublicUser;
  try {
    administrator = await requireCurrentAdministrator();
  } catch (error) {
    return noStore(accountManagementErrorResponse(error));
  }

  let rawUserId: string;
  try {
    rawUserId = (await context.params).userId;
  } catch (error) {
    return noStore(accountManagementErrorResponse(error));
  }
  const parsedId = accountUserIdSchema.safeParse(rawUserId);
  if (!parsedId.success || !isJsonContentType(request)) {
    return noStore(invalidAccountManagementResponse());
  }

  let text: string;
  try {
    text = await readAccountRequestBody(request);
  } catch (error) {
    return noStore(
      error instanceof AccountBodyTooLarge ||
        error instanceof InvalidAccountBodyEncoding
        ? invalidAccountManagementResponse()
        : accountManagementErrorResponse(error),
    );
  }
  if (text.trim() === "") return noStore(invalidAccountManagementResponse());

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (error) {
    return noStore(
      error instanceof SyntaxError
        ? invalidAccountManagementResponse()
        : accountManagementErrorResponse(error),
    );
  }
  const parsedBody = accountStatusInputSchema.safeParse(body);
  if (!parsedBody.success) return noStore(invalidAccountManagementResponse());

  try {
    return Response.json(
      {
        account: await updateManagedAccountStatus(
          administrator,
          parsedId.data,
          parsedBody.data,
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return noStore(accountManagementErrorResponse(error));
  }
}
