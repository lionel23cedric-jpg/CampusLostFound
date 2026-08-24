import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

const claimResponseSchema = new Schema(
  {
    questionIndex: {
      type: Number,
      required: true,
      min: 0,
      max: 4,
      validate: {
        validator: Number.isInteger,
        message: "Question index must be an integer",
      },
    },
    question: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 200,
    },
    answer: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 500,
      select: false,
    },
    matched: { type: Boolean, required: true, select: false },
  },
  { _id: false },
);

export const claimEvidenceSchema = new Schema(
  {
    claimId: { type: Schema.Types.ObjectId, ref: "Claim", required: true },
    responses: {
      type: [claimResponseSchema],
      validate: {
        validator: (responses: unknown) =>
          Array.isArray(responses) &&
          responses.length >= 1 &&
          responses.length <= 5,
        message: "Provide between 1 and 5 claim responses",
      },
    },
  },
  { collection: "claimEvidence", timestamps: true },
);

claimEvidenceSchema.index({ claimId: 1 }, { unique: true });

export type ClaimEvidence = InferSchemaType<typeof claimEvidenceSchema>;
export const ClaimEvidenceModel =
  (models.ClaimEvidence as Model<ClaimEvidence> | undefined) ??
  model<ClaimEvidence>("ClaimEvidence", claimEvidenceSchema);
