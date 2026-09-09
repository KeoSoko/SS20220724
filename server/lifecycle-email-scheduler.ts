import { pool } from "./db";
import { emailService } from "./email-service";
import { randomBytes } from "node:crypto";
import { CAMPAIGN_REGISTRY, LIFECYCLE_CAMPAIGNS, campaignOn, retryDelayMs, eligible, canSend, isQuietHours, buildCopy, type LifecycleFacts } from "./lifecycle-emails";
import { resolvePublicAppOrigin } from "./public-app-origin";

export const LIFECYCLE_BATCH_SIZE = 100;
const STALE_CLAIM_MINUTES = 30;
type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> };
export type LifecycleSender = (delivery: any) => Promise<"sent" | "transient" | "permanent" | "uncertain">;

/** A bounded, read-only candidate scan followed by idempotent ledger inserts. */
export async function enrollLifecycleEligibility(queryable: Queryable = pool, now = new Date()) {
  const enabled = LIFECYCLE_CAMPAIGNS.filter(campaign => campaignOn(campaign));
  if (!enabled.length) return 0;
  const candidates = await queryable.query(`
    SELECT u.id, u.created_at, u.email_verified_at, u.is_email_verified,
      ra.receipt_count, ra.first_receipt_at, ra.third_receipt_at, ra.last_activity_at,
      ea.report_completed_at,
      GREATEST(u.created_at, COALESCE(u.last_login,u.created_at), COALESCE(ra.last_activity_at,u.created_at), COALESCE(ea.report_completed_at,u.created_at)) meaningful_activity_at,
      COALESCE(lp.marketing_opted_out,false) marketing_opted_out,
      COALESCE(ls.marketing_sends_7d,0)::int marketing_sends_7d,
      EXISTS (SELECT 1 FROM email_events x WHERE x.user_id=u.id
        AND x.event_type IN ('bounce','dropped','spam_report','complaint')) hard_suppressed,
      EXISTS (SELECT 1 FROM email_events x WHERE x.user_id=u.id
        AND x.event_type IN ('unsubscribe','group_unsubscribe')) marketing_unsubscribed
    FROM users u
    LEFT JOIN LATERAL (SELECT COUNT(DISTINCT r.id)::int receipt_count,
      MIN(r.created_at) first_receipt_at,
      (ARRAY_AGG(r.created_at ORDER BY r.created_at))[3] third_receipt_at,
      MAX(r.created_at) last_activity_at FROM receipts r WHERE r.user_id=u.id) ra ON true
    LEFT JOIN LATERAL (SELECT MAX(e.completed_at) report_completed_at FROM export_jobs e
      WHERE e.user_id=u.id AND e.status='completed') ea ON true
    LEFT JOIN lifecycle_preferences lp ON lp.user_id=u.id
    LEFT JOIN LATERAL (SELECT COUNT(*) marketing_sends_7d FROM lifecycle_deliveries d
      WHERE d.user_id=u.id AND d.status='sent' AND d.sent_at >= $2 - interval '7 days'
        AND d.campaign_key NOT IN ('welcome','verification-reminder')) ls ON true
    WHERE u.created_at >= $1 AND COALESCE(u.is_active,true) AND NOT COALESCE(u.is_admin,false)
      AND u.email IS NOT NULL
      AND u.email !~* '((^|[+._-])(test|qa|internal)([+._-]|@)|@(example\.)?(test|invalid)$|@localhost$)'
    ORDER BY u.created_at LIMIT 100`, [new Date("2026-09-09T00:00:00Z"), now]);
  let inserted = 0;
  for (const row of candidates.rows) {
    const facts: LifecycleFacts = { createdAt: row.created_at, now, verifiedAt: row.email_verified_at,
      receiptCount: Number(row.receipt_count), firstReceiptAt: row.first_receipt_at,
      thirdReceiptAt: row.third_receipt_at, lastActivityAt: row.last_activity_at,
      meaningfulActivityAt: row.meaningful_activity_at,
      reportOrExportCompletedAt: row.report_completed_at, hardSuppressed: row.hard_suppressed,
      marketingOptedOut: row.marketing_opted_out || row.marketing_unsubscribed };
    for (const campaign of enabled) {
      if (!canSend(campaign, facts, isQuietHours(now), Number(row.marketing_sends_7d))) continue;
      const registry = CAMPAIGN_REGISTRY[campaign];
      const result = await queryable.query(`INSERT INTO lifecycle_deliveries
        (campaign_key,campaign_version,user_id,status,eligible_at,due_at)
        VALUES ($1,$2,$3,'eligible',$4,$4) ON CONFLICT (campaign_key,campaign_version,user_id) DO NOTHING`,
        [campaign, registry.version, row.id, now]);
      inserted += result.rowCount ?? 0;
    }
  }
  return inserted;
}

