import { connectToDatabase } from "@/lib/db";
import { ProfileModel } from "@/models/profile";
import { SessionModel } from "@/models/session";
import { UserModel } from "@/models/user";

import { AuthError } from "./errors";
import { hashPassword, verifyPassword } from "./password";
import { type PublicUser, toPublicUser } from "./public-user";
import {
  createSessionExpiry,
  createSessionToken,
  hashSessionToken,
} from "./token";
import type { LoginInput, RegisterInput } from "./validation";

export type AuthResult = {
  user: PublicUser;
  sessionToken: string;
};

function isDuplicateEmailError(error: unknown): error is {
  code: 11000;
  keyPattern: { email: 1 };
} {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000 &&
    "keyPattern" in error &&
    typeof error.keyPattern === "object" &&
    error.keyPattern !== null &&
    "email" in error.keyPattern &&
    error.keyPattern.email === 1
  );
}

export async function registerUser(input: RegisterInput): Promise<AuthResult> {
  const passwordHash = await hashPassword(input.password);
  const rawToken = createSessionToken();
  const tokenHash = hashSessionToken(rawToken);
  const expiresAt = createSessionExpiry();
  const database = await connectToDatabase();
  const transaction = await database.startSession();
  let result: AuthResult | undefined;

  try {
    await transaction.withTransaction(async () => {
      const [user] = await UserModel.create(
        [
          {
            email: input.email,
            passwordHash,
            role: "student",
            status: "active",
            emailVerifiedAt: null,
          },
        ],
        { session: transaction },
      );
      const [profile] = await ProfileModel.create(
        [{ userId: user._id, displayName: input.displayName }],
        { session: transaction },
      );
      await SessionModel.create(
        [{ userId: user._id, tokenHash, expiresAt }],
        { session: transaction },
      );

      result = { user: toPublicUser(user, profile), sessionToken: rawToken };
    });
  } catch (error) {
    if (isDuplicateEmailError(error)) {
      throw new AuthError("EMAIL_ALREADY_REGISTERED");
    }
    throw error;
  } finally {
    await transaction.endSession();
  }

  if (!result) {
    throw new Error("Authentication transaction did not produce a result");
  }

  return result;
}

export async function loginUser(input: LoginInput): Promise<AuthResult> {
  await connectToDatabase();
  const user = await UserModel.findOne({ email: input.email }).select(
    "+passwordHash",
  );

  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new AuthError("INVALID_CREDENTIALS");
  }

  if (user.status !== "active") {
    throw new AuthError("ACCOUNT_UNAVAILABLE");
  }

  const profile = await ProfileModel.findOne({ userId: user._id });
  if (!profile) {
    throw new Error("Authenticated user profile is missing");
  }

  user.lastLoginAt = new Date();
  await user.save();

  const rawToken = createSessionToken();
  await SessionModel.create({
    userId: user._id,
    tokenHash: hashSessionToken(rawToken),
    expiresAt: createSessionExpiry(),
  });

  return { user: toPublicUser(user, profile), sessionToken: rawToken };
}

export async function logoutUser(rawToken?: string) {
  if (!rawToken) return;

  await connectToDatabase();
  await SessionModel.deleteOne({ tokenHash: hashSessionToken(rawToken) });
}
