import type { PublicUser } from "@/lib/auth/public-user";
import { connectToDatabase } from "@/lib/db";
import { CampusLocationModel } from "@/models/campus-location";
import { ProfileModel } from "@/models/profile";

import { InvalidProfileError, ProfileError } from "./errors";
import {
  editableProfileSchema,
  type EditableProfile,
  type UpdateProfileInput,
} from "./validation";

const PROFILE_PROJECTION = {
  _id: 0,
  displayName: 1,
  preferredContactMethod: 1,
  preferredCampusLocationIds: 1,
  notificationSettings: 1,
  updatedAt: 1,
};

type ProfileRow = {
  displayName: unknown;
  preferredContactMethod: unknown;
  preferredCampusLocationIds: Array<{ toString(): string }>;
  notificationSettings: {
    possibleMatches: unknown;
    claimUpdates: unknown;
    statusChanges: unknown;
    handoverInstructions: unknown;
  };
  updatedAt: Date;
};

function toEditableProfile(row: ProfileRow): EditableProfile {
  return editableProfileSchema.parse({
    displayName: row.displayName,
    preferredContactMethod: row.preferredContactMethod,
    preferredCampusLocationIds: row.preferredCampusLocationIds.map((id) =>
      id.toString(),
    ),
    notificationSettings: {
      possibleMatches: row.notificationSettings.possibleMatches,
      claimUpdates: row.notificationSettings.claimUpdates,
      statusChanges: row.notificationSettings.statusChanges,
      handoverInstructions: row.notificationSettings.handoverInstructions,
    },
    updatedAt: row.updatedAt.toISOString(),
  });
}

function rethrowSafeProfileError(error: unknown): never {
  if (error instanceof InvalidProfileError || error instanceof ProfileError) {
    throw error;
  }

  throw new ProfileError("PROFILE_FAILED");
}

export async function getOwnProfile(userId: string) {
  try {
    await connectToDatabase();

    const row = await ProfileModel.findOne({ userId })
      .select(PROFILE_PROJECTION)
      .exec();

    if (!row) throw new ProfileError("PROFILE_FAILED");
    return toEditableProfile(row as unknown as ProfileRow);
  } catch (error) {
    rethrowSafeProfileError(error);
  }
}

export async function updateOwnProfile(
  user: PublicUser,
  input: UpdateProfileInput,
) {
  try {
    await connectToDatabase();

    if (input.preferredCampusLocationIds.length > 0) {
      const activeLocationCount = await CampusLocationModel.countDocuments({
        _id: { $in: input.preferredCampusLocationIds },
        isActive: true,
      });

      if (activeLocationCount !== input.preferredCampusLocationIds.length) {
        throw new InvalidProfileError({
          preferredCampusLocationIds: ["Choose active campus locations"],
        });
      }
    }

    const row = await ProfileModel.findOneAndUpdate(
      { userId: user.id, updatedAt: new Date(input.expectedUpdatedAt) },
      {
        $set: {
          displayName: input.displayName,
          preferredContactMethod: input.preferredContactMethod,
          preferredCampusLocationIds: input.preferredCampusLocationIds,
          notificationSettings: input.notificationSettings,
        },
      },
      { new: true, runValidators: true },
    )
      .select(PROFILE_PROJECTION)
      .exec();

    if (!row) throw new ProfileError("PROFILE_CHANGED");

    const profile = toEditableProfile(row as unknown as ProfileRow);
    const { updatedAt: profileUpdatedAt, ...publicProfile } = profile;

    return {
      user: { ...user, profile: publicProfile },
      profileUpdatedAt,
    };
  } catch (error) {
    rethrowSafeProfileError(error);
  }
}
