import mongoose, { type InferSchemaType, type Model } from "mongoose";

const { Schema, model, models } = mongoose;

export const ACCOUNT_ADMINISTRATION_REASONS = [
  "security_concern",
  "policy_violation",
  "administrative_review",
  "account_restored",
  "account_closed",
] as const;
export type AccountAdministrationReason =
  (typeof ACCOUNT_ADMINISTRATION_REASONS)[number];

function transitionIsValid(
  previousStatus: unknown,
  newStatus: unknown,
  reason: unknown,
) {
  if (previousStatus === "active" && newStatus === "suspended") {
    return [
      "security_concern",
      "policy_violation",
      "administrative_review",
    ].includes(String(reason));
  }
  if (previousStatus === "suspended" && newStatus === "active") {
    return reason === "account_restored";
  }
  if (
    (previousStatus === "active" || previousStatus === "suspended") &&
    newStatus === "deactivated"
  ) {
    return reason === "account_closed";
  }
  return false;
}

export const accountAdministrationEventSchema = new Schema(
  {
    actorAdministratorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    targetUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    previousStatus: {
      type: String,
      enum: ["active", "suspended"],
      required: true,
    },
    newStatus: {
      type: String,
      enum: ["active", "suspended", "deactivated"],
      required: true,
    },
    reason: {
      type: String,
      enum: ACCOUNT_ADMINISTRATION_REASONS,
      required: true,
    },
    occurredAt: { type: Date, required: true, default: Date.now },
  },
  { collection: "account_administration_events", timestamps: false },
);

accountAdministrationEventSchema.pre("validate", function () {
  if (
    this.actorAdministratorId?.toString() === this.targetUserId?.toString()
  ) {
    this.invalidate("targetUserId", "Administrator cannot target self");
  }
  if (!transitionIsValid(this.previousStatus, this.newStatus, this.reason)) {
    this.invalidate("newStatus", "Account transition is invalid");
  }
});

accountAdministrationEventSchema.index({
  targetUserId: 1,
  occurredAt: -1,
  _id: -1,
});
accountAdministrationEventSchema.index({
  actorAdministratorId: 1,
  occurredAt: -1,
  _id: -1,
});

export type AccountAdministrationEvent = InferSchemaType<
  typeof accountAdministrationEventSchema
>;
export const AccountAdministrationEventModel =
  (models.AccountAdministrationEvent as
    | Model<AccountAdministrationEvent>
    | undefined) ??
  model<AccountAdministrationEvent>(
    "AccountAdministrationEvent",
    accountAdministrationEventSchema,
  );
