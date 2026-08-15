import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";
import {
  reportBrowseQuerySchema,
  toReportBrowseQueryInput,
} from "@/lib/reports/browse-validation";
import { listReports } from "@/lib/reports/browse-service";
import {
  invalidReportQueryResponse,
  invalidReportResponse,
  reportBrowseErrorResponse,
  reportErrorResponse,
} from "@/lib/reports/errors";
import { createReport } from "@/lib/reports/service";
import { createReportSchema } from "@/lib/reports/validation";

export async function GET(request: Request) {
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

  let parsed;
  try {
    parsed = reportBrowseQuerySchema.safeParse(
      toReportBrowseQueryInput(new URL(request.url).searchParams),
    );
  } catch (error) {
    return reportBrowseErrorResponse(error);
  }

  if (!parsed.success) {
    return invalidReportQueryResponse(parsed.error);
  }

  try {
    return Response.json(await listReports(user, parsed.data));
  } catch (error) {
    return reportBrowseErrorResponse(error);
  }
}

export async function POST(request: Request) {
  let user: PublicUser;

  try {
    const currentUser = await getCurrentUser(await readSessionCookie());
    if (!currentUser) {
      throw new AuthError("AUTHENTICATION_REQUIRED");
    }
    user = currentUser;
  } catch (error) {
    return reportErrorResponse(error);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    return error instanceof SyntaxError
      ? invalidReportResponse()
      : reportErrorResponse(error);
  }

  const parsed = createReportSchema.safeParse(body);
  if (!parsed.success) {
    return invalidReportResponse(parsed.error);
  }

  try {
    return Response.json(
      { report: await createReport(user, parsed.data) },
      { status: 201 },
    );
  } catch (error) {
    return reportErrorResponse(error);
  }
}
