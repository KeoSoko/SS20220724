/**
 * Read-only support report for legacy Paystack recurring relationships.
 *
 * This intentionally reports unknown provider facts as "unknown". It neither
 * calls Paystack nor changes subscriptions, identities, payment history, or
 * entitlement. Run against the intended database connection only.
 */
import { sql } from "drizzle-orm";
import { db } from "../server/db";

type ReportRow = {
  billingOwnerUserId: number;
  planName: string | null;
  subscriptionStatus: string;
  nextBillingDate: Date | null;
  paystackCustomerCode: string | null;
  activeLocalIdentityCount: number;
  successfulPaystackReferences: string[];
  storedAuthorizationCode: string | null;
  renewalSignals: string[];
  providerEvidence: {
    channel: "known" | "unknown";
    authorizationReusable: "known" | "unknown";
    subscriptionCount: "known" | "unknown";
    invoiceRelationship: "known" | "unknown";
  };
};

async function run(): Promise<void> {
  const result = await db.execute(sql`
    SELECT
      subscriptions.user_id AS "billingOwnerUserId",
      plans.display_name AS "planName",
      subscriptions.status AS "subscriptionStatus",
      subscriptions.next_billing_date AS "nextBillingDate",
      subscriptions.paystack_customer_code AS "paystackCustomerCode",
      subscriptions.authorization_code AS "storedAuthorizationCode",
      (
        SELECT COUNT(*)::int
        FROM paystack_subscription_identities identities
        WHERE identities.user_id = subscriptions.user_id
          AND identities.status = 'active'
      ) AS "activeLocalIdentityCount",
      COALESCE((
        SELECT array_agg(DISTINCT payments.platform_transaction_id)
        FROM payment_transactions payments
        WHERE payments.user_id = subscriptions.user_id
          AND payments.platform = 'paystack'
          AND payments.status = 'completed'
          AND payments.platform_transaction_id IS NOT NULL
      ), ARRAY[]::text[]) AS "successfulPaystackReferences",
      COALESCE((
        SELECT array_agg(DISTINCT events.event_type)
        FROM billing_events events
        WHERE events.user_id = subscriptions.user_id
          AND events.event_type IN (
            'invoice_payment_failed',
            'paystack_invoice_updated',
            'renewal_reconciliation_unresolved',
            'renewal_reconciliation_pending',
            'renewal_setup_recovery_required',
            'renewal_recovery_manual_review'
          )
      ), ARRAY[]::text[]) AS "renewalSignals"
    FROM user_subscriptions subscriptions
    LEFT JOIN subscription_plans plans ON plans.id = subscriptions.plan_id
    WHERE subscriptions.paystack_customer_code IS NOT NULL
    ORDER BY subscriptions.user_id ASC
  `);

  const rows = result.rows.map((row: any): ReportRow => ({
    billingOwnerUserId: Number(row.billingOwnerUserId),
    planName: row.planName ?? null,
    subscriptionStatus: row.subscriptionStatus,
    nextBillingDate: row.nextBillingDate ?? null,
    paystackCustomerCode: row.paystackCustomerCode ?? null,
    activeLocalIdentityCount: Number(row.activeLocalIdentityCount ?? 0),
    successfulPaystackReferences: row.successfulPaystackReferences ?? [],
    storedAuthorizationCode: row.storedAuthorizationCode ?? null,
    renewalSignals: row.renewalSignals ?? [],
    providerEvidence: {
      // Local historical records cannot reliably prove these values. This
      // report refuses to infer Card, Apple Pay, provider counts, or invoices.
      channel: "unknown",
      authorizationReusable: "unknown",
      subscriptionCount: "unknown",
      invoiceRelationship: "unknown",
    },
  }));

  console.log(JSON.stringify({
    readOnly: true,
    generatedAt: new Date().toISOString(),
    candidates: rows,
  }, null, 2));
}

run().catch((error) => {
  console.error("Recurring-readiness diagnostic failed:", error);
  process.exitCode = 1;
});