import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

export const USER_ROLES = ["student", "staff", "administrator"] as const;
export const USER_STATUSES = [
  "active",
  "suspended",
  "deactivated",
] as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const userSchema = new Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
      match: [EMAIL_PATTERN, "Email must be valid"],
    },
    passwordHash: {
      type: String,
      required: [true, "Password hash is required"],
      select: false,
    },
    role: {
      type: String,
      enum: USER_ROLES,
      default: "student",
      required: true,
    },
    status: {
      type: String,
      enum: USER_STATUSES,
      default: "active",
      required: true,
    },
    emailVerifiedAt: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    collection: "users",
    timestamps: true,
  },
);

userSchema.index({ email: 1 }, { unique: true });

export type User = InferSchemaType<typeof userSchema>;

export const UserModel =
  (models.User as Model<User> | undefined) ?? model<User>("User", userSchema);
