import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import { reportIdSchema } from "@/lib/reports/browse-validation";
import { getReport } from "@/lib/reports/browse-service";
import {
  invalidReportQueryResponse,
  reportBrowseErrorResponse,
} from "@/lib/reports/errors";

type ReportDetailContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: ReportDetailContext) {
  let user: PublicUser;

  try {
    const currentUser = await getCurrentUser(await readSessionCookie());
    if (!currentUser) {
      throw new AuthError("AUTHENTICATION_REQUIRED");
    }
    user = currentUser;
  } catch (error) {
    return reportBrowseErrorResponse(error);
  }

  let id: string;
  try {
    id = (await context.params).id;
  } catch (error) {
    return reportBrowseErrorResponse(error);
  }

  const parsed = reportIdSchema.safeParse(id);
  if (!parsed.success) {
    return invalidReportQueryResponse();
  }

  try {
    return Response.json({ report: await getReport(user, parsed.data) });
  } catch (error) {
    return reportBrowseErrorResponse(error);
  }
}
