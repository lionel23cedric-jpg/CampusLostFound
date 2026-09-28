import { imageCategoryResponseSchema } from "@/lib/ai/contracts";
import { suggestImageCategories } from "@/lib/ai/image-classifier";
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError, authErrorResponse } from "@/lib/auth/errors";
import {
  REPORT_IMAGE_CONTENT_TYPES,
  REPORT_IMAGE_MAX_BYTES,
} from "@/lib/reports/photo-reference";
import { listActiveCategories } from "@/lib/reports/reference-data";

const supportedTypes = new Set<string>(REPORT_IMAGE_CONTENT_TYPES);

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function safeError(
  code:
    | "ACTIVE_ACCOUNT_REQUIRED"
    | "AI_IMAGE_INVALID"
    | "CATEGORY_UNAVAILABLE"
    | "AI_IMAGE_UNAVAILABLE",
  message: string,
  status: number,
) {
  return noStore(Response.json({ error: { code, message } }, { status }));
}

export async function POST(request: Request) {
  let user;
  try {
    user = await getCurrentUser(await readSessionCookie(), {
      includeInactive: true,
    });
    if (!user) throw new AuthError("AUTHENTICATION_REQUIRED");
  } catch (error) {
    return noStore(authErrorResponse(error));
  }
  if (user.status !== "active") {
    return safeError(
      "ACTIVE_ACCOUNT_REQUIRED",
      "An active account is required",
      403,
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return safeError("AI_IMAGE_INVALID", "Image request is invalid", 400);
  }

  const entries = [...form.entries()];
  if (
    entries.length !== 1 ||
    entries[0][0] !== "image" ||
    !(entries[0][1] instanceof File)
  ) {
    return safeError("AI_IMAGE_INVALID", "Image request is invalid", 400);
  }
  const image = entries[0][1];
  if (!supportedTypes.has(image.type) || image.size > REPORT_IMAGE_MAX_BYTES) {
    return safeError("AI_IMAGE_INVALID", "Image request is invalid", 400);
  }

  try {
    const categories = await listActiveCategories();
    if (categories.length === 0) {
      return safeError(
        "CATEGORY_UNAVAILABLE",
        "No active report categories are available",
        422,
      );
    }
    const result = imageCategoryResponseSchema.parse(
      await suggestImageCategories(image, categories),
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return safeError(
      "AI_IMAGE_UNAVAILABLE",
      "Image category suggestions are temporarily unavailable",
      500,
    );
  }
}
