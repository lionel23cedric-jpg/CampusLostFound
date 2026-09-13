import { getCurrentReferenceDataAdministrator } from "@/lib/admin/reference-data-access";
import {
  createAdminCampusLocationSchema,
  referenceDataListQuerySchema,
  toReferenceDataListQueryInput,
} from "@/lib/admin/reference-data-contract";
import {
  invalidReferenceDataResponse,
  referenceDataManagementErrorResponse,
} from "@/lib/admin/reference-data-errors";
import {
  InvalidReferenceDataBodyEncoding,
  readReferenceDataRequestBody,
  ReferenceDataBodyTooLarge,
} from "@/lib/admin/reference-data-request-body";
import {
  createAdminCampusLocation,
  listAdminCampusLocations,
} from "@/lib/admin/campus-location-service";
import type { PublicUser } from "@/lib/auth/public-user";

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
    return Response.json(
      await listAdminCampusLocations(administrator, parsed.data),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }
}

export async function POST(request: Request) {
  let administrator: PublicUser;
  try {
    // Active-administrator authorization precedes parsing of the bounded JSON body.
    administrator = await getCurrentReferenceDataAdministrator();
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }

  if (!isJsonContentType(request)) {
    return noStore(invalidReferenceDataResponse());
  }

  let text: string;
  try {
    text = await readReferenceDataRequestBody(request);
  } catch (error) {
    return noStore(
      error instanceof ReferenceDataBodyTooLarge ||
        error instanceof InvalidReferenceDataBodyEncoding
        ? invalidReferenceDataResponse()
        : referenceDataManagementErrorResponse(error),
    );
  }
  if (text.trim() === "") return noStore(invalidReferenceDataResponse());

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (error) {
    return noStore(
      error instanceof SyntaxError
        ? invalidReferenceDataResponse()
        : referenceDataManagementErrorResponse(error),
    );
  }

  const parsed = createAdminCampusLocationSchema.safeParse(body);
  if (!parsed.success) return noStore(invalidReferenceDataResponse());

  try {
    return Response.json(
      {
        campusLocation: await createAdminCampusLocation(
          administrator,
          parsed.data,
        ),
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }
}
