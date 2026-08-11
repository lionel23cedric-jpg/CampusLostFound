import { z } from "zod";

import { setSessionCookie } from "@/lib/auth/cookie";
import {
  authErrorResponse,
  invalidRequestResponse,
} from "@/lib/auth/errors";
import { registerUser } from "@/lib/auth/service";
import { registerSchema } from "@/lib/auth/validation";

export async function POST(request: Request) {
  try {
    const input = registerSchema.parse(await request.json());
    const result = await registerUser(input);
    await setSessionCookie(result.sessionToken);

    return Response.json({ user: result.user }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return invalidRequestResponse(
        error instanceof z.ZodError ? error : undefined,
      );
    }

    return authErrorResponse(error);
  }
}
