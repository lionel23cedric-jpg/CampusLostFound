import type { PublicUser } from "@/lib/auth/public-user";
import { getCurrentStaffReportUser } from "@/lib/staff-reports/access";
import {
  invalidStaffReportResponse,
  staffReportErrorResponse,
} from "@/lib/staff-reports/errors";
import { listStaffReports } from "@/lib/staff-reports/service";
import {
  staffReportListQuerySchema,
  toStaffReportQueryInput,
} from "@/lib/staff-reports/validation";

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request) {
  let user: PublicUser;
  try {
    user = await getCurrentStaffReportUser();
  } catch (error) {
    return noStore(staffReportErrorResponse(error));
  }

  let parsed;
  try {
    parsed = staffReportListQuerySchema.safeParse(
      toStaffReportQueryInput(new URL(request.url).searchParams),
    );
  } catch (error) {
    return noStore(staffReportErrorResponse(error));
  }
  if (!parsed.success) {
    return noStore(invalidStaffReportResponse(parsed.error));
  }

  try {
    return noStore(Response.json(await listStaffReports(user, parsed.data)));
  } catch (error) {
    return noStore(staffReportErrorResponse(error));
  }
}
