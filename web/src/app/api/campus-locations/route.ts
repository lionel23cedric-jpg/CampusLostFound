import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import { referenceDataErrorResponse } from "@/lib/reports/errors";
import { listActiveCampusLocations } from "@/lib/reports/reference-data";

export async function GET() {
  try {
    const user = await getCurrentUser(await readSessionCookie());
    if (!user) {
      throw new AuthError("AUTHENTICATION_REQUIRED");
    }

    return Response.json({
      campusLocations: await listActiveCampusLocations(),
    });
  } catch (error) {
    return referenceDataErrorResponse(error);
  }
}
