import { describe, expect, it } from "vitest";
import { resolveBillingOwnerFromCandidates } from "./billing-owner";

describe("billing owner resolution", () => {
  it("allows an individual to manage their own billing", () => {
    expect(resolveBillingOwnerFromCandidates({ userId: 10 })).toMatchObject({
      state: "resolved",
      billingOwnerUserId: 10,
      relationship: "individual",
      canManageBilling: true,
    });
  });

  it("allows a workspace owner to manage their own billing", () => {
    expect(resolveBillingOwnerFromCandidates({
      userId: 10,
      ownedWorkspaceId: 200,
    })).toMatchObject({
      state: "resolved",
      billingOwnerUserId: 10,
      workspaceId: 200,
      relationship: "workspace_owner",
      canManageBilling: true,
    });
  });

  it.each(["editor", "viewer"])("blocks a covered %s from personal billing", () => {
    const result = resolveBillingOwnerFromCandidates({
      userId: 11,
      membership: { workspaceId: 200, ownerId: 10, ownerExists: 10 },
    });
    expect(result).toMatchObject({
      state: "resolved",
      requestedByUserId: 11,
      billingOwnerUserId: 10,
      relationship: "workspace_member",
      canManageBilling: false,
    });
  });

  it("prioritizes covered membership over ownership of a private workspace", () => {
    expect(resolveBillingOwnerFromCandidates({
      userId: 11,
      ownedWorkspaceId: 201,
      membership: { workspaceId: 200, ownerId: 10, ownerExists: 10 },
    })).toMatchObject({
      state: "resolved",
      billingOwnerUserId: 10,
      workspaceId: 200,
      relationship: "workspace_member",
      canManageBilling: false,
    });
  });

  it("fails closed when a workspace owner record is missing", () => {
    expect(resolveBillingOwnerFromCandidates({
      userId: 11,
      membership: { workspaceId: 200, ownerId: 999, ownerExists: null },
    })).toMatchObject({
      state: "unresolved",
      canManageBilling: false,
      reason: "workspace_owner_missing",
    });
  });

  it("does not let a member's personal subscription state change ownership", () => {
    const memberHasStalePersonalTrial = true;
    const resolution = resolveBillingOwnerFromCandidates({
      userId: 11,
      membership: { workspaceId: 200, ownerId: 10, ownerExists: 10 },
    });
    expect(memberHasStalePersonalTrial).toBe(true);
    expect(resolution).toMatchObject({
      billingOwnerUserId: 10,
      canManageBilling: false,
    });
  });
});