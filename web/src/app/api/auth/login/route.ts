import { setSessionCookie } from "@/lib/auth/cookie";
import {
  authErrorResponse,
  invalidRequestResponse,
} from "@/lib/auth/errors";
import { loginUser } from "@/lib/auth/service";
import { loginSchema } from "@/lib/auth/validation";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    return error instanceof SyntaxError
      ? invalidRequestResponse()
      : authErrorResponse(error);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return invalidRequestResponse(parsed.error);
  }

  try {
    const result = await loginUser(parsed.data);
    await setSessionCookie(result.sessionToken);

    return Response.json({ user: result.user });
  } catch (error) {
    return authErrorResponse(error);
  }
}
