import type { PublicUser } from "@/lib/auth/public-user";
import { getCurrentModerationAdministrator } from "@/lib/moderation/access";
import { moderateReport } from "@/lib/moderation/admin-service";
import {
  invalidModerationResponse,
  moderationErrorResponse,
} from "@/lib/moderation/errors";
import {
  isJsonRequest,
  moderationObjectIdSchema,
  reportModerationSchema,
} from "@/lib/moderation/validation";

type Context = {
  params: Promise<{ reportId: string }>;
};

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function PATCH(request: Request, context: Context) {
  let administrator: PublicUser;
  try {
    // Session authorization, strict IDs, JSON-only input, and Zod validation form
    // the route boundary before the transactional service is called.
    administrator = await getCurrentModerationAdministrator();
  } catch (error) {
    return noStore(moderationErrorResponse(error));
  }

  let rawId: string;
  try {
    rawId = (await context.params).reportId;
  } catch (error) {
    return noStore(moderationErrorResponse(error));
  }

  const parsedId = moderationObjectIdSchema.safeParse(rawId);
  if (!parsedId.success) {
    return noStore(invalidModerationResponse(parsedId.error));
  }
  if (!isJsonRequest(request)) {
    return noStore(invalidModerationResponse());
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    return noStore(
      error instanceof SyntaxError
        ? invalidModerationResponse()
        : moderationErrorResponse(error),
    );
  }

  const parsedBody = reportModerationSchema.safeParse(body);
  if (!parsedBody.success) {
    return noStore(invalidModerationResponse(parsedBody.error));
  }

  try {
    const report = await moderateReport(
      administrator,
      parsedId.data,
      parsedBody.data,
    );
    return noStore(Response.json({ report }));
  } catch (error) {
    return noStore(moderationErrorResponse(error));
  }
}
