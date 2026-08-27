import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";

import { ReferenceDataManagementError } from "./reference-data-errors";

export function requireReferenceDataAdministrator(user: PublicUser) {
  if (user.role !== "administrator" || user.status !== "active") {
    throw new ReferenceDataManagementError("ADMINISTRATOR_REQUIRED");
  }
}

export async function getCurrentReferenceDataAdministrator() {
  const user = await getCurrentUser(await readSessionCookie());
  if (!user) throw new AuthError("AUTHENTICATION_REQUIRED");
  requireReferenceDataAdministrator(user);
  return user;
}
