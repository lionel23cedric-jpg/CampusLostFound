import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

const verificationQuestionSchema = new Schema(
  {
    question: {
      type: String,
      required: [true, "Verification question is required"],
      trim: true,
      minlength: [5, "Verification question must contain at least 5 characters"],
      maxlength: [
        200,
        "Verification question must contain at most 200 characters",
      ],
    },
    expectedAnswer: {
      type: String,
      required: [true, "Expected answer is required"],
      trim: true,
      minlength: [1, "Expected answer is required"],
      maxlength: [500, "Expected answer must contain at most 500 characters"],
      select: false,
    },
  },
  { _id: false },
);

export const privateVerificationDetailsSchema = new Schema(
  {
    reportId: {
      type: Schema.Types.ObjectId,
      ref: "ItemReport",
      required: [true, "Item report is required"],
    },
    distinguishingFeatures: {
      type: [
        {
          type: String,
          trim: true,
          maxlength: [
            200,
            "Each distinguishing feature must contain at most 200 characters",
          ],
        },
      ],
      select: false,
      validate: {
        validator: (values: string[]) =>
          values.length >= 1 && values.length <= 10,
        message: "Provide between 1 and 10 distinguishing features",
      },
    },
    exactLocationDetails: {
      type: String,
      trim: true,
      maxlength: [
        500,
        "Exact location details must contain at most 500 characters",
      ],
      default: null,
      select: false,
    },
    serialNumber: {
      type: String,
      trim: true,
      maxlength: [200, "Serial number must contain at most 200 characters"],
      default: null,
      select: false,
    },
    verificationQuestions: {
      type: [verificationQuestionSchema],
      validate: {
        validator: (values: Array<{ question: string; expectedAnswer: string }>) =>
          values.length >= 1 && values.length <= 5,
        message: "Provide between 1 and 5 verification questions",
      },
    },
    privateNotes: {
      type: String,
      trim: true,
      maxlength: [2000, "Private notes must contain at most 2000 characters"],
      default: null,
      select: false,
    },
  },
  {
    collection: "privateVerificationDetails",
    timestamps: true,
  },
);

privateVerificationDetailsSchema.index({ reportId: 1 }, { unique: true });

export type PrivateVerificationDetails = InferSchemaType<
  typeof privateVerificationDetailsSchema
>;

export const PrivateVerificationDetailsModel =
  (models.PrivateVerificationDetails as
    | Model<PrivateVerificationDetails>
    | undefined) ??
  model<PrivateVerificationDetails>(
    "PrivateVerificationDetails",
    privateVerificationDetailsSchema,
  );
