import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/session", () => ({
  SessionModel: { findOne: vi.fn(), deleteOne: vi.fn() },
}));
vi.mock("@/models/user", () => ({
  UserModel: { findById: vi.fn() },
}));
vi.mock("@/models/profile", () => ({
  ProfileModel: { findOne: vi.fn() },
}));
vi.mock("./token", () => ({ hashSessionToken: vi.fn() }));
vi.mock("./public-user", () => ({ toPublicUser: vi.fn() }));

import { connectToDatabase } from "@/lib/db";
import { ProfileModel } from "@/models/profile";
import { SessionModel } from "@/models/session";
import { UserModel } from "@/models/user";

import { getCurrentUser } from "./current-user";
import { toPublicUser } from "./public-user";
import { hashSessionToken } from "./token";

const safeUser = { id: "user-id", email: "student@example.com" };

describe("current-user resolution", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T00:00:00.000Z"));
    vi.mocked(connectToDatabase).mockResolvedValue({} as never);
    vi.mocked(hashSessionToken).mockReturnValue("a".repeat(64));
    vi.mocked(toPublicUser).mockReturnValue(safeUser as never);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([undefined, ""])(
    "returns null without database access when no token exists (%s)",
    async (rawToken) => {
      await expect(getCurrentUser(rawToken)).resolves.toBeNull();
      expect(hashSessionToken).not.toHaveBeenCalled();
      expect(connectToDatabase).not.toHaveBeenCalled();
      expect(SessionModel.findOne).not.toHaveBeenCalled();
      expect(UserModel.findById).not.toHaveBeenCalled();
      expect(ProfileModel.findOne).not.toHaveBeenCalled();
    },
  );

  it("resolves an explicitly unexpired session for an active user and profile", async () => {
    const session = { _id: "session-id", userId: "user-id" };
    const user = { _id: "user-id", status: "active" };
    const profile = { userId: "user-id" };
    vi.mocked(SessionModel.findOne).mockResolvedValue(session as never);
    vi.mocked(UserModel.findById).mockResolvedValue(user as never);
    vi.mocked(ProfileModel.findOne).mockResolvedValue(profile as never);

    await expect(getCurrentUser("raw-session-token")).resolves.toEqual(safeUser);

    expect(connectToDatabase).toHaveBeenCalledOnce();
    expect(SessionModel.findOne).toHaveBeenCalledWith({
      tokenHash: "a".repeat(64),
      expiresAt: { $gt: new Date("2026-08-11T00:00:00.000Z") },
    });
    expect(UserModel.findById).toHaveBeenCalledWith("user-id");
    expect(ProfileModel.findOne).toHaveBeenCalledWith({ userId: "user-id" });
    expect(toPublicUser).toHaveBeenCalledWith(user, profile);
    expect(SessionModel.deleteOne).not.toHaveBeenCalled();
  });

  it("returns null for an invalid or expired session", async () => {
    vi.mocked(SessionModel.findOne).mockResolvedValue(null);

    await expect(getCurrentUser("invalid-token")).resolves.toBeNull();
    expect(UserModel.findById).not.toHaveBeenCalled();
    expect(ProfileModel.findOne).not.toHaveBeenCalled();
    expect(SessionModel.deleteOne).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing account", null],
    ["a suspended account", { _id: "user-id", status: "suspended" }],
    ["a deactivated account", { _id: "user-id", status: "deactivated" }],
  ])("revokes the session by default for %s", async (_description, user) => {
    vi.mocked(SessionModel.findOne).mockResolvedValue({
      _id: "session-id",
      userId: "user-id",
    } as never);
    vi.mocked(UserModel.findById).mockResolvedValue(user as never);

    await expect(getCurrentUser("raw-session-token")).resolves.toBeNull();
    expect(ProfileModel.findOne).not.toHaveBeenCalled();
    expect(SessionModel.deleteOne).toHaveBeenCalledWith({ _id: "session-id" });
  });

  it.each(["suspended", "deactivated"] as const)(
    "returns a %s account when inactive accounts are included",
    async (status) => {
      const session = { _id: "session-id", userId: "user-id" };
      const user = { _id: "user-id", status };
      const profile = { userId: "user-id" };
      const inactivePublicUser = { ...safeUser, status };
      vi.mocked(SessionModel.findOne).mockResolvedValue(session as never);
      vi.mocked(UserModel.findById).mockResolvedValue(user as never);
      vi.mocked(ProfileModel.findOne).mockResolvedValue(profile as never);
      vi.mocked(toPublicUser).mockReturnValue(inactivePublicUser as never);

      await expect(
        getCurrentUser("raw-session-token", { includeInactive: true }),
      ).resolves.toEqual(inactivePublicUser);

      expect(ProfileModel.findOne).toHaveBeenCalledWith({ userId: "user-id" });
      expect(toPublicUser).toHaveBeenCalledWith(user, profile);
      expect(SessionModel.deleteOne).not.toHaveBeenCalled();
    },
  );

  it("revokes the session when the active account has no profile", async () => {
    vi.mocked(SessionModel.findOne).mockResolvedValue({
      _id: "session-id",
      userId: "user-id",
    } as never);
    vi.mocked(UserModel.findById).mockResolvedValue({
      _id: "user-id",
      status: "active",
    } as never);
    vi.mocked(ProfileModel.findOne).mockResolvedValue(null);

    await expect(getCurrentUser("raw-session-token")).resolves.toBeNull();
    expect(SessionModel.deleteOne).toHaveBeenCalledWith({ _id: "session-id" });
    expect(toPublicUser).not.toHaveBeenCalled();
  });
});
