import type { PublicUser } from "@/lib/auth/public-user";
import {
  BodyTooLarge,
  InvalidBodyEncoding,
  readClaimRequestBody,
} from "@/lib/claims/request-body";
import { isJsonRequest } from "@/lib/moderation/validation";
import { getCurrentStaffReportUser } from "@/lib/staff-reports/access";
import {
  invalidStaffReportResponse,
  staffReportErrorResponse,
} from "@/lib/staff-reports/errors";
import { verifyStaffReport } from "@/lib/staff-reports/service";
import {
  staffReportIdSchema,
  verifyReportSchema,
} from "@/lib/staff-reports/validation";

type Context = { params: Promise<{ reportId: string }> };

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: Request, context: Context) {
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
  if (!isJsonRequest(request)) {
    return noStore(invalidStaffReportResponse());
  }

  let text: string;
  try {
    text = await readClaimRequestBody(request);
  } catch (error) {
    return noStore(
      error instanceof BodyTooLarge || error instanceof InvalidBodyEncoding
        ? invalidStaffReportResponse()
        : staffReportErrorResponse(error),
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (error) {
    return noStore(
      error instanceof SyntaxError
        ? invalidStaffReportResponse()
        : staffReportErrorResponse(error),
    );
  }
  const parsedBody = verifyReportSchema.safeParse(body);
  if (!parsedBody.success) {
    return noStore(invalidStaffReportResponse(parsedBody.error));
  }

  try {
    return noStore(
      Response.json({
        report: await verifyStaffReport(user, parsedId.data, parsedBody.data),
      }),
    );
  } catch (error) {
    return noStore(staffReportErrorResponse(error));
  }
}
