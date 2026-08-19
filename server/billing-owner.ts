import { db } from "./db";
import { users, workspaceMembers, workspaces } from "@shared/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { storage } from "./storage";

export type BillingOwnerResolution =
  | {
      state: "resolved";
      billingOwnerUserId: number;
      requestedByUserId: number;
      workspaceId: number | null;
      relationship: "individual" | "workspace_owner" | "workspace_member";
      canManageBilling: boolean;
    }
  | {
      state: "unresolved";
      requestedByUserId: number;
      workspaceId: number | null;
      relationship: "workspace_member";
      canManageBilling: false;
      reason: "workspace_owner_missing" | "workspace_missing" | "user_missing" | "workspace_lookup_unavailable";
    };

export function resolveBillingOwnerFromCandidates(input: {
  userId: number;
  ownedWorkspaceId?: number | null;
  membership?: {
    workspaceId: number;
    ownerId: number;
    ownerExists: number | null;
  } | null;
}): BillingOwnerResolution {
  if (input.membership) {
    if (!input.membership.ownerExists) {
      return {
        state: "unresolved",
        requestedByUserId: input.userId,
        workspaceId: input.membership.workspaceId,
        relationship: "workspace_member",
        canManageBilling: false,
        reason: "workspace_owner_missing",
      };
    }

    return {
      state: "resolved",
      billingOwnerUserId: input.membership.ownerId,
      requestedByUserId: input.userId,
      workspaceId: input.membership.workspaceId,
      relationship: "workspace_member",
      canManageBilling: false,
    };
  }

  if (input.ownedWorkspaceId) {
    return {
      state: "resolved",
      billingOwnerUserId: input.userId,
      requestedByUserId: input.userId,
      workspaceId: input.ownedWorkspaceId,
      relationship: "workspace_owner",
      canManageBilling: true,
    };
  }

  return {
    state: "resolved",
    billingOwnerUserId: input.userId,
    requestedByUserId: input.userId,
    workspaceId: null,
    relationship: "individual",
    canManageBilling: true,
  };
}

/**
 * Resolves the account permitted to manage billing. Covered editor/viewer
 * membership takes precedence over ownership of the caller's private workspace.
 * Membership resolves deterministically by workspace ID. Missing owners never
 * fall back to a member's personal billing.
 */
export async function resolveBillingOwner(userId: number): Promise<BillingOwnerResolution> {
  const [membership] = await db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      ownerId: workspaces.ownerId,
      ownerExists: users.id,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .leftJoin(users, eq(workspaces.ownerId, users.id))
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        inArray(workspaceMembers.role, ["editor", "viewer"]),
      ),
    )
    .orderBy(asc(workspaceMembers.workspaceId))
    .limit(1);

  const [ownedWorkspace] = membership
    ? []
    : await db
      .select({ workspaceId: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.ownerId, userId))
      .orderBy(asc(workspaces.id))
      .limit(1);

  if (ownedWorkspace || membership) {
    return resolveBillingOwnerFromCandidates({
      userId,
      ownedWorkspaceId: ownedWorkspace?.workspaceId,
      membership,
    });
  }

  // Defensive fallback for older workspace records that still use users.workspace_id
  // but have no workspace_members row. It remains fail-closed and never inspects
  // the member's personal subscription.
  const user = await storage.getUser(userId);
  if (!user) {
    return {
      state: "unresolved",
      requestedByUserId: userId,
      workspaceId: null,
      relationship: "workspace_member",
      canManageBilling: false,
      reason: "user_missing",
    };
  }
  if (!storage.getWorkspaceById) {
    return {
      state: "unresolved",
      requestedByUserId: userId,
      workspaceId: user.workspaceId,
      relationship: "workspace_member",
      canManageBilling: false,
      reason: "workspace_lookup_unavailable",
    };
  }
  const workspace = await storage.getWorkspaceById(user.workspaceId);
  if (!workspace) {
    return {
      state: "unresolved",
      requestedByUserId: userId,
      workspaceId: user.workspaceId,
      relationship: "workspace_member",
      canManageBilling: false,
      reason: "workspace_missing",
    };
  }
  if (workspace.ownerId === userId) {
    return resolveBillingOwnerFromCandidates({
      userId,
      ownedWorkspaceId: workspace.id,
    });
  }
  const owner = await storage.getUser(workspace.ownerId);
  return resolveBillingOwnerFromCandidates({
    userId,
    membership: {
      workspaceId: workspace.id,
      ownerId: workspace.ownerId,
      ownerExists: owner?.id ?? null,
    },
  });
}