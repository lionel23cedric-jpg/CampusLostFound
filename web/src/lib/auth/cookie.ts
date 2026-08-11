import { cookies } from "next/headers";

import { SESSION_DURATION_SECONDS } from "./token";

export const SESSION_COOKIE_NAME = "clf_session";

function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function readSessionCookie() {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value;
}

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}

export async function clearSessionCookie() {
  (await cookies()).set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions(),
    expires: new Date(0),
    maxAge: 0,
  });
}
