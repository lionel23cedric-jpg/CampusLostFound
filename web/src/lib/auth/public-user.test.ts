import mongoose from "mongoose";
import { describe, expect, it } from "vitest";

import { ProfileModel } from "@/models/profile";
import { UserModel } from "@/models/user";

import { toPublicUser } from "./public-user";

describe("public authentication user", () => {
  it("returns the approved response shape without credential fields", () => {
    const user = new UserModel({
      _id: new mongoose.Types.ObjectId(),
      email: "student@example.com",
      passwordHash: "must-not-leak",
      role: "student",
      status: "active",
    });
    const profile = new ProfileModel({
      userId: user._id,
      displayName: "Student Name",
    });

    const result = toPublicUser(user, profile);

    expect(result).toEqual({
      id: user._id.toString(),
      email: "student@example.com",
      role: "student",
      status: "active",
      emailVerifiedAt: null,
      lastLoginAt: null,
      profile: {
        displayName: "Student Name",
        preferredContactMethod: "in_app",
        preferredCampusLocationIds: [],
        notificationSettings: {
          possibleMatches: true,
          claimUpdates: true,
          statusChanges: true,
          handoverInstructions: true,
        },
      },
    });
    expect(JSON.stringify(result)).not.toMatch(/passwordHash|tokenHash|session/i);
  });

  it("serializes dates and campus location IDs as strings", () => {
    const userId = new mongoose.Types.ObjectId();
    const campusLocationId = new mongoose.Types.ObjectId();
    const user = new UserModel({
      _id: userId,
      email: "student@example.com",
      passwordHash: "must-not-leak",
      role: "student",
      status: "active",
      emailVerifiedAt: new Date("2026-08-10T01:02:03.000Z"),
      lastLoginAt: new Date("2026-08-11T04:05:06.000Z"),
    });
    const profile = new ProfileModel({
      userId,
      displayName: "Student Name",
      preferredCampusLocationIds: [campusLocationId],
    });

    const result = toPublicUser(user, profile);

    expect(result.id).toBe(userId.toString());
    expect(result.emailVerifiedAt).toBe("2026-08-10T01:02:03.000Z");
    expect(result.lastLoginAt).toBe("2026-08-11T04:05:06.000Z");
    expect(result.profile.preferredCampusLocationIds).toEqual([
      campusLocationId.toString(),
    ]);
    expect(JSON.stringify(result)).not.toMatch(/passwordHash|tokenHash|session/i);
  });
});
