import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { toReportBrowseQueryInput } from "@/lib/reports/browse-validation";
import {
  invalidReportQueryResponse,
  reportBrowseErrorResponse,
} from "@/lib/reports/errors";
import { listOwnReports } from "@/lib/reports/owner-history-service";
import { ownerReportHistoryQuerySchema } from "@/lib/reports/owner-history-validation";

export async function GET(request: Request) {
  let user: PublicUser;

  try {
    const currentUser = await getCurrentUser(await readSessionCookie());
    if (!currentUser) throw new AuthError("AUTHENTICATION_REQUIRED");
    user = currentUser;
  } catch (error) {
    return reportBrowseErrorResponse(error);
  }

  let parsed;
  try {
    parsed = ownerReportHistoryQuerySchema.safeParse(
      toReportBrowseQueryInput(new URL(request.url).searchParams),
    );
  } catch (error) {
    return reportBrowseErrorResponse(error);
  }
  if (!parsed.success) return invalidReportQueryResponse(parsed.error);

  try {
    return Response.json(await listOwnReports(user, parsed.data));
  } catch (error) {
    return reportBrowseErrorResponse(error);
  }
}