/** Claiming is one SQL statement: SKIP LOCKED prevents two workers sending a row. */
export async function claimLifecycleBatch(queryable: Queryable = pool, now = new Date()) {
  const enabled = LIFECYCLE_CAMPAIGNS.filter(campaign => campaignOn(campaign));
  if (!enabled.length) return []; // Important: flags-off performs no eligibility writes.
  await queryable.query(`UPDATE lifecycle_deliveries SET status='uncertain',audited_at=$1,updated_at=$1
    WHERE status='sending' AND send_started_at < $1 - ($2 * interval '1 minute')`, [now, STALE_CLAIM_MINUTES]);
  const result = await queryable.query(`
    UPDATE lifecycle_deliveries d SET status='claimed', claim_at=$1,
      attempt_count=d.attempt_count+1, updated_at=$1
    WHERE d.id IN (
      SELECT id FROM lifecycle_deliveries
      WHERE (status='eligible' OR (status='claimed' AND claim_at < $1 - ($2 * interval '1 minute'))
             OR (status='retry' AND retry_at <= $1))
        AND due_at <= $1 AND campaign_key = ANY($3::text[])
      ORDER BY due_at LIMIT $4 FOR UPDATE SKIP LOCKED
    ) RETURNING d.*`, [now, STALE_CLAIM_MINUTES, enabled, LIFECYCLE_BATCH_SIZE]);
  return result.rows;
}

export async function processLifecycleBatch(sender: LifecycleSender, queryable: Queryable = pool, now = new Date()) {
  if (!LIFECYCLE_CAMPAIGNS.some(c => campaignOn(c))) return { claimed: 0 };
  const run = await queryable.query(`INSERT INTO lifecycle_scheduler_runs (started_at) VALUES (now()) RETURNING id`);
  const runId = run.rows[0]?.id;
  const claimed = await claimLifecycleBatch(queryable);
  const outcome = { sent: 0, suppressed: 0, failed: 0 };
  for (const delivery of claimed) {
    if (isQuietHours(now)) {
      await queryable.query(`UPDATE lifecycle_deliveries SET status='retry',retry_at=now()+interval '1 hour',updated_at=now()
        WHERE id=$1 AND status='claimed'`, [delivery.id]);
      continue;
    }
    const current = await queryable.query(`
      SELECT u.created_at,u.last_login,u.email_verified_at,u.is_email_verified,u.is_active,u.is_admin,u.email,
        COALESCE(lp.marketing_opted_out,false) marketing_opted_out,
        (SELECT COUNT(*)::int FROM receipts r WHERE r.user_id=u.id) receipt_count,
        (SELECT MIN(r.created_at) FROM receipts r WHERE r.user_id=u.id) first_receipt_at,
        (SELECT created_at FROM receipts r WHERE r.user_id=u.id ORDER BY created_at OFFSET 2 LIMIT 1) third_receipt_at,
        (SELECT MAX(r.created_at) FROM receipts r WHERE r.user_id=u.id) last_receipt_at,
        (SELECT MAX(e.completed_at) FROM export_jobs e WHERE e.user_id=u.id AND e.status='completed') report_completed_at,
        EXISTS (SELECT 1 FROM email_events e WHERE e.user_id=u.id AND
          e.event_type IN ('bounce','dropped','spam_report','complaint')) hard_suppressed,
        EXISTS (SELECT 1 FROM email_events e WHERE e.user_id=u.id AND e.event_type IN ('unsubscribe','group_unsubscribe')) marketing_unsubscribed
      FROM users u LEFT JOIN lifecycle_preferences lp ON lp.user_id=u.id WHERE u.id=$1`, [delivery.user_id]);
    const row = current.rows[0];
    const marketing = CAMPAIGN_REGISTRY[delivery.campaign_key as keyof typeof CAMPAIGN_REGISTRY]?.kind === "marketing";
    let marketingSends = 0;
    if (marketing) {
      const cap = await queryable.query(`SELECT COUNT(*)::int count FROM lifecycle_deliveries
        WHERE user_id=$1 AND status='sent' AND sent_at >= now()-interval '7 days'
          AND campaign_key <> 'verification-reminder'`, [delivery.user_id]);
      marketingSends = Number(cap.rows[0]?.count || 0);
    }
    const activityCandidates = [row?.created_at, row?.last_login, row?.last_receipt_at, row?.report_completed_at].filter(Boolean).map((value: Date) => new Date(value).getTime());
    const facts: LifecycleFacts | null = row ? {
      createdAt: new Date(row.created_at), now,
      verifiedAt: row.email_verified_at || (row.is_email_verified ? now : null),
      receiptCount: Number(row.receipt_count || 0), firstReceiptAt: row.first_receipt_at,
      thirdReceiptAt: row.third_receipt_at, lastActivityAt: row.last_receipt_at,
      reportOrExportCompletedAt: row.report_completed_at,
      meaningfulActivityAt: activityCandidates.length ? new Date(Math.max(...activityCandidates)) : new Date(row.created_at),
      marketingOptedOut: row.marketing_opted_out || row.marketing_unsubscribed,
      hardSuppressed: row.hard_suppressed,
    } : null;
    const internal = !row?.is_active || row?.is_admin || !row?.email
      || /((^|[+._-])(test|qa|internal)([+._-]|@)|@(example\.)?(test|invalid)$|@localhost$)/i.test(row.email);
    if (!facts || internal || !canSend(delivery.campaign_key, facts, false, marketingSends)) {
      await queryable.query(`UPDATE lifecycle_deliveries SET status='suppressed',suppressed_at=$2,audited_at=$2,updated_at=$2,error_class='policy',error_code='ineligible_at_send'
        WHERE id=$1 AND status='claimed'`, [delivery.id, now]);
      outcome.suppressed++;
      continue;
    }
    const started = await queryable.query(`UPDATE lifecycle_deliveries SET status='sending',send_started_at=now(),updated_at=now()
      WHERE id=$1 AND status='claimed' RETURNING id`, [delivery.id]);
    if (!started.rowCount) continue;
    let result: "sent" | "transient" | "permanent" | "uncertain";
    try { result = await sender(delivery); } catch { result = "uncertain"; }
    if (result === "uncertain") {
      await queryable.query(`UPDATE lifecycle_deliveries SET status='uncertain',audited_at=now(),updated_at=now()
        WHERE id=$1 AND status='sending'`, [delivery.id]);
      outcome.failed++;
      continue;
    }
    const version = CAMPAIGN_REGISTRY[delivery.campaign_key as keyof typeof CAMPAIGN_REGISTRY].version;
    if (result === "sent") {
      await queryable.query(
        `UPDATE lifecycle_deliveries SET status='sent', sent_at=now(), audited_at=now(), updated_at=now()
         WHERE id=$1 AND status='sending' AND campaign_version=$2`, [delivery.id, version]);
      outcome.sent++;
    } else if (result === "transient" && delivery.attempt_count < 6) {
      await queryable.query(
        `UPDATE lifecycle_deliveries SET status='retry', retry_at=now()+($2 * interval '1 millisecond'),
         error_class='transient', error_code='delivery_retry', updated_at=now()
         WHERE id=$1 AND status='sending'`, [delivery.id, retryDelayMs(delivery.attempt_count)]);
    } else {
      await queryable.query(
        `UPDATE lifecycle_deliveries SET status=$2, failed_at=CASE WHEN $2='failed' THEN now() ELSE failed_at END,
         suppressed_at=CASE WHEN $2='suppressed' THEN now() ELSE suppressed_at END,
         audited_at=now(), error_class=$3, error_code='delivery_permanent', updated_at=now()
         WHERE id=$1 AND status='sending'`, [delivery.id, result === "permanent" ? "suppressed" : "failed", "permanent"]);
      if (result === "permanent") outcome.suppressed++; else outcome.failed++;
    }
  }
  if (runId) await queryable.query(`UPDATE lifecycle_scheduler_runs SET completed_at=$2,claimed_count=$3,sent_count=$4,suppressed_count=$5,failed_count=$6 WHERE id=$1`, [runId, now, claimed.length, outcome.sent, outcome.suppressed, outcome.failed]);
  return { claimed: claimed.length };
}

