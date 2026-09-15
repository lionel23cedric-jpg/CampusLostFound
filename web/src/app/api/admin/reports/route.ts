import type { PublicUser } from "@/lib/auth/public-user";
import { getCurrentModerationAdministrator } from "@/lib/moderation/access";
import { listAdminReports } from "@/lib/moderation/admin-service";
import {
  invalidModerationResponse,
  moderationErrorResponse,
} from "@/lib/moderation/errors";
import {
  adminReportListQuerySchema,
  toModerationQueryInput,
} from "@/lib/moderation/validation";

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request) {
  let administrator: PublicUser;
  try {
    // Only an active server-authenticated administrator can reach report filters.
    administrator = await getCurrentModerationAdministrator();
  } catch (error) {
    return noStore(moderationErrorResponse(error));
  }

  let parsed;
  try {
    parsed = adminReportListQuerySchema.safeParse(
      toModerationQueryInput(new URL(request.url).searchParams),
    );
  } catch (error) {
    return noStore(moderationErrorResponse(error));
  }
  if (!parsed.success) {
    return noStore(invalidModerationResponse(parsed.error));
  }

  try {
    return Response.json(
      await listAdminReports(administrator, parsed.data),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return noStore(moderationErrorResponse(error));
  }
}
