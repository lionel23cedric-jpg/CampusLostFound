import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/profile", () => ({
  ProfileModel: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  },
}));
vi.mock("@/models/campus-location", () => ({
  CampusLocationModel: { countDocuments: vi.fn() },
}));

import { connectToDatabase } from "@/lib/db";
import type { PublicUser } from "@/lib/auth/public-user";
import { CampusLocationModel } from "@/models/campus-location";
import { ProfileModel } from "@/models/profile";

import { InvalidProfileError, ProfileError } from "./errors";
import { getOwnProfile, updateOwnProfile } from "./service";
import type { UpdateProfileInput } from "./validation";

const PROFILE_PROJECTION = {
  _id: 0,
  displayName: 1,
  preferredContactMethod: 1,
  preferredCampusLocationIds: 1,
  notificationSettings: 1,
  updatedAt: 1,
};

const locationA = "507f191e810c19729de860ea";
const locationB = "507f191e810c19729de860eb";
const previousUpdatedAt = "2026-08-25T02:30:00.000Z";
const nextUpdatedAt = "2026-08-25T03:30:00.000Z";

const user = {
  id: "507f191e810c19729de860ec",
  email: "student@example.com",
  role: "student",
  status: "active",
  emailVerifiedAt: null,
  lastLoginAt: "2026-08-24T22:00:00.000Z",
  profile: {
    displayName: "Previous Name",
    preferredContactMethod: "in_app",
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
} as PublicUser;

const input: UpdateProfileInput = {
  displayName: "Updated Student",
  preferredContactMethod: "email",
  preferredCampusLocationIds: [locationA, locationB],
  notificationSettings: {
    possibleMatches: true,
    claimUpdates: false,
    statusChanges: true,
    handoverInstructions: false,
  },
  expectedUpdatedAt: previousUpdatedAt,
};

function profileRow(updatedAt = nextUpdatedAt) {
  return {
    _id: "private-profile-id",
    userId: "private-user-id",
    __v: 9,
    PRIVATE_SECRET: "must not leak",
    displayName: input.displayName,
    preferredContactMethod: input.preferredContactMethod,
    preferredCampusLocationIds: input.preferredCampusLocationIds.map((id) => ({
      toString: () => id,
    })),
    notificationSettings: { ...input.notificationSettings },
    updatedAt: new Date(updatedAt),
  };
}

function selectableQuery(result: unknown) {
  const query = {
    select: vi.fn(),
    exec: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  return query;
}

describe("owned Profile service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(connectToDatabase).mockResolvedValue({} as never);
  });

  it("reads only the owner's allow-listed editable Profile fields", async () => {
    const query = selectableQuery(profileRow());
    vi.mocked(ProfileModel.findOne).mockReturnValue(query as never);

    await expect(getOwnProfile(user.id)).resolves.toEqual({
      displayName: input.displayName,
      preferredContactMethod: input.preferredContactMethod,
      preferredCampusLocationIds: [locationA, locationB],
      notificationSettings: input.notificationSettings,
      updatedAt: nextUpdatedAt,
    });

    expect(connectToDatabase).toHaveBeenCalledOnce();
    expect(ProfileModel.findOne).toHaveBeenCalledWith({ userId: user.id });
    expect(query.select).toHaveBeenCalledWith(PROFILE_PROJECTION);
    expect(query.exec).toHaveBeenCalledOnce();
  });

  it.each(["missing", "rejected"])(
    "maps a %s Profile read to a safe failure",
    async (failure) => {
      const query = selectableQuery(null);
      if (failure === "rejected") {
        query.exec.mockRejectedValue(new Error("private database message"));
      }
      vi.mocked(ProfileModel.findOne).mockReturnValue(query as never);

      await expect(getOwnProfile(user.id)).rejects.toMatchObject({
        code: "PROFILE_FAILED",
        message: "Unable to manage profile settings",
      });
    },
  );

  it("validates active campus locations and updates only owned editable fields", async () => {
    vi.mocked(CampusLocationModel.countDocuments).mockResolvedValue(2);
    const query = selectableQuery(profileRow());
    vi.mocked(ProfileModel.findOneAndUpdate).mockReturnValue(query as never);

    await expect(updateOwnProfile(user, input)).resolves.toEqual({
      user: {
        ...user,
        profile: {
          displayName: input.displayName,
          preferredContactMethod: input.preferredContactMethod,
          preferredCampusLocationIds: input.preferredCampusLocationIds,
          notificationSettings: input.notificationSettings,
        },
      },
      profileUpdatedAt: nextUpdatedAt,
    });

    expect(CampusLocationModel.countDocuments).toHaveBeenCalledWith({
      _id: { $in: input.preferredCampusLocationIds },
      isActive: true,
    });
    expect(ProfileModel.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: user.id, updatedAt: new Date(previousUpdatedAt) },
      {
        $set: {
          displayName: input.displayName,
          preferredContactMethod: input.preferredContactMethod,
          preferredCampusLocationIds: input.preferredCampusLocationIds,
          notificationSettings: input.notificationSettings,
        },
      },
      { new: true, runValidators: true },
    );
    expect(query.select).toHaveBeenCalledWith(PROFILE_PROJECTION);
  });

  it("skips the campus query when no locations are selected", async () => {
    const query = selectableQuery(
      profileRow(),
    );
    vi.mocked(ProfileModel.findOneAndUpdate).mockReturnValue(query as never);

    await updateOwnProfile(user, {
      ...input,
      preferredCampusLocationIds: [],
    });

    expect(CampusLocationModel.countDocuments).not.toHaveBeenCalled();
  });

  it("rejects inactive or unknown locations before updating", async () => {
    vi.mocked(CampusLocationModel.countDocuments).mockResolvedValue(1);

    const operation = updateOwnProfile(user, input);

    await expect(operation).rejects.toBeInstanceOf(InvalidProfileError);
    await expect(operation).rejects.toMatchObject({
      fields: {
        preferredCampusLocationIds: ["Choose active campus locations"],
      },
    });
    expect(ProfileModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("reports an optimistic-concurrency conflict when no row is updated", async () => {
    vi.mocked(CampusLocationModel.countDocuments).mockResolvedValue(2);
    vi.mocked(ProfileModel.findOneAndUpdate).mockReturnValue(
      selectableQuery(null) as never,
    );

    await expect(updateOwnProfile(user, input)).rejects.toMatchObject({
      code: "PROFILE_CHANGED",
      message: "Profile settings changed in another session",
    });
  });

  it("hides rejected persistence details", async () => {
    vi.mocked(CampusLocationModel.countDocuments).mockResolvedValue(2);
    const query = selectableQuery(null);
    query.exec.mockRejectedValue(new Error("private database message"));
    vi.mocked(ProfileModel.findOneAndUpdate).mockReturnValue(query as never);

    const operation = updateOwnProfile(user, input);

    await expect(operation).rejects.toBeInstanceOf(ProfileError);
    await expect(operation).rejects.toMatchObject({
      code: "PROFILE_FAILED",
      message: "Unable to manage profile settings",
    });
  });
});
