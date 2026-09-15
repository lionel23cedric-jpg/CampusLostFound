import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";

import { ReferenceDataManagementError } from "./reference-data-errors";

export function requireReferenceDataAdministrator(user: PublicUser) {
  // Server-side authorization is the real security boundary; hiding the page in
  // the browser alone would not stop a direct API request.
  if (user.role !== "administrator" || user.status !== "active") {
    throw new ReferenceDataManagementError("ADMINISTRATOR_REQUIRED");
  }
}

export async function getCurrentReferenceDataAdministrator() {
  // Identity and role come from the signed session cookie, never from request JSON.
  const user = await getCurrentUser(await readSessionCookie(), {
    includeInactive: true,
  });
  if (!user) throw new AuthError("AUTHENTICATION_REQUIRED");
  requireReferenceDataAdministrator(user);
  return user;
}
