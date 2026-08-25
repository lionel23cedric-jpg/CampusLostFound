import { describe, expect, it } from "vitest";

import { editableProfileSchema, updateProfileSchema } from "./validation";

const locationA = "507f191e810c19729de860ea";
const locationB = "507f191e810c19729de860eb";

const validUpdate = {
  displayName: "  Student   Name  ",
  preferredContactMethod: "email",
  preferredCampusLocationIds: [locationA, locationB],
  notificationSettings: {
    possibleMatches: true,
    claimUpdates: true,
    statusChanges: false,
    handoverInstructions: true,
  },
  expectedUpdatedAt: "2026-08-25T02:30:00.000Z",
};

describe("profile validation", () => {
  it("normalises a complete profile update", () => {
    expect(
      updateProfileSchema.parse({
        ...validUpdate,
        preferredCampusLocationIds: [locationA.toUpperCase(), locationB],
      }),
    ).toEqual({
      ...validUpdate,
      displayName: "Student Name",
    });
  });

  it.each([
    ["too short", " a "],
    ["too long", "a".repeat(81)],
    ["a control character", "Student\u0000Name"],
    ["an invisible format character", "Student\u200bName"],
  ])("rejects a display name that is %s", (_case, displayName) => {
    expect(
      updateProfileSchema.safeParse({ ...validUpdate, displayName }).success,
    ).toBe(false);
  });

  it("rejects an unsupported contact method", () => {
    expect(
      updateProfileSchema.safeParse({
        ...validUpdate,
        preferredContactMethod: "phone",
      }).success,
    ).toBe(false);
  });

  it.each([
    ["a malformed campus location", ["not-an-object-id"]],
    ["duplicate campus locations", [locationA, locationA.toUpperCase()]],
    [
      "more than five campus locations",
      Array.from({ length: 6 }, (_value, index) =>
        (index + 1).toString(16).padStart(24, "0"),
      ),
    ],
  ])("rejects %s", (_case, preferredCampusLocationIds) => {
    expect(
      updateProfileSchema.safeParse({
        ...validUpdate,
        preferredCampusLocationIds,
      }).success,
    ).toBe(false);
  });

  it.each([
    [
      "a missing notification setting",
      {
        possibleMatches: true,
        claimUpdates: true,
        statusChanges: false,
      },
    ],
    [
      "a non-boolean notification setting",
      {
        ...validUpdate.notificationSettings,
        possibleMatches: "yes",
      },
    ],
    [
      "an unknown notification setting",
      {
        ...validUpdate.notificationSettings,
        weeklyDigest: true,
      },
    ],
  ])("rejects %s", (_case, notificationSettings) => {
    expect(
      updateProfileSchema.safeParse({
        ...validUpdate,
        notificationSettings,
      }).success,
    ).toBe(false);
  });

  it.each([
    ["an account role", { role: "administrator" }],
    ["an account status", { status: "active" }],
    ["an email address", { email: "other@example.com" }],
    ["a server timestamp", { updatedAt: validUpdate.expectedUpdatedAt }],
  ])("rejects the unknown root field for %s", (_case, extra) => {
    expect(
      updateProfileSchema.safeParse({ ...validUpdate, ...extra }).success,
    ).toBe(false);
  });

  it("rejects an invalid optimistic-concurrency timestamp", () => {
    expect(
      updateProfileSchema.safeParse({
        ...validUpdate,
        expectedUpdatedAt: "yesterday",
      }).success,
    ).toBe(false);
  });

  it("accepts only editable profile fields plus the returned timestamp", () => {
    const { expectedUpdatedAt, ...editableFields } = validUpdate;

    expect(
      editableProfileSchema.parse({
        ...editableFields,
        updatedAt: expectedUpdatedAt,
      }),
    ).toEqual({
      ...editableFields,
      displayName: "Student Name",
      updatedAt: expectedUpdatedAt,
    });

    expect(
      editableProfileSchema.safeParse({
        ...editableFields,
        updatedAt: expectedUpdatedAt,
        userId: "507f191e810c19729de860ec",
      }).success,
    ).toBe(false);
    expect(
      editableProfileSchema.safeParse({
        ...editableFields,
        updatedAt: "not-a-date",
      }).success,
    ).toBe(false);
  });
});
