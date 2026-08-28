import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";

import { ModerationError } from "./errors";

export function requireModerationMember(user: PublicUser) {
  if (user.status !== "active") {
    throw new ModerationError("ACTIVE_ACCOUNT_REQUIRED");
  }
}

export function requireModerationAdministrator(user: PublicUser) {
  if (user.role !== "administrator" || user.status !== "active") {
    throw new ModerationError("ADMINISTRATOR_REQUIRED");
  }
}

async function getCurrentModerationUser() {
  const user = await getCurrentUser(await readSessionCookie(), {
    includeInactive: true,
  });
  if (!user) throw new AuthError("AUTHENTICATION_REQUIRED");
  return user;
}

export async function getCurrentModerationMember() {
  const user = await getCurrentModerationUser();
  requireModerationMember(user);
  return user;
}

export async function getCurrentModerationAdministrator() {
  const user = await getCurrentModerationUser();
  requireModerationAdministrator(user);
  return user;
}
