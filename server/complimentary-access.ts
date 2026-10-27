// An audited access overlay, NOT a payment or subscription-state transition.
export const complimentaryEventType = "admin_complimentary_access_granted";
export function validateComplimentaryInput(body: any, now = Date.now()) {
  const expiry = typeof body?.expiresAt === "string" ? Date.parse(body.expiresAt) : NaN;
  if (!Number.isSafeInteger(body?.subscriptionId) || body.subscriptionId <= 0
    || !Number.isFinite(expiry) || expiry <= now || expiry > now + 90 * 86400000
    || typeof body?.reason !== "string" || body.reason.trim().length < 10 || body.reason.length > 500
    || body?.confirmed !== true) throw new Error("invalid_complimentary_request");
  return { subscriptionId: body.subscriptionId as number, expiresAt: new Date(expiry).toISOString(), reason: body.reason.trim() as string };
}
export async function complimentaryExpiry(userId: number, subscriptionId: number): Promise<string | null> {
  const { pool } = await import("./db");
  const result = await pool.query(`SELECT event_data->>'expiresAt' AS expiry FROM billing_events
    WHERE user_id=$1 AND event_type=$2 AND processed=true AND event_data->>'subscriptionId'=$3
    ORDER BY id DESC LIMIT 1`, [userId, complimentaryEventType, String(subscriptionId)]);
  const expiry = result.rows[0]?.expiry;
  return typeof expiry === "string" && Number.isFinite(Date.parse(expiry)) && Date.parse(expiry) > Date.now() ? expiry : null;
}
export async function grantComplimentaryAccess(userId: number, body: any, adminId: number) {
  const input = validateComplimentaryInput(body);
  const { resolveBillingOwner } = await import("./billing-owner");
  const owner = await resolveBillingOwner(userId);
  if (owner.state === "unresolved" || !owner.canManageBilling || owner.billingOwnerUserId !== userId) throw new Error("billing_owner_required");
  const { pool } = await import("./db");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1,36)", [userId]);
    const account = await client.query(`SELECT s.id FROM user_subscriptions s JOIN users u ON u.id=s.user_id
      WHERE s.id=$1 AND s.user_id=$2 AND s.status='paused' AND u.is_active=true FOR UPDATE OF s,u`, [input.subscriptionId, userId]);
    if (account.rows.length !== 1) throw new Error("paused_active_account_required");
    // Atomic grant + audit in the existing ledger. No payment/user/subscription UPDATEs.
    await client.query("INSERT INTO billing_events(user_id,event_type,event_data,processed) VALUES($1,$2,$3,true)",
      [userId, complimentaryEventType, JSON.stringify({ ...input, adminId, source: "goodwill", paymentReceived: false })]);
    await client.query("COMMIT");
    return { outcome: "complimentary_access_granted", userId, ...input, paymentMutation: "none", subscriptionMutation: "none" };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
