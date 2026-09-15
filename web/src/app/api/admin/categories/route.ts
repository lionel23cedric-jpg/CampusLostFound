import { getCurrentReferenceDataAdministrator } from "@/lib/admin/reference-data-access";
import {
  createAdminCategorySchema,
  referenceDataListQuerySchema,
  toReferenceDataListQueryInput,
} from "@/lib/admin/reference-data-contract";
import {
  invalidReferenceDataResponse,
  referenceDataManagementErrorResponse,
} from "@/lib/admin/reference-data-errors";
import {
  createAdminCategory,
  listAdminCategories,
} from "@/lib/admin/category-service";
import type { PublicUser } from "@/lib/auth/public-user";
import {
  RequestBodyError,
  readJsonRequestBody,
  requestBodyErrorResponse,
} from "@/lib/request-body";
import {
  consumeRateLimit,
  rateLimitedResponse,
  rateLimitPolicies,
} from "@/lib/rate-limit";

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function isJsonContentType(request: Request) {
  const value = request.headers.get("content-type");
  return value !== null && /^application\/json(?:\s*;|$)/i.test(value);
}

export async function GET(request: Request) {
  let administrator: PublicUser;
  try {
    administrator = await getCurrentReferenceDataAdministrator();
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }

  let parsed;
  try {
    parsed = referenceDataListQuerySchema.safeParse(
      toReferenceDataListQueryInput(new URL(request.url).searchParams),
    );
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }
  if (!parsed.success) return noStore(invalidReferenceDataResponse());

  try {
    return Response.json(await listAdminCategories(administrator, parsed.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }
}

export async function POST(request: Request) {
  let administrator: PublicUser;
  try {
    // Authenticate first, then apply bounded decoding and strict schema validation
    // before any value can reach the database service.
    administrator = await getCurrentReferenceDataAdministrator();
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }

  if (!isJsonContentType(request)) {
    return noStore(invalidReferenceDataResponse());
  }

  const limit = consumeRateLimit(
    `admin:category-create:${administrator.id}`,
    rateLimitPolicies.privilegedWrite,
  );
  if (!limit.allowed) {
    return noStore(rateLimitedResponse(limit.retryAfterSeconds));
  }

  let body: unknown;
  try {
    body = await readJsonRequestBody(request);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return noStore(
        error.code === "BODY_TOO_LARGE"
          ? requestBodyErrorResponse(error)
          : invalidReferenceDataResponse(),
      );
    }
    return noStore(referenceDataManagementErrorResponse(error));
  }

  const parsed = createAdminCategorySchema.safeParse(body);
  if (!parsed.success) return noStore(invalidReferenceDataResponse());

  try {
    return Response.json(
      { category: await createAdminCategory(administrator, parsed.data) },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }
}
