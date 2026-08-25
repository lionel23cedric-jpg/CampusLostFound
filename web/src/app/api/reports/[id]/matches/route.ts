import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { reportIdSchema } from "@/lib/reports/browse-validation";
import { invalidReportQueryResponse } from "@/lib/reports/errors";
import { matchingErrorResponse } from "@/lib/reports/matching-errors";
import { findReportMatches } from "@/lib/reports/matching-service";

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: Context) {
  let user: PublicUser;

  try {
    const currentUser = await getCurrentUser(await readSessionCookie());
    if (!currentUser) {
      throw new AuthError("AUTHENTICATION_REQUIRED");
    }
    user = currentUser;
  } catch (error) {
    return matchingErrorResponse(error);
  }

  let id: string;
  try {
    id = (await context.params).id;
  } catch (error) {
    return matchingErrorResponse(error);
  }

  const parsed = reportIdSchema.safeParse(id);
  if (!parsed.success) {
    return invalidReportQueryResponse();
  }

  try {
    return Response.json(await findReportMatches(user, parsed.data));
  } catch (error) {
    return matchingErrorResponse(error);
  }
}
