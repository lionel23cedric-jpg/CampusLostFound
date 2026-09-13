import type { PublicUser } from "@/lib/auth/public-user";
import { getCurrentModerationMember } from "@/lib/moderation/access";
import {
  invalidModerationResponse,
  moderationErrorResponse,
} from "@/lib/moderation/errors";
import { submitReportFlag } from "@/lib/moderation/flag-service";
import {
  isJsonRequest,
  moderationObjectIdSchema,
  submitReportFlagSchema,
} from "@/lib/moderation/validation";

type Context = {
  params: Promise<{ id: string }>;
};

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: Request, context: Context) {
  let member: PublicUser;
  try {
    // Actor identity comes from the session; the body contains concern details only.
    member = await getCurrentModerationMember();
  } catch (error) {
    return noStore(moderationErrorResponse(error));
  }

  let rawId: string;
  try {
    rawId = (await context.params).id;
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

  const parsedBody = submitReportFlagSchema.safeParse(body);
  if (!parsedBody.success) {
    return noStore(invalidModerationResponse(parsedBody.error));
  }

  try {
    const flag = await submitReportFlag(
      member,
      parsedId.data,
      parsedBody.data,
    );
    return noStore(Response.json({ flag }, { status: 201 }));
  } catch (error) {
    return noStore(moderationErrorResponse(error));
  }
}
