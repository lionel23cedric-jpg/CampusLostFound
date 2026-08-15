import type { HydratedDocument } from "mongoose";

import type { Profile } from "@/models/profile";
import type { User } from "@/models/user";

export function toPublicUser(
  user: HydratedDocument<User>,
  profile: HydratedDocument<Profile>,
) {
  return {
    id: user._id.toString(),
    email: user.email,
    role: user.role,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    profile: {
      displayName: profile.displayName,
      preferredContactMethod: profile.preferredContactMethod,
      preferredCampusLocationIds: profile.preferredCampusLocationIds.map(
        (id) => id.toString(),
      ),
      notificationSettings: {
        possibleMatches: profile.notificationSettings.possibleMatches,
        claimUpdates: profile.notificationSettings.claimUpdates,
        statusChanges: profile.notificationSettings.statusChanges,
        handoverInstructions:
          profile.notificationSettings.handoverInstructions,
      },
    },
  };
}

export type PublicUser = ReturnType<typeof toPublicUser>;
