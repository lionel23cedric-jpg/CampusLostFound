import { requireAccountAdministrator } from "@/lib/admin/account-access";
import {
  accountListQuerySchema,
  toAccountListQueryInput,
} from "@/lib/admin/account-contract";
import {
  accountManagementErrorResponse,
  invalidAccountManagementResponse,
} from "@/lib/admin/account-errors";
import { listManagedAccounts } from "@/lib/admin/account-list-service";
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function requireCurrentAdministrator(): Promise<PublicUser> {
  const user = await getCurrentUser(await readSessionCookie());
  if (!user) throw new AuthError("AUTHENTICATION_REQUIRED");
  requireAccountAdministrator(user);
  return user;
}

export async function GET(request: Request) {
  let administrator: PublicUser;
  try {
    administrator = await requireCurrentAdministrator();
  } catch (error) {
    return noStore(accountManagementErrorResponse(error));
  }

  let parsed;
  try {
    parsed = accountListQuerySchema.safeParse(
      toAccountListQueryInput(new URL(request.url).searchParams),
    );
  } catch (error) {
    return noStore(accountManagementErrorResponse(error));
  }
  if (!parsed.success) return noStore(invalidAccountManagementResponse());

  try {
    return Response.json(
      await listManagedAccounts(administrator, parsed.data),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return noStore(accountManagementErrorResponse(error));
  }
}
