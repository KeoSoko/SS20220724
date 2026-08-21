/**
 * Billing integrity one-time migration — tasks 59 & 60B.
 *
 * Applies guarded data repairs that were confirmed correct in development to
 * any environment that still has the pre-repair state. Every repair is
 * idempotent: the WHERE guard matches only when the row is still in the
 * expected broken state, so re-running this at startup is always safe.
 *
 * Repairs covered:
 *  1. User 7  (sub 39):  plan_id 1 → 3  (annual R530 payment, wrong trial plan)
 *  2. User 95 (sub 63):  plan_id 1 → 2  (monthly R49 payment, wrong trial plan)
 *  3. User 100 (sub 68): plan_id 1 → 3  (annual R530 payment, wrong trial plan)
 *  4. User 100 (tx 100): status completed → refunded  (duplicate annual charge, manually
 *     refunded externally; local records reconciled here)
 *  5. User 100 (sub 68): total_paid 106000 → 53000, last_payment_date corrected
 *
 * Never called: Paystack charge, checkout, or subscription mutation of any kind.
 */

import { pool } from './db';
import { log } from './vite';

const MIGRATION_TAG = 'billing-integrity-migration';

export async function runBillingIntegrityMigration(): Promise<void> {
  const client = await pool.connect();
  try {
    log('Starting billing integrity migration check…', MIGRATION_TAG);

    await client.query('BEGIN');

    // ── Repair 1: user 7, sub 39 — plan_id 1 → 3 ────────────────────────────
    const u7 = await client.query(`
      UPDATE user_subscriptions
      SET plan_id    = 3,
          updated_at = NOW()
      WHERE id        = 39
        AND user_id   = 7
        AND plan_id   = 1
        AND total_paid = 53000
        AND status    = 'active'
    `);
    if ((u7.rowCount ?? 0) > 0) {
      await client.query(`
        INSERT INTO billing_events (user_id, event_type, event_data, created_at)
        VALUES (7, 'admin_manual_sync',
          jsonb_build_object(
            'action', 'plan_id_repair', 'from', 1, 'to', 3,
            'reason', 'billing_integrity_repair_task59',
            'repairedAt', NOW()::text
          ), NOW())
      `);
      log(`Repaired user 7 sub 39: plan_id 1 → 3`, MIGRATION_TAG);
    } else {
      log('User 7 sub 39: already repaired or guard mismatch — skipping', MIGRATION_TAG);
    }

    // ── Repair 2: user 95, sub 63 — plan_id 1 → 2 ───────────────────────────
    const u95 = await client.query(`
      UPDATE user_subscriptions
      SET plan_id    = 2,
          updated_at = NOW()
      WHERE id        = 63
        AND user_id   = 95
        AND plan_id   = 1
        AND total_paid = 4900
        AND status    = 'cancelled'
    `);
    if ((u95.rowCount ?? 0) > 0) {
      await client.query(`
        INSERT INTO billing_events (user_id, event_type, event_data, created_at)
        VALUES (95, 'admin_manual_sync',
          jsonb_build_object(
            'action', 'plan_id_repair', 'from', 1, 'to', 2,
            'reason', 'billing_integrity_repair_task59',
            'repairedAt', NOW()::text
          ), NOW())
      `);
      log(`Repaired user 95 sub 63: plan_id 1 → 2`, MIGRATION_TAG);
    } else {
      log('User 95 sub 63: already repaired or guard mismatch — skipping', MIGRATION_TAG);
    }

    // ── Repair 3: user 100, sub 68 — plan_id 1 → 3 ──────────────────────────
    const u100plan = await client.query(`
      UPDATE user_subscriptions
      SET plan_id    = 3,
          updated_at = NOW()
      WHERE id        = 68
        AND user_id   = 100
        AND plan_id   = 1
        AND status    = 'active'
    `);
    if ((u100plan.rowCount ?? 0) > 0) {
      await client.query(`
        INSERT INTO billing_events (user_id, event_type, event_data, created_at)
        VALUES (100, 'admin_manual_sync',
          jsonb_build_object(
            'action', 'plan_id_repair', 'from', 1, 'to', 3,
            'reason', 'billing_integrity_repair_task59',
            'repairedAt', NOW()::text
          ), NOW())
      `);
      log(`Repaired user 100 sub 68: plan_id 1 → 3`, MIGRATION_TAG);
    } else {
      log('User 100 sub 68 plan_id: already repaired or guard mismatch — skipping', MIGRATION_TAG);
    }

    // ── Repair 4: user 100, tx 100 — mark duplicate as refunded ─────────────
    const tx100 = await client.query(`
      UPDATE payment_transactions
      SET status        = 'refunded',
          refund_reason = 'Duplicate annual subscription payment manually refunded',
          updated_at    = NOW()
      WHERE id                     = 100
        AND user_id                = 100
        AND amount                 = 53000
        AND platform_transaction_id = 'ss_1769066643548_b38i9jlwk'
        AND status                 = 'completed'
    `);
    if ((tx100.rowCount ?? 0) > 0) {
      log(`Marked user 100 tx 100 as refunded`, MIGRATION_TAG);
    } else {
      log('User 100 tx 100: already refunded or guard mismatch — skipping', MIGRATION_TAG);
    }

    // ── Repair 5: user 100, sub 68 — correct total_paid + last_payment_date ──
    const u100totals = await client.query(`
      UPDATE user_subscriptions
      SET total_paid        = 53000,
          last_payment_date = '2026-01-22 07:23:39.382'::timestamp,
          updated_at        = NOW()
      WHERE id              = 68
        AND user_id         = 100
        AND total_paid      = 106000
        AND plan_id         = 3
        AND status          = 'active'
        AND cancelled_at IS NULL
    `);
    if ((u100totals.rowCount ?? 0) > 0) {
      await client.query(`
        INSERT INTO billing_events (user_id, event_type, event_data, created_at)
        VALUES (100, 'duplicate_charge_refunded',
          jsonb_build_object(
            'userId', 100, 'subscriptionId', 68,
            'refundedPaymentTransactionId', 100,
            'refundedAmount', 53000,
            'duplicateReference', 'ss_1769066643548_b38i9jlwk',
            'retainedPaymentTransactionId', 99,
            'retainedReference', 'ss_1769066505896_uhjiyz260',
            'reason', 'Manual duplicate refund reconciliation',
            'reconciliationTimestamp', NOW()::text,
            'totalPaidBefore', 106000, 'totalPaidAfter', 53000
          ), NOW())
      `);
      log(`Reconciled user 100 sub 68: total_paid 106000 → 53000, last_payment_date corrected`, MIGRATION_TAG);
    } else {
      log('User 100 sub 68 totals: already reconciled or guard mismatch — skipping', MIGRATION_TAG);
    }

    await client.query('COMMIT');
    log('Billing integrity migration complete', MIGRATION_TAG);
  } catch (err) {
    await client.query('ROLLBACK');
    // Log and continue — a migration failure must never prevent the app from
    // starting. The root-cause guard in processPaystackSubscription ensures
    // future webhook processing is fail-closed regardless of data state.
    log(`Billing integrity migration rolled back: ${err}`, MIGRATION_TAG);
  } finally {
    client.release();
  }
}
