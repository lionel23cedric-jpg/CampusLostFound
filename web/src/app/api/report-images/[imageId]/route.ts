import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { PublicUser } from "@/lib/auth/public-user";
import {
  ReportImageError,
  reportImageErrorResponse,
} from "@/lib/reports/image-errors";
import { readReportImage } from "@/lib/reports/image-read-service";

type Context = { params: Promise<{ imageId: string }> };

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(_request: Request, context: Context) {
  let user: PublicUser;
  try {
    const current = await getCurrentUser(await readSessionCookie(), {
      includeInactive: true,
    });
    if (!current) throw new ReportImageError("AUTHENTICATION_REQUIRED");
    if (current.status !== "active") {
      throw new ReportImageError("ACCOUNT_UNAVAILABLE");
    }
    user = current;
  } catch (error) {
    return noStore(reportImageErrorResponse(error));
  }

  let imageId: string;
  try {
    const rawId = (await context.params).imageId;
    if (!OBJECT_ID_PATTERN.test(rawId)) {
      throw new ReportImageError("REPORT_IMAGE_NOT_FOUND");
    }
    imageId = rawId.toLowerCase();
  } catch (error) {
    return noStore(reportImageErrorResponse(error));
  }

  try {
    const image = await readReportImage({
      imageId,
      actorId: user.id,
      actorRole: user.role,
    });
    return new Response(Uint8Array.from(image.data), {
      headers: {
        "Content-Type": image.contentType,
        "Content-Length": String(image.byteLength),
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=300, no-transform",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return noStore(reportImageErrorResponse(error));
  }
}
