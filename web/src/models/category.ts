import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

export const categorySchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
      minlength: [2, "Category name must contain at least 2 characters"],
      maxlength: [80, "Category name must contain at most 80 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [300, "Category description must contain at most 300 characters"],
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  {
    collection: "categories",
    timestamps: true,
  },
);
/**
 * Enforces category name uniqueness at database level.
 * Inactive categories remain stored so existing
 * reports can retain their references.
 */
categorySchema.index(
  { name: 1 },
  {
    unique: true,
    collation: { locale: "en", strength: 2 },
  },
);

export type Category = InferSchemaType<typeof categorySchema>;

export const CategoryModel =
  (models.Category as Model<Category> | undefined) ??
  model<Category>("Category", categorySchema);
