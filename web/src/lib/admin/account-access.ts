import type { PublicUser } from "@/lib/auth/public-user";

import { AccountManagementError } from "./account-errors";

export function requireAccountAdministrator(user: PublicUser) {
  if (user.role !== "administrator" || user.status !== "active") {
    throw new AccountManagementError("ADMINISTRATOR_REQUIRED");
  }
}
