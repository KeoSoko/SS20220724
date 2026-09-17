import { pool } from "./db";
import { resolveBillingOwner } from "./billing-owner";
import { requirePaystackBillingSchema } from "./paystack-billing-schema";
import { createCatchupService, sameCatchupState, type CatchupInput, type CatchupIntent, type CatchupLocal, type CatchupProvider } from "./paystack-catchup";

const attemptType = "admin_paystack_catchup_attempt";
export const catchupEnabledFor = (userId: number) =>
  process.env.PAYSTACK_ADMIN_CATCHUP_ENABLED === "true"
  && (process.env.PAYSTACK_ADMIN_CATCHUP_USER_IDS ?? "").split(",").map(value => value.trim()).includes(String(userId));

async function readLocal(database: any, input: CatchupInput): Promise<CatchupLocal> {
  const result = await database.query(`
    SELECT s.*, p.price, p.currency, p.billing_period, p.paystack_plan_code,
      u.is_active, u.subscription_expires_at, i.subscription_code, i.customer_code, i.plan_code,
      (SELECT COUNT(*)::int FROM paystack_subscription_identities WHERE user_id=s.user_id AND status='active') AS identity_count,
      EXISTS(SELECT 1 FROM paystack_checkout_attempts WHERE billing_owner_user_id=s.user_id AND status='pending' AND expires_at>NOW()) AS pending_checkout,
      EXISTS(SELECT 1 FROM paystack_cancellation_attempts WHERE billing_owner_user_id=s.user_id) AS cancellation,
      EXISTS(SELECT 1 FROM payment_transactions WHERE subscription_id=s.id AND platform='paystack' AND status='completed'
        AND amount=4900 AND created_at>=s.next_billing_date) AS period_payment
    FROM user_subscriptions s JOIN users u ON u.id=s.user_id
    JOIN subscription_plans p ON p.id=s.plan_id
    LEFT JOIN paystack_subscription_identities i ON i.user_id=s.user_id AND i.status='active'
    WHERE s.id=$1 AND s.user_id=$2`, [input.subscriptionId, input.userId]);
  if (result.rows.length !== 1) throw new Error("canonical_subscription_missing_or_ambiguous");
  const row = result.rows[0];
  if (!row.next_billing_date) throw new Error("billing_period_missing");
  return {
    userId: row.user_id, subscriptionId: row.id, customerCode: row.paystack_customer_code,
    subscriptionCode: row.subscription_code, planCode: row.paystack_plan_code,
    amount: row.price, currency: row.currency, status: row.status,
    periodStart: new Date(row.next_billing_date).toISOString(), activeIdentityCount: row.identity_count,
    entitlementExpiresAt: row.subscription_expires_at ? new Date(row.subscription_expires_at).toISOString() : null,
    blocked: !row.is_active || row.billing_period !== "monthly" || row.pending_checkout || row.cancellation
      || row.period_payment || !!row.cancelled_at || !!row.cancellation_requested_at
      || row.customer_code !== row.paystack_customer_code || row.plan_code !== row.paystack_plan_code,
  };
}

async function ownerTransaction<T>(userId: number, callback: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1, 36)", [userId]);
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

