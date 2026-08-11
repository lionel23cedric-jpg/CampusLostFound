import { z } from "zod";

import { setSessionCookie } from "@/lib/auth/cookie";
import {
  authErrorResponse,
  invalidRequestResponse,
} from "@/lib/auth/errors";
import { loginUser } from "@/lib/auth/service";
import { loginSchema } from "@/lib/auth/validation";

export async function POST(request: Request) {
  try {
    const input = loginSchema.parse(await request.json());
    const result = await loginUser(input);
    await setSessionCookie(result.sessionToken);

    return Response.json({ user: result.user });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return invalidRequestResponse(
        error instanceof z.ZodError ? error : undefined,
      );
    }

    return authErrorResponse(error);
  }
}
