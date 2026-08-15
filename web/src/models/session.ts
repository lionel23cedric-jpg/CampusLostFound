import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

export const sessionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
    tokenHash: {
      type: String,
      required: [true, "Session token hash is required"],
      match: [/^[a-f0-9]{64}$/, "Session token hash must be SHA-256"],
      select: false,
    },
    expiresAt: {
      type: Date,
      required: [true, "Session expiry is required"],
    },
  },
  {
    collection: "sessions",
    timestamps: true,
  },
);

sessionSchema.index({ tokenHash: 1 }, { unique: true });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ userId: 1 });

export type Session = InferSchemaType<typeof sessionSchema>;

export const SessionModel =
  (models.Session as Model<Session> | undefined) ??
  model<Session>("Session", sessionSchema);