function providerWithStoredCredential(): { provider: CatchupProvider; signingKey: string } {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key || !/^sk_(live|test)_/.test(key)) throw new Error("paystack_credential_unavailable");
  const mode = key.startsWith("sk_live_") ? "live" : "test";
  if (process.env.NODE_ENV === "production" && mode !== "live") throw new Error("production_live_credential_required");
  const request = async (path: string, body?: Record<string, unknown>) => {
    const response = await fetch(`https://api.paystack.co${path}`, {
      method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json().catch(() => null);
    return { response, data };
  };
  return { signingKey: key, provider: {
    mode,
    async subscription(code) {
      const { response, data } = await request(`/subscription/${encodeURIComponent(code)}`);
      if (!response.ok || data?.status !== true || !data.data) throw new Error("provider_subscription_unavailable");
      return data.data;
    },
    async verify(reference) {
      const { response, data } = await request(`/transaction/verify/${encodeURIComponent(reference)}`);
      if (response.ok && data?.status === true && data.data) return { kind: "present", data: data.data };
      // Never interpret timeouts, auth errors, rate limits, invalid JSON, or
      // arbitrary provider failures as proof that a reference does not exist.
      if ([400, 404].includes(response.status) && data?.status === false
        && ["Transaction reference not found", "Transaction not found"].includes(data.message)) return { kind: "absent" };
      throw new Error("provider_reference_verification_unavailable");
    },
    async successfulPayments(customerId, since) {
      const query = new URLSearchParams({ customer: String(customerId), status: "success", from: since, perPage: "100", page: "1" });
      const { response, data } = await request(`/transaction?${query}`);
      if (!response.ok || data?.status !== true || !Array.isArray(data.data)
        || !Number.isInteger(data.meta?.total) || data.meta.total > 100 || data.meta.total !== data.data.length) {
        throw new Error("provider_payment_history_incomplete");
      }
      return data.data;
    },
    async charge(body) {
      const { response, data } = await request("/transaction/charge_authorization", body);
      if (!response.ok || data?.status !== true) throw new Error("charge_response_unconfirmed");
      // A success HTTP response is NOT proof of payment. The service always
      // independently verifies the stable reference before granting access.
    },
  } };
}

export async function catchupRuntime(input: CatchupInput) {
  if (!catchupEnabledFor(input.userId)) throw new Error("catchup_feature_disabled");
  await requirePaystackBillingSchema();
  const owner = await resolveBillingOwner(input.userId);
  if (owner.state !== "resolved" || owner.billingOwnerUserId !== input.userId || !owner.canManageBilling) {
    throw new Error("billing_owner_unresolved");
  }
  const { provider, signingKey } = providerWithStoredCredential();
  return createCatchupService({
    load: value => readLocal(pool, value),
    async attempt(reference) {
      const result = await pool.query("SELECT event_data FROM billing_events WHERE event_type=$1 AND event_data->>'reference'=$2", [attemptType, reference]);
      if (result.rows.length > 1) throw new Error("attempt_ambiguous");
      return result.rows[0]?.event_data?.intent ?? null;
    },
    async claim(intent, adminId) {
      return ownerTransaction(intent.userId, async client => {
        const previous = await client.query("SELECT id FROM billing_events WHERE user_id=$1 AND event_type=$2 AND (processed=false OR event_data->>'reference'=$3)", [intent.userId, attemptType, intent.reference]);
        if (previous.rows.length) return false;
        const fresh = await readLocal(client, input);
        const { invoiceCode, reference, periodEnd, authorizationHash, emailHash, mode, ...approvedLocal } = intent;
        if (!sameCatchupState(fresh, approvedLocal)) throw new Error("local_state_changed_before_claim");
        await client.query("INSERT INTO billing_events(user_id,event_type,event_data,processed) VALUES($1,$2,$3,false)",
          [intent.userId, attemptType, JSON.stringify({ reference: intent.reference, intent, adminId })]);
        return true;
      });
    },
    async settle(intent: CatchupIntent, payment, adminId) {
      return ownerTransaction(intent.userId, async client => {
        const prior = await client.query("SELECT user_id,subscription_id,amount,currency FROM payment_transactions WHERE platform='paystack' AND platform_transaction_id=$1", [intent.reference]);
        const audit = await client.query("SELECT id,processed,event_data FROM billing_events WHERE user_id=$1 AND event_type=$2 AND event_data->>'reference'=$3 FOR UPDATE", [intent.userId, attemptType, intent.reference]);
        if (audit.rows.length !== 1 || !sameCatchupState(audit.rows[0].event_data.intent, intent)) return false;
        if (prior.rows.length) {
          const row = prior.rows[0];
          return audit.rows[0].processed === true && row.user_id === intent.userId && row.subscription_id === intent.subscriptionId
            && row.amount === intent.amount && row.currency === intent.currency;
        }
        const fresh = await readLocal(client, input);
        const { invoiceCode, reference, periodEnd, authorizationHash, emailHash, mode, ...approvedLocal } = intent;
        if (!sameCatchupState(fresh, approvedLocal) || Date.parse(intent.periodEnd) <= Date.now()) return false;
        const inserted = await client.query(`INSERT INTO payment_transactions
          (user_id,subscription_id,amount,currency,status,platform,payment_method,platform_transaction_id,platform_subscription_id,
           provider_transaction_id,provider_verified_at,metadata,description)
          VALUES($1,$2,$3,$4,'completed','paystack','admin_catchup',$5,$6,$7,NOW(),$8,'Verified renewal catch-up payment')
          ON CONFLICT DO NOTHING RETURNING id`, [intent.userId,intent.subscriptionId,intent.amount,intent.currency,intent.reference,
            intent.subscriptionCode,String(payment.id),JSON.stringify({ invoiceCode: intent.invoiceCode, periodEnd: intent.periodEnd, adminId })]);
        if (inserted.rows.length !== 1) return false;
        await client.query(`UPDATE user_subscriptions SET status='active',next_billing_date=$1,
          total_paid=COALESCE(total_paid,0)+$2,last_payment_date=$3,paystack_reference=$4,updated_at=NOW()
          WHERE id=$5 AND user_id=$6`, [intent.periodEnd,intent.amount,payment.paid_at ?? payment.paidAt,intent.reference,intent.subscriptionId,intent.userId]);
        await client.query("UPDATE users SET subscription_tier='monthly',subscription_expires_at=$1,updated_at=NOW() WHERE id=$2", [intent.periodEnd,intent.userId]);
        await client.query("UPDATE billing_events SET processed=true WHERE id=$1", [audit.rows[0].id]);
        await client.query("INSERT INTO billing_events(user_id,event_type,event_data,processed) VALUES($1,'admin_paystack_catchup_settled',$2,true)",
          [intent.userId,JSON.stringify({ reference:intent.reference,invoiceCode:intent.invoiceCode,amount:intent.amount,periodEnd:intent.periodEnd,adminId })]);
        return true;
      });
    },
  }, provider, signingKey);
}
