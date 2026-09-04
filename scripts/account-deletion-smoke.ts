import { randomUUID } from "node:crypto";
import { pool } from "../server/db";
import { AccountDeletionService } from "../server/account-deletion-service";

if (
  process.env.ACCOUNT_DELETION_SMOKE !== "1" ||
  process.env.NODE_ENV === "production" ||
  process.env.REPLIT_DEPLOYMENT === "1"
) {
  throw new Error("Account deletion smoke test is development-only and requires ACCOUNT_DELETION_SMOKE=1");
}

const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const username = `delete_smoke_${suffix}`;
let userId: number | null = null;
let workspaceId: number | null = null;

async function cleanupFixture(): Promise<void> {
  if (!userId || !workspaceId) return;
  await pool.query("BEGIN");
  try {
    await pool.query("DELETE FROM user_subscriptions WHERE user_id = $1", [userId]);
    await pool.query("DELETE FROM workspace_members WHERE user_id = $1 OR workspace_id = $2", [userId, workspaceId]);
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
    await pool.query("DELETE FROM workspaces WHERE id = $1", [workspaceId]);
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }
}

try {
  await pool.query("BEGIN");
  const workspace = await pool.query(
    "INSERT INTO workspaces (name, owner_id) VALUES ($1, 0) RETURNING id",
    [`Deletion smoke ${suffix}`],
  );
  workspaceId = workspace.rows[0].id;

  const user = await pool.query(
    `INSERT INTO users (
       username, password, email, is_active, is_admin, token_version, workspace_id, created_at
     ) VALUES ($1, $2, NULL, TRUE, FALSE, 1, $3, now())
     RETURNING id`,
    [username, "not-a-login-hash", workspaceId],
  );
  userId = user.rows[0].id;

  await pool.query("UPDATE workspaces SET owner_id = $1 WHERE id = $2", [userId, workspaceId]);
  await pool.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role, invited_by_user_id)
     VALUES ($1, $2, 'owner', $2)`,
    [workspaceId, userId],
  );
  const plan = await pool.query(
    "SELECT id FROM subscription_plans WHERE billing_period = 'trial' ORDER BY id LIMIT 1",
  );
  if (!plan.rows[0]) throw new Error("No trial plan exists for smoke fixture");
  await pool.query(
    `INSERT INTO user_subscriptions (
       user_id, plan_id, status, trial_start_date, trial_end_date, total_paid
     ) VALUES ($1, $2, 'trial', now(), now() + interval '30 days', 0)`,
    [userId, plan.rows[0].id],
  );
  await pool.query("COMMIT");

  let reproducedConstraint: string | undefined;
  await pool.query("BEGIN");
  try {
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);
  } catch (error) {
    reproducedConstraint = (error as { constraint?: string }).constraint;
  } finally {
    await pool.query("ROLLBACK");
  }
  if (reproducedConstraint !== "workspace_members_invited_by_user_id_fkey") {
    throw new Error(`Expected workspace_members_invited_by_user_id_fkey, received ${reproducedConstraint ?? "no constraint error"}`);
  }

  const service = new AccountDeletionService(pool);
  await service.deleteAccount(userId);

  const remaining = await pool.query(
    `SELECT
       (SELECT count(*)::int FROM users WHERE id = $1) AS users,
       (SELECT count(*)::int FROM workspaces WHERE id = $2) AS workspaces,
       (SELECT count(*)::int FROM workspace_members WHERE user_id = $1 OR workspace_id = $2) AS memberships,
       (SELECT count(*)::int FROM user_subscriptions WHERE user_id = $1) AS subscriptions`,
    [userId, workspaceId],
  );
  const counts = remaining.rows[0];
  if (Object.values(counts).some((value) => Number(value) !== 0)) {
    throw new Error(`Deletion left fixture records: ${JSON.stringify(counts)}`);
  }

  console.log(JSON.stringify({
    reproducedConstraint,
    repairedDeletion: "passed",
    remaining: counts,
  }));
} catch (error) {
  await cleanupFixture();
  throw error;
} finally {
  await pool.end();
}