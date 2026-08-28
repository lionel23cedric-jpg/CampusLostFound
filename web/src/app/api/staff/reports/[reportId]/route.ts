import type { PublicUser } from "@/lib/auth/public-user";
import { getCurrentStaffReportUser } from "@/lib/staff-reports/access";
import {
  invalidStaffReportResponse,
  staffReportErrorResponse,
} from "@/lib/staff-reports/errors";
import { getStaffReport } from "@/lib/staff-reports/service";
import { staffReportIdSchema } from "@/lib/staff-reports/validation";

type Context = { params: Promise<{ reportId: string }> };

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(_request: Request, context: Context) {
  let user: PublicUser;
  try {
    user = await getCurrentStaffReportUser();
  } catch (error) {
    return noStore(staffReportErrorResponse(error));
  }

  let rawId: string;
  try {
    rawId = (await context.params).reportId;
  } catch (error) {
    return noStore(staffReportErrorResponse(error));
  }
  const parsedId = staffReportIdSchema.safeParse(rawId);
  if (!parsedId.success) {
    return noStore(invalidStaffReportResponse(parsedId.error));
  }

  try {
    return noStore(
      Response.json({ report: await getStaffReport(user, parsedId.data) }),
    );
  } catch (error) {
    return noStore(staffReportErrorResponse(error));
  }
}
