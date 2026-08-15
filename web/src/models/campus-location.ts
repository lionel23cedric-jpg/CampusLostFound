import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

export const campusLocationSchema = new Schema(
  {
    campusName: {
      type: String,
      required: [true, "Campus name is required"],
      trim: true,
      minlength: [2, "Campus name must contain at least 2 characters"],
      maxlength: [80, "Campus name must contain at most 80 characters"],
    },
    locationName: {
      type: String,
      required: [true, "Location name is required"],
      trim: true,
      minlength: [2, "Location name must contain at least 2 characters"],
      maxlength: [120, "Location name must contain at most 120 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [300, "Location description must contain at most 300 characters"],
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  {
    collection: "campusLocations",
    timestamps: true,
  },
);

campusLocationSchema.index(
  { campusName: 1, locationName: 1 },
  {
    unique: true,
    collation: { locale: "en", strength: 2 },
  },
);

export type CampusLocation = InferSchemaType<typeof campusLocationSchema>;

export const CampusLocationModel =
  (models.CampusLocation as Model<CampusLocation> | undefined) ??
  model<CampusLocation>("CampusLocation", campusLocationSchema);
