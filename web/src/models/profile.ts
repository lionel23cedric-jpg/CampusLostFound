import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

export const CONTACT_METHODS = ["in_app", "email"] as const;

const notificationSettingsSchema = new Schema(
  {
    possibleMatches: {
      type: Boolean,
      default: true,
      required: true,
    },
    claimUpdates: {
      type: Boolean,
      default: true,
      required: true,
    },
    statusChanges: {
      type: Boolean,
      default: true,
      required: true,
    },
    handoverInstructions: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  { _id: false },
);

export const profileSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
    displayName: {
      type: String,
      required: [true, "Display name is required"],
      trim: true,
      minlength: [2, "Display name must contain at least 2 characters"],
      maxlength: [80, "Display name must contain at most 80 characters"],
    },
    preferredContactMethod: {
      type: String,
      enum: CONTACT_METHODS,
      default: "in_app",
      required: true,
    },
    preferredCampusLocationIds: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: "CampusLocation",
        },
      ],
      default: [],
    },
    notificationSettings: {
      type: notificationSettingsSchema,
      default: () => ({}),
      required: true,
    },
  },
  {
    collection: "profiles",
    timestamps: true,
  },
);

profileSchema.index({ userId: 1 }, { unique: true });

export type Profile = InferSchemaType<typeof profileSchema>;

export const ProfileModel =
  (models.Profile as Model<Profile> | undefined) ??
  model<Profile>("Profile", profileSchema);
