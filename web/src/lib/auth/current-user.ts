import { connectToDatabase } from "@/lib/db";
import { ProfileModel } from "@/models/profile";
import { SessionModel } from "@/models/session";
import { UserModel } from "@/models/user";

import { type PublicUser, toPublicUser } from "./public-user";
import { hashSessionToken } from "./token";

export async function getCurrentUser(
  rawToken?: string,
  { includeInactive = false }: { includeInactive?: boolean } = {},
): Promise<PublicUser | null> {
  if (!rawToken) return null;

  await connectToDatabase();
  const session = await SessionModel.findOne({
    tokenHash: hashSessionToken(rawToken),
    expiresAt: { $gt: new Date() },
  });

  if (!session) return null;

  const user = await UserModel.findById(session.userId);
  if (!user) {
    await SessionModel.deleteOne({ _id: session._id });
    return null;
  }

  const isInactive = user.status !== "active";
  if (isInactive) {
    await SessionModel.deleteOne({ _id: session._id });
    if (!includeInactive) return null;
  }

  const profile = await ProfileModel.findOne({ userId: user._id });
  if (!profile) {
    if (!isInactive) {
      await SessionModel.deleteOne({ _id: session._id });
    }
    return null;
  }

  return toPublicUser(user, profile);
}
