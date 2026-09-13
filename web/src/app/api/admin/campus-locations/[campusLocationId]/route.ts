import { getCurrentReferenceDataAdministrator } from "@/lib/admin/reference-data-access";
import {
  referenceDataObjectIdSchema,
  updateAdminCampusLocationSchema,
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
import { updateAdminCampusLocation } from "@/lib/admin/campus-location-service";
import type { PublicUser } from "@/lib/auth/public-user";

type Context = { params: Promise<{ campusLocationId: string }> };

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function isJsonContentType(request: Request) {
  const value = request.headers.get("content-type");
  return value !== null && /^application\/json(?:\s*;|$)/i.test(value);
}

export async function PATCH(request: Request, context: Context) {
  let administrator: PublicUser;
  try {
    // Role is read from the signed session, not accepted from client-controlled JSON.
    administrator = await getCurrentReferenceDataAdministrator();
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }

  let rawCampusLocationId: string;
  try {
    rawCampusLocationId = (await context.params).campusLocationId;
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }
  const parsedId = referenceDataObjectIdSchema.safeParse(rawCampusLocationId);
  if (!parsedId.success || !isJsonContentType(request)) {
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

  const parsedBody = updateAdminCampusLocationSchema.safeParse(body);
  if (!parsedBody.success) return noStore(invalidReferenceDataResponse());

  try {
    return Response.json(
      {
        campusLocation: await updateAdminCampusLocation(
          administrator,
          parsedId.data,
          parsedBody.data,
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return noStore(referenceDataManagementErrorResponse(error));
  }
}
