import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

export const CLAIM_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "withdrawn",
  "completed",
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const claimSchema = new Schema(
  {
    reportId: {
      type: Schema.Types.ObjectId,
      ref: "ItemReport",
      required: true,
    },
    claimantId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: CLAIM_STATUSES,
      default: "pending",
      required: true,
    },
    activeClaimKey: { type: String, trim: true, default: null },
    verificationQuestionCount: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: "Question count must be an integer",
      },
    },
    verificationMatchedCount: {
      type: Number,
      required: true,
      min: 0,
      select: false,
      validate: [
        {
          validator: Number.isInteger,
          message: "Matched count must be an integer",
        },
        {
          validator(
            this: { verificationQuestionCount?: number },
            value: number,
          ) {
            return value <= (this.verificationQuestionCount ?? 0);
          },
          message: "Matched count cannot exceed question count",
        },
      ],
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
      select: false,
    },
    completedAt: { type: Date, default: null },
    withdrawnAt: { type: Date, default: null },
  },
  { collection: "claims", timestamps: true },
);

claimSchema.index({ claimantId: 1, createdAt: -1, _id: -1 });
claimSchema.index({ status: 1, createdAt: 1, _id: 1 });
claimSchema.index({ reportId: 1, status: 1, createdAt: 1 });
claimSchema.index(
  { activeClaimKey: 1 },
  {
    unique: true,
    partialFilterExpression: { activeClaimKey: { $type: "string" } },
  },
);

export type Claim = InferSchemaType<typeof claimSchema>;
export const ClaimModel =
  (models.Claim as Model<Claim> | undefined) ??
  model<Claim>("Claim", claimSchema);
