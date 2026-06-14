import { db } from "./db";
import { workspaceMembers, workspaceInvites } from "@shared/schema";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { getSubscriptionStatus } from "./subscription-middleware";
import { storage } from "./storage";

/**
 * Snapshot of a workspace's seat usage relative to the capacity granted by the
 * owner's active plan (its max_seats). Read-only and side-effect free.
 *
 * Seat model:
 *  - Every workspace member (including the owner) occupies one seat.
 *  - Each pending (unaccepted, unexpired) invite RESERVES one seat so that a
 *    workspace can never over-commit beyond capacity between send and accept.
 *  - Capacity is the owner's plan max_seats, defaulting to 1 (Solo) when the
 *    owner has no active/trial subscription — this is what makes a downgrade or
 *    expiration naturally surface as `isOverCapacity` instead of evicting anyone.
 */
export interface WorkspaceSeatInfo {
  capacity: number; // owner plan max_seats (>= 1)
  usedSeats: number; // active members, includes the owner
  pendingInvites: number; // unaccepted, unexpired invites reserving seats
  reservedSeats: number; // usedSeats + pendingInvites
  availableSeats: number; // capacity - reservedSeats, floored at 0
  isOverCapacity: boolean; // usedSeats > capacity (e.g. after a downgrade/expiry)
  ownerId: number | null;
}

/**
 * Resolve the seat capacity granted by a workspace owner's plan. Inherits the
 * SAME deterministic, fail-closed resolution used for access (getSubscriptionStatus):
 * an inactive/expired owner subscription yields no seatCapacity, so we fall back
 * to 1 (Solo). Never throws — callers can rely on a numeric capacity.
 */
async function resolveOwnerCapacity(ownerId: number | null | undefined): Promise<number> {
  if (!ownerId) return 1;
  try {
    const status = await getSubscriptionStatus(ownerId);
    if (typeof status.seatCapacity === "number" && status.seatCapacity > 0) {
      return status.seatCapacity;
    }
  } catch (error) {
    console.error(`[resolveOwnerCapacity] Error resolving capacity for owner ${ownerId}:`, error);
  }
  return 1;
}

/**
 * Compute the current seat usage for a workspace. Counts members and pending
 * invites directly from the database and pairs them with the owner's plan
 * capacity.
 */
export async function getWorkspaceSeatInfo(workspaceId: number): Promise<WorkspaceSeatInfo> {
  const workspace = storage.getWorkspaceById ? await storage.getWorkspaceById(workspaceId) : undefined;
  const ownerId = workspace?.ownerId ?? null;

  const capacity = await resolveOwnerCapacity(ownerId);

  const [memberRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId));
  const usedSeats = memberRow?.count ?? 0;

  const [inviteRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.workspaceId, workspaceId),
        isNull(workspaceInvites.acceptedAt),
        gte(workspaceInvites.expiresAt, new Date())
      )
    );
  const pendingInvites = inviteRow?.count ?? 0;

  const reservedSeats = usedSeats + pendingInvites;
  const availableSeats = Math.max(0, capacity - reservedSeats);
  const isOverCapacity = usedSeats > capacity;

  return {
    capacity,
    usedSeats,
    pendingInvites,
    reservedSeats,
    availableSeats,
    isOverCapacity,
    ownerId,
  };
}
