import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ connectToDatabase: vi.fn() }));
vi.mock("@/models/user", () => ({
  UserModel: { create: vi.fn(), findOne: vi.fn() },
}));
vi.mock("@/models/profile", () => ({
  ProfileModel: { create: vi.fn(), findOne: vi.fn() },
}));
vi.mock("@/models/session", () => ({
  SessionModel: { create: vi.fn(), deleteOne: vi.fn() },
}));
vi.mock("./password", () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));
vi.mock("./token", () => ({
  createSessionExpiry: vi.fn(),
  createSessionToken: vi.fn(),
  hashSessionToken: vi.fn(),
}));
vi.mock("./public-user", () => ({ toPublicUser: vi.fn() }));

import { connectToDatabase } from "@/lib/db";
import { ProfileModel } from "@/models/profile";
import { SessionModel } from "@/models/session";
import { UserModel } from "@/models/user";

import { hashPassword, verifyPassword } from "./password";
import { toPublicUser } from "./public-user";
import { loginUser, logoutUser, registerUser } from "./service";
import {
  createSessionExpiry,
  createSessionToken,
  hashSessionToken,
} from "./token";

const safeUser = {
  id: "user-id",
  email: "student@example.com",
  role: "student" as const,
  status: "active" as const,
  emailVerifiedAt: null,
  lastLoginAt: null,
  profile: {
    displayName: "Student Name",
    preferredContactMethod: "in_app" as const,
    preferredCampusLocationIds: [],
    notificationSettings: {
      possibleMatches: true,
      claimUpdates: true,
      statusChanges: true,
      handoverInstructions: true,
    },
  },
};

const transaction = {
  withTransaction: vi.fn(async (work: () => Promise<void>) => work()),
  endSession: vi.fn(),
};

const registerInput = {
  email: "student@example.com",
  password: "a secure password",
  displayName: "Student Name",
};

