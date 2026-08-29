import { readSessionCookie } from "@/lib/auth/cookie";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AuthError } from "@/lib/auth/errors";
import type { PublicUser } from "@/lib/auth/public-user";

import { StaffReportError } from "./errors";

export function requireStaffReportUser(user: PublicUser) {
  if (
    user.status !== "active" ||
    (user.role !== "staff" && user.role !== "administrator")
  ) {
    throw new StaffReportError("STAFF_REPORT_FORBIDDEN");
  }
}

export async function getCurrentStaffReportUser() {
  const user = await getCurrentUser(await readSessionCookie(), {
    includeInactive: true,
  });
  if (!user) throw new AuthError("AUTHENTICATION_REQUIRED");
  requireStaffReportUser(user);
  return user;
}
