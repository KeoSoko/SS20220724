import { db } from "./db";
import { users, workspaces, workspaceMembers } from "../shared/schema";
import { eq, sql, and, ne } from "drizzle-orm";

export interface IntegrityViolation {
  check: string;
  severity: "CRITICAL" | "WARNING";
  details: string;
  affectedIds?: number[];
}

export interface IntegrityReport {
  passed: boolean;
  summary: string;
  violations: IntegrityViolation[];
  stats: {
    totalUsers: number;
    totalWorkspaces: number;
    totalMemberships: number;
    billingMemberships: number;
  };
  timestamp: string;
}

export async function runWorkspaceIntegrityValidator(): Promise<IntegrityReport> {
  const violations: IntegrityViolation[] = [];

  // ── GATHER RAW DATA ──────────────────────────────────────────────────────────

  const [allUsers, allWorkspaces, allMembers] = await Promise.all([
    db.select({ id: users.id, workspaceId: users.workspaceId }).from(users),
    db.select({ id: workspaces.id, ownerId: workspaces.ownerId }).from(workspaces),
    db.select({
      id: workspaceMembers.id,
      workspaceId: workspaceMembers.workspaceId,
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
    }).from(workspaceMembers),
  ]);

  const workspaceByOwner = new Map<number, number[]>();
  for (const ws of allWorkspaces) {
    if (!workspaceByOwner.has(ws.ownerId)) workspaceByOwner.set(ws.ownerId, []);
    workspaceByOwner.get(ws.ownerId)!.push(ws.id);
  }

  const workspaceById = new Map(allWorkspaces.map((w) => [w.id, w]));
  const userById = new Map(allUsers.map((u) => [u.id, u]));

  // ── CHECK 1: user.workspaceId must point to a workspace the user owns ────────
  const usersWithWrongWorkspace: number[] = [];
  for (const user of allUsers) {
    const ws = workspaceById.get(user.workspaceId);
    if (!ws || ws.ownerId !== user.id) {
      usersWithWrongWorkspace.push(user.id);
    }
  }
  if (usersWithWrongWorkspace.length > 0) {
    violations.push({
      check: "user.workspaceId → own workspace",
      severity: "CRITICAL",
      details: `${usersWithWrongWorkspace.length} user(s) have workspaceId pointing to a workspace they do not own`,
      affectedIds: usersWithWrongWorkspace,
    });
  }

  // ── CHECK 2: every workspace must have a valid owner ────────────────────────
  const orphanWorkspaces: number[] = [];
  for (const ws of allWorkspaces) {
    if (!userById.has(ws.ownerId)) {
      orphanWorkspaces.push(ws.id);
    }
  }
  if (orphanWorkspaces.length > 0) {
    violations.push({
      check: "workspace has valid owner",
      severity: "CRITICAL",
      details: `${orphanWorkspaces.length} workspace(s) reference a non-existent owner`,
      affectedIds: orphanWorkspaces,
    });
  }

  // ── CHECK 3: every user owns exactly one workspace ───────────────────────────
  const usersWithMultipleWorkspaces: number[] = [];
  const usersWithNoWorkspace: number[] = [];
  for (const user of allUsers) {
    const owned = workspaceByOwner.get(user.id) ?? [];
    if (owned.length > 1) usersWithMultipleWorkspaces.push(user.id);
    if (owned.length === 0) usersWithNoWorkspace.push(user.id);
  }
  if (usersWithMultipleWorkspaces.length > 0) {
    violations.push({
      check: "each user owns exactly one workspace",
      severity: "CRITICAL",
      details: `${usersWithMultipleWorkspaces.length} user(s) own more than one workspace`,
      affectedIds: usersWithMultipleWorkspaces,
    });
  }
  if (usersWithNoWorkspace.length > 0) {
    violations.push({
      check: "each user owns exactly one workspace",
      severity: "CRITICAL",
      details: `${usersWithNoWorkspace.length} user(s) own no workspace at all`,
      affectedIds: usersWithNoWorkspace,
    });
  }

  // ── CHECK 4: no duplicate workspace_members rows ─────────────────────────────
  const membershipKeys = new Set<string>();
  const duplicateMembers: number[] = [];
  for (const m of allMembers) {
    const key = `${m.workspaceId}:${m.userId}`;
    if (membershipKeys.has(key)) {
      duplicateMembers.push(m.id);
    } else {
      membershipKeys.add(key);
    }
  }
  if (duplicateMembers.length > 0) {
    violations.push({
      check: "no duplicate workspace_members",
      severity: "CRITICAL",
      details: `${duplicateMembers.length} duplicate workspace_members row(s) detected`,
      affectedIds: duplicateMembers,
    });
  }

  // ── CHECK 5: no orphan workspace_members (user or workspace no longer exists) ─
  const orphanMembers: number[] = [];
  for (const m of allMembers) {
    if (!userById.has(m.userId) || !workspaceById.has(m.workspaceId)) {
      orphanMembers.push(m.id);
    }
  }
  if (orphanMembers.length > 0) {
    violations.push({
      check: "no orphan workspace_members",
      severity: "CRITICAL",
      details: `${orphanMembers.length} workspace_members row(s) reference deleted user or workspace`,
      affectedIds: orphanMembers,
    });
  }

  // ── CHECK 6: workspace_members billing rows must not be for own workspace ────
  // (editor/viewer in your own workspace makes no sense — you're already owner)
  const selfBillingMembers: number[] = [];
  for (const m of allMembers) {
    if (m.role !== "owner") {
      const ws = workspaceById.get(m.workspaceId);
      if (ws && ws.ownerId === m.userId) {
        selfBillingMembers.push(m.id);
      }
    }
  }
  if (selfBillingMembers.length > 0) {
    violations.push({
      check: "no self-billing memberships",
      severity: "WARNING",
      details: `${selfBillingMembers.length} workspace_members row(s) have editor/viewer role in their own workspace`,
      affectedIds: selfBillingMembers,
    });
  }

  // ── CHECK 7: every user.workspaceId references an existing workspace ─────────
  const usersWithMissingWorkspace: number[] = [];
  for (const user of allUsers) {
    if (!workspaceById.has(user.workspaceId)) {
      usersWithMissingWorkspace.push(user.id);
    }
  }
  if (usersWithMissingWorkspace.length > 0) {
    violations.push({
      check: "user.workspaceId references existing workspace",
      severity: "CRITICAL",
      details: `${usersWithMissingWorkspace.length} user(s) reference a workspace that does not exist`,
      affectedIds: usersWithMissingWorkspace,
    });
  }

  // ── CHECK 8: every user must have an owner row in workspace_members ──────────
  // (required by requireWorkspaceRole middleware — without it, all owner routes fail)
  const usersMissingOwnerRow: number[] = [];
  for (const user of allUsers) {
    const hasOwnerRow = allMembers.some(
      (m) => m.workspaceId === user.workspaceId && m.userId === user.id && m.role === "owner"
    );
    if (!hasOwnerRow) usersMissingOwnerRow.push(user.id);
  }
  if (usersMissingOwnerRow.length > 0) {
    violations.push({
      check: "every user has owner row in workspace_members",
      severity: "CRITICAL",
      details: `${usersMissingOwnerRow.length} user(s) are missing their owner workspace_members row — requireWorkspaceRole will fail for them`,
      affectedIds: usersMissingOwnerRow,
    });
  }

  // ── STATS ────────────────────────────────────────────────────────────────────
  const billingMemberships = allMembers.filter((m) => m.role !== "owner").length;

  const stats = {
    totalUsers: allUsers.length,
    totalWorkspaces: allWorkspaces.length,
    totalMemberships: allMembers.length,
    billingMemberships,
  };

  const criticalCount = violations.filter((v) => v.severity === "CRITICAL").length;
  const warnCount = violations.filter((v) => v.severity === "WARNING").length;

  const passed = criticalCount === 0;
  const summary = passed
    ? `✅ PASS — All integrity checks passed. ${stats.totalUsers} users, ${stats.totalWorkspaces} workspaces, ${billingMemberships} billing memberships.`
    : `❌ FAIL — ${criticalCount} critical violation(s), ${warnCount} warning(s). ${stats.totalUsers} users checked.`;

  return {
    passed,
    summary,
    violations,
    stats,
    timestamp: new Date().toISOString(),
  };
}
