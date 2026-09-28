import { z } from "zod";

import { duplicateScanResponseSchema } from "@/lib/ai/contracts";
import { scanDuplicateReports } from "@/lib/ai/duplicate-detection";
import type { PublicUser } from "@/lib/auth/public-user";
import { getCurrentModerationAdministrator } from "@/lib/moderation/access";
import {
  invalidModerationResponse,
  moderationErrorResponse,
} from "@/lib/moderation/errors";

const duplicateScanQuerySchema = z.strictObject({});

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request) {
  let administrator: PublicUser;
  try {
    administrator = await getCurrentModerationAdministrator();
  } catch (error) {
    return noStore(moderationErrorResponse(error));
  }

  let parsed;
  try {
    parsed = duplicateScanQuerySchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
  } catch (error) {
    return noStore(moderationErrorResponse(error));
  }
  if (!parsed.success) return noStore(invalidModerationResponse(parsed.error));

  try {
    const result = duplicateScanResponseSchema.parse(
      await scanDuplicateReports(administrator),
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return noStore(moderationErrorResponse(error));
  }
}
