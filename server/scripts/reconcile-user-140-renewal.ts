// One-off, idempotent remediation for a stranded Paystack renewal payment.
//
// Background: user 140 (subscription 108) paid R49 for a monthly renewal, but the
// renewal charge.success arrived with NO plan code and NO metadata.user_id. The old
// plan-resolution path threw before recording anything, so the payment was never
// applied: no payment_transaction row, the subscription was later auto-cancelled,
// and the customer lost access despite paying.
//
// This script records the missed payment and reactivates the subscription. It is
// SAFE TO RE-RUN: it checks for the existing payment by (platform, platform_transaction_id)
// and does nothing if it has already been applied.
//
// Run with: npx tsx server/scripts/reconcile-user-140-renewal.ts

import { db } from "../db";
import { sql } from "drizzle-orm";

const REFERENCE = "54d9a7bb2359d0a8e3234f38bd0f44efa20e13baa29afdf9";
const USER_ID = 140;
const SUBSCRIPTION_ID = 108;
const AMOUNT = 4900; // cents (R49)
const PLAN_CODE = "PLN_8l8p7v1mergg804"; // Premium Monthly
const NEXT_BILLING = "2026-07-20 10:31:07.258"; // one month after the prior cycle
const PAYMENT_TIME = "2026-06-20 10:30:45.259";

async function main() {
  const metadata = JSON.stringify({
    customerCode: "CUS_y3cxtv76fvxbgds",
    planCode: PLAN_CODE,
    reference: REFERENCE,
    recurring: true,
    reconciledManually: true,
    reconciledReason: "renewal_charge_without_plan_metadata",
  });

  // Single atomic, idempotent statement. If the payment already exists the
  // INSERT hits the (platform, platform_transaction_id) unique constraint and the
  // dependent UPDATEs join against an empty CTE, so nothing changes.
  const result = await db.execute(sql`
    WITH ins AS (
      INSERT INTO payment_transactions
        (user_id, subscription_id, amount, currency, status, platform, payment_method,
         platform_transaction_id, platform_order_id, platform_subscription_id, metadata, description)
      VALUES
        (${USER_ID}, ${SUBSCRIPTION_ID}, ${AMOUNT}, 'ZAR', 'completed', 'paystack', 'card',
         ${REFERENCE}, ${REFERENCE}, ${PLAN_CODE}, ${metadata}::jsonb, 'Premium Monthly subscription')
      ON CONFLICT (platform, platform_transaction_id) DO NOTHING
      RETURNING id
    ),
    sub_upd AS (
      UPDATE user_subscriptions us
      SET status='active',
          next_billing_date = ${NEXT_BILLING}::timestamp,
          last_payment_date = ${PAYMENT_TIME}::timestamp,
          total_paid = COALESCE(us.total_paid, 0) + ${AMOUNT},
          paystack_reference = ${REFERENCE},
          cancelled_at = NULL,
          updated_at = now()
      FROM ins
      WHERE us.id = ${SUBSCRIPTION_ID}
      RETURNING us.id
    ),
    user_upd AS (
      UPDATE users u
      SET subscription_tier='monthly',
          subscription_expires_at = ${NEXT_BILLING}::timestamp,
          updated_at = now()
      FROM ins
      WHERE u.id = ${USER_ID}
      RETURNING u.id
    )
    SELECT (SELECT id FROM ins) AS payment_id,
           (SELECT id FROM sub_upd) AS sub_updated,
           (SELECT id FROM user_upd) AS user_updated
  `);

  const row = (result as any).rows?.[0] ?? {};
  if (row.payment_id) {
    console.log(`[reconcile-140] Applied: payment_id=${row.payment_id}, subscription ${row.sub_updated} reactivated, user ${row.user_updated} updated.`);
  } else {
    console.log("[reconcile-140] No-op: payment already recorded, nothing to do.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[reconcile-140] Failed:", err);
    process.exit(1);
  });
