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
  // Identity and role come from the server-side session cookie; this route
  // never accepts client-supplied administrator claims.
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

  // The snapshot has no supported filters. Rejecting unknown query input keeps
  // the endpoint contract strict and avoids silently ignored parameters.
  if (new URL(request.url).searchParams.size > 0) {
    return invalidAdminOverviewQueryResponse();
  }

  try {
    // Administrator totals are sensitive operational data and must not be
    // reused from a browser or intermediary cache.
    return Response.json(await getAdministratorOverview(administrator), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return adminOverviewErrorResponse(error);
  }
}
