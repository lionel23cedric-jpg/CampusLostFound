"use client";

import type { ReactNode } from "react";

import { StaffAccessBoundary } from "@/components/staff/staff-access-boundary";

const claimReviewCopy = {
  checking: "Checking Claim review access",
  confirmed: "Claim review access confirmed",
  unavailableHeading: "We could not check your account",
  forbiddenHeading: "Claim review access unavailable",
  forbiddenDescription:
    "Only active staff and administrator accounts can review ownership Claims.",
  workspaceLabel: "Claim review workspace",
};

export function StaffClaimAccessBoundary({ children }: { children: ReactNode }) {
  return (
    <StaffAccessBoundary copy={claimReviewCopy}>{children}</StaffAccessBoundary>
  );
}
