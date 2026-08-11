import { setSessionCookie } from "@/lib/auth/cookie";
import {
  authErrorResponse,
  invalidRequestResponse,
} from "@/lib/auth/errors";
import { registerUser } from "@/lib/auth/service";
import { registerSchema } from "@/lib/auth/validation";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    return error instanceof SyntaxError
      ? invalidRequestResponse()
      : authErrorResponse(error);
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequestResponse(parsed.error);
  }

  try {
    const result = await registerUser(parsed.data);
    await setSessionCookie(result.sessionToken);

    return Response.json({ user: result.user }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