// Deliberately not started from tests or module import. Production startup may
// opt in only after wiring the existing worker convention.
let lifecycleTimer: ReturnType<typeof setInterval> | null = null;
let lifecycleRunning = false;
export function stopLifecycleEmailWorker(): void {
  if (lifecycleTimer) clearInterval(lifecycleTimer);
  lifecycleTimer = null;
}
export function startLifecycleEmailWorker(sender?: LifecycleSender): void {
  if (lifecycleTimer || process.env.NODE_ENV === "test") return;
  const safeSender = sender ?? (async (delivery: any) => {
    const found = await pool.query("SELECT email,username FROM users WHERE id=$1 LIMIT 1", [delivery.user_id]);
    const user = found.rows[0];
    if (!user?.email) return "permanent";
    if (delivery.campaign_key === "verification-reminder") {
      const token = randomBytes(32).toString("hex");
      const updated = await pool.query("UPDATE users SET email_verification_token=$1 WHERE id=$2 AND COALESCE(is_email_verified,false)=false AND email_verified_at IS NULL AND is_active=true AND is_admin=false RETURNING email,username", [token, delivery.user_id]);
      if (!updated.rowCount) return "permanent";
      return emailService.sendEmailVerification(updated.rows[0].email, updated.rows[0].username || "there", token)
        .then(ok => ok ? "sent" : "transient");
    }
    const copy = buildCopy(delivery.campaign_key, user.username, resolvePublicAppOrigin());
    return emailService.sendLifecycleEmail({ ...copy, campaign: delivery.campaign_key, userId: delivery.user_id, email: user.email, username: user.username }).then(result => result);
  }) as LifecycleSender;
  const run = async () => {
    if (lifecycleRunning || !LIFECYCLE_CAMPAIGNS.some(c => campaignOn(c))) return;
    lifecycleRunning = true;
    try { await enrollLifecycleEligibility(); await processLifecycleBatch(safeSender); } finally { lifecycleRunning = false; }
  };
  void run();
  lifecycleTimer = setInterval(() => void run(), 60_000);
  lifecycleTimer.unref?.();
}