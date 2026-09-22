import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

export const accountRoleChangeEventSchema = new Schema(
  {
    actorAdministratorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    targetUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    previousRole: {
      type: String,
      enum: ["student", "staff"],
      required: true,
      immutable: true,
    },
    newRole: {
      type: String,
      enum: ["student", "staff"],
      required: true,
      immutable: true,
    },
    occurredAt: {
      type: Date,
      default: Date.now,
      required: true,
      immutable: true,
    },
  },
  { collection: "account_role_change_events", timestamps: false },
);

accountRoleChangeEventSchema.pre("validate", function () {
  if (this.actorAdministratorId?.toString() === this.targetUserId?.toString()) {
    this.invalidate("targetUserId", "Administrator cannot target self");
  }
  if (this.previousRole === this.newRole) {
    this.invalidate("newRole", "Staff membership must change");
  }
});

accountRoleChangeEventSchema.index({ targetUserId: 1, occurredAt: -1, _id: -1 });
accountRoleChangeEventSchema.index({ actorAdministratorId: 1, occurredAt: -1, _id: -1 });

export type AccountRoleChangeEvent = InferSchemaType<typeof accountRoleChangeEventSchema>;
export const AccountRoleChangeEventModel =
  (models.AccountRoleChangeEvent as Model<AccountRoleChangeEvent> | undefined) ??
  model<AccountRoleChangeEvent>("AccountRoleChangeEvent", accountRoleChangeEventSchema);