describe("authentication service", () => {
  beforeEach(() => {
    vi.mocked(connectToDatabase).mockResolvedValue({
      startSession: vi.fn().mockResolvedValue(transaction),
    } as never);
    transaction.withTransaction.mockImplementation(async (work) => work());
    vi.mocked(hashPassword).mockResolvedValue("stored-password-hash");
    vi.mocked(createSessionToken).mockReturnValue("raw-session-token");
    vi.mocked(hashSessionToken).mockReturnValue("a".repeat(64));
    vi.mocked(createSessionExpiry).mockReturnValue(
      new Date("2026-08-18T00:00:00.000Z"),
    );
    vi.mocked(toPublicUser).mockReturnValue(safeUser);
  });

  it("registers User, Profile and Session in one transaction", async () => {
    const user = { _id: "user-id" };
    const profile = { userId: "user-id" };
    vi.mocked(UserModel.create).mockResolvedValue([user] as never);
    vi.mocked(ProfileModel.create).mockResolvedValue([profile] as never);
    vi.mocked(SessionModel.create).mockResolvedValue([] as never);

    await expect(registerUser(registerInput)).resolves.toEqual({
      user: safeUser,
      sessionToken: "raw-session-token",
    });

    expect(transaction.withTransaction).toHaveBeenCalledOnce();
    expect(UserModel.create).toHaveBeenCalledWith(
      [
        {
          email: "student@example.com",
          passwordHash: "stored-password-hash",
          role: "student",
          status: "active",
          emailVerifiedAt: null,
        },
      ],
      { session: transaction },
    );
    expect(ProfileModel.create).toHaveBeenCalledWith(
      [{ userId: "user-id", displayName: "Student Name" }],
      { session: transaction },
    );
    expect(SessionModel.create).toHaveBeenCalledWith(
      [
        {
          userId: "user-id",
          tokenHash: "a".repeat(64),
          expiresAt: new Date("2026-08-18T00:00:00.000Z"),
        },
      ],
      { session: transaction },
    );
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("translates only a duplicate email database error", async () => {
    vi.mocked(UserModel.create).mockRejectedValue(
      Object.assign(new Error("duplicate details"), {
        code: 11000,
        keyPattern: { email: 1 },
      }),
    );

    await expect(registerUser(registerInput)).rejects.toMatchObject({
      code: "EMAIL_ALREADY_REGISTERED",
      status: 409,
    });
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("preserves a duplicate-key error for any field other than email", async () => {
    const databaseError = Object.assign(new Error("duplicate session token"), {
      code: 11000,
      keyPattern: { tokenHash: 1 },
    });
    vi.mocked(UserModel.create).mockRejectedValue(databaseError);

    await expect(registerUser(registerInput)).rejects.toBe(databaseError);
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("ends the transaction session when registration persistence fails", async () => {
    const databaseError = new Error("profile insert failed");
    vi.mocked(UserModel.create).mockResolvedValue([
      { _id: "user-id" },
    ] as never);
    vi.mocked(ProfileModel.create).mockRejectedValue(databaseError);

    await expect(registerUser(registerInput)).rejects.toBe(databaseError);
    expect(SessionModel.create).not.toHaveBeenCalled();
    expect(transaction.endSession).toHaveBeenCalledOnce();
  });

  it("logs in an active account and creates a fresh session", async () => {
    const user = {
      _id: "user-id",
      email: "student@example.com",
      passwordHash: "stored-password-hash",
      status: "active",
      lastLoginAt: null,
      save: vi.fn(),
    };
    const profile = { userId: "user-id" };
    const select = vi.fn().mockResolvedValue(user);
    vi.mocked(UserModel.findOne).mockReturnValue({ select } as never);
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(ProfileModel.findOne).mockResolvedValue(profile as never);
    vi.mocked(SessionModel.create).mockResolvedValue({} as never);

    await expect(
      loginUser({
        email: "student@example.com",
        password: "a secure password",
      }),
    ).resolves.toEqual({ user: safeUser, sessionToken: "raw-session-token" });

    expect(UserModel.findOne).toHaveBeenCalledWith({
      email: "student@example.com",
    });
    expect(select).toHaveBeenCalledWith("+passwordHash");
    expect(user.lastLoginAt).toBeInstanceOf(Date);
    expect(user.save).toHaveBeenCalledOnce();
    expect(SessionModel.create).toHaveBeenCalledWith({
      userId: "user-id",
      tokenHash: "a".repeat(64),
      expiresAt: new Date("2026-08-18T00:00:00.000Z"),
    });
    expect(toPublicUser).toHaveBeenCalledWith(user, profile);
  });

  it("uses one generic failure for an unknown email or wrong password", async () => {
    const select = vi.fn().mockResolvedValue(null);
    vi.mocked(UserModel.findOne).mockReturnValue({ select } as never);

    await expect(
      loginUser({
        email: "unknown@example.com",
        password: "a secure password",
      }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });

    const user = {
      passwordHash: "stored-password-hash",
      status: "active",
    };
    select.mockResolvedValue(user);
    vi.mocked(verifyPassword).mockResolvedValue(false);

    await expect(
      loginUser({
        email: "student@example.com",
        password: "wrong password",
      }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("rejects a non-active account after password verification", async () => {
    const select = vi.fn().mockResolvedValue({
      passwordHash: "stored-password-hash",
      status: "suspended",
    });
    vi.mocked(UserModel.findOne).mockReturnValue({ select } as never);
    vi.mocked(verifyPassword).mockResolvedValue(true);

    await expect(
      loginUser({
        email: "student@example.com",
        password: "a secure password",
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_UNAVAILABLE" });
    expect(ProfileModel.findOne).not.toHaveBeenCalled();
    expect(SessionModel.create).not.toHaveBeenCalled();
  });

  it("fails safely when the authenticated account has no profile", async () => {
    const user = {
      _id: "user-id",
      passwordHash: "stored-password-hash",
      status: "active",
      lastLoginAt: null,
      save: vi.fn(),
    };
    const select = vi.fn().mockResolvedValue(user);
    vi.mocked(UserModel.findOne).mockReturnValue({ select } as never);
    vi.mocked(verifyPassword).mockResolvedValue(true);
    vi.mocked(ProfileModel.findOne).mockResolvedValue(null);

    await expect(
      loginUser({
        email: "student@example.com",
        password: "a secure password",
      }),
    ).rejects.toThrow("Authenticated user profile is missing");
    expect(user.save).not.toHaveBeenCalled();
    expect(SessionModel.create).not.toHaveBeenCalled();
  });

  it("revokes only the supplied raw session token", async () => {
    vi.mocked(SessionModel.deleteOne).mockResolvedValue({
      deletedCount: 1,
    } as never);

    await logoutUser("raw-session-token");

    expect(connectToDatabase).toHaveBeenCalledOnce();
    expect(SessionModel.deleteOne).toHaveBeenCalledWith({
      tokenHash: "a".repeat(64),
    });
  });

  it("treats logout without a cookie as an idempotent success", async () => {
    await logoutUser();

    expect(connectToDatabase).not.toHaveBeenCalled();
    expect(SessionModel.deleteOne).not.toHaveBeenCalled();
  });
});
