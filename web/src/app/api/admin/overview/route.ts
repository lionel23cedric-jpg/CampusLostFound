import {
  adminOverviewErrorResponse,
  invalidAdminOverviewQueryResponse,
} from "@/lib/admin/errors";
import {
  getAdministratorOverview,
  requireAdministrator,
} from "@/lib/admin/overview-service";
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";

async function requireCurrentAdministrator(): Promise<PublicUser> {
  const user = await getCurrentUser(await readSessionCookie());
  if (!user) throw new AuthError("AUTHENTICATION_REQUIRED");

  requireAdministrator(user);
  return user;
}

export async function GET(request: Request) {
  let administrator: PublicUser;
  try {
    administrator = await requireCurrentAdministrator();
  } catch (error) {
    return adminOverviewErrorResponse(error);
  }

  if (new URL(request.url).searchParams.size > 0) {
    return invalidAdminOverviewQueryResponse();
  }

  try {
    return Response.json(await getAdministratorOverview(administrator), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return adminOverviewErrorResponse(error);
  }
}
