import { imageCategoryResponseSchema } from "@/lib/ai/contracts";
import { suggestImageCategories } from "@/lib/ai/image-classifier";
import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError, authErrorResponse } from "@/lib/auth/errors";
import {
  REPORT_IMAGE_CONTENT_TYPES,
  REPORT_IMAGE_MAX_BYTES,
  REPORT_IMAGE_REQUEST_MAX_BYTES,
} from "@/lib/reports/photo-reference";
import { listActiveCategories } from "@/lib/reports/reference-data";
import { readAndValidateReportImageFile } from "@/lib/reports/image-validation";
import { readMultipartRequestBody } from "@/lib/request-body";
import { consumeRateLimit, rateLimitedResponse, rateLimitPolicies } from "@/lib/rate-limit";

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

  const limit = consumeRateLimit(`ai:${user.id}`, rateLimitPolicies.aiInference);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfterSeconds);

  let form: FormData;
  try {
    form = await readMultipartRequestBody(request, REPORT_IMAGE_REQUEST_MAX_BYTES);
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
  if (!supportedTypes.has(image.type) || image.size === 0 || image.size > REPORT_IMAGE_MAX_BYTES) {
    return safeError("AI_IMAGE_INVALID", "Image request is invalid", 400);
  }

  let sanitised: Blob;
  try {
    const validated = await readAndValidateReportImageFile(image);
    sanitised = new Blob([new Uint8Array(validated.data)], {
      type: validated.contentType,
    });
  } catch {
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
      await suggestImageCategories(sanitised, categories),
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
