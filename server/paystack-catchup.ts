import crypto from "node:crypto";

export interface CatchupInput { userId: number; subscriptionId: number; invoiceCode: string }
export interface CatchupLocal {
  userId: number; subscriptionId: number; customerCode: string; subscriptionCode: string;
  planCode: string; amount: number; currency: string; status: string;
  periodStart: string; activeIdentityCount: number; blocked: boolean;
  entitlementExpiresAt: string | null;
}
export interface CatchupIntent extends CatchupLocal {
  invoiceCode: string; reference: string; periodEnd: string; authorizationHash: string;
  emailHash: string; mode: string;
}
export interface CatchupRepository {
  load(input: CatchupInput): Promise<CatchupLocal>;
  attempt(reference: string): Promise<CatchupIntent | null>;
  // Must commit this claim BEFORE contacting the charge API. Concurrent claims
  // and all claims for the same owner are serialized with the billing lock.
  claim(intent: CatchupIntent, adminId: number): Promise<boolean>;
  settle(intent: CatchupIntent, payment: any, adminId: number): Promise<boolean>;
}
export interface CatchupProvider {
  mode: "live" | "test";
  subscription(code: string): Promise<any>;
  verify(reference: string): Promise<{ kind: "absent" } | { kind: "present"; data: any }>;
  successfulPayments(customerId: number, since: string): Promise<any[]>;
  charge(body: Record<string, unknown>): Promise<void>;
}
const hash = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
export const sameCatchupState = (left: object, right: object) =>
  JSON.stringify(Object.entries(left).sort(([a], [b]) => a.localeCompare(b)))
    === JSON.stringify(Object.entries(right).sort(([a], [b]) => a.localeCompare(b)));
export const catchupReference = (invoice: string) => `ss-catchup-${hash(invoice).slice(0, 40)}`;
export const isCatchupReference = (reference: unknown): reference is string =>
  typeof reference === "string" && /^ss-catchup-[a-f0-9]{40}$/.test(reference);

function requireGuard(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new Error(reason);
}

export function createCatchupService(
  repository: CatchupRepository, provider: CatchupProvider, signingKey: string,
  now: () => number = Date.now,
) {
  const sign = (payload: string) => crypto.createHmac("sha256", signingKey).update(payload).digest("hex");
  const token = (intent: CatchupIntent) => {
    const payload = Buffer.from(JSON.stringify({ intent, expiresAt: now() + 5 * 60_000 })).toString("base64url");
    return `${payload}.${sign(payload)}`;
  };
  const decode = (value: string): CatchupIntent => {
    const parts = value.split(".");
    requireGuard(parts.length === 2 && /^[a-f0-9]{64}$/.test(parts[1]), "invalid_confirmation");
    requireGuard(crypto.timingSafeEqual(Buffer.from(parts[1], "hex"), Buffer.from(sign(parts[0]), "hex")), "invalid_confirmation");
    const body = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    requireGuard(body.expiresAt > now(), "preview_expired");
    return body.intent;
  };
  const assess = async (input: CatchupInput) => {
    const local = await repository.load(input);
    requireGuard(local.userId === input.userId && local.subscriptionId === input.subscriptionId, "local_owner_mismatch");
    requireGuard(local.status === "paused" && !local.blocked && local.activeIdentityCount === 1, "local_state_not_chargeable");
    // Initially deliberately restricted to one monthly R49 renewal. No arbitrary
    // admin amount, upgrades, yearly plans, or multiple overdue periods.
    requireGuard(local.amount === 4900 && local.currency === "ZAR", "unsupported_amount_or_currency");
    const subscription = await provider.subscription(local.subscriptionCode);
    const invoice = subscription?.most_recent_invoice;
    const authorization = subscription?.authorization;
    requireGuard(subscription?.domain === provider.mode, "provider_mode_mismatch");
    requireGuard(subscription?.subscription_code === local.subscriptionCode
      && subscription?.customer?.customer_code === local.customerCode
      && subscription?.plan?.plan_code === local.planCode
      && subscription?.plan?.interval === "monthly"
      && subscription?.plan?.currency === "ZAR"
      && subscription?.amount === local.amount
      && subscription?.status === "attention", "provider_relationship_mismatch");
    requireGuard(invoice?.invoice_code === input.invoiceCode && (invoice?.paid === 0 || invoice?.paid === false)
      && !invoice?.paid_at && invoice?.domain === provider.mode
      && invoice?.customer === subscription?.customer?.id && invoice?.subscription === subscription?.id
      && Number.isInteger(subscription?.id)
      && invoice?.status === "failed" && invoice?.amount === local.amount, "invoice_not_unpaid_failed_renewal");
    const start = Date.parse(local.periodStart);
    const end = Date.parse(subscription.next_payment_date);
    const invoiceStart = Date.parse(invoice.period_start);
    const invoiceEnd = Date.parse(invoice.period_end);
    requireGuard(Number.isFinite(start) && Number.isFinite(end) && end > now()
      && start <= now() && end - start >= 27 * 86_400_000 && end - start <= 32 * 86_400_000
      && Math.abs(invoiceStart - start) <= 86_400_000
      && Math.abs(invoiceEnd - end) <= 86_400_000, "billing_period_unverified");
    requireGuard(!local.entitlementExpiresAt || (Number.isFinite(Date.parse(local.entitlementExpiresAt))
      && Date.parse(local.entitlementExpiresAt) <= end), "existing_longer_entitlement_requires_review");
    requireGuard(authorization?.reusable === true && authorization?.channel === "card"
      && /^AUTH_[A-Za-z0-9]+$/.test(authorization.authorization_code), "updated_authorization_not_reusable");
    const email = subscription?.customer?.email;
    requireGuard(typeof email === "string" && email.includes("@")
      && Number.isInteger(subscription.customer.id), "provider_customer_incomplete");
    const reference = catchupReference(input.invoiceCode);
    const verified = await provider.verify(reference);
    requireGuard(verified.kind === "absent", "reference_already_exists");
    const payments = await provider.successfulPayments(subscription.customer.id, local.periodStart);
    // Any same-value successful payment in this period requires review, even if
    // another operator used a different reference. R1 tokenization is excluded.
    requireGuard(!payments.some(payment => payment.amount === local.amount && payment.currency === "ZAR"), "possible_existing_period_payment");
    const intent: CatchupIntent = {
      ...local, invoiceCode: input.invoiceCode, reference,
      periodEnd: new Date(end).toISOString(), authorizationHash: hash(authorization.authorization_code),
      emailHash: hash(email), mode: provider.mode,
    };
    return { intent, authorizationCode: authorization.authorization_code as string, email };
  };
  const reconcile = async (intent: CatchupIntent, adminId: number) => {
    const result = await provider.verify(intent.reference);
    if (result.kind === "absent") return { outcome: "charge_result_unknown", reference: intent.reference };
    const payment = result.data;
    if (payment.status !== "success") return { outcome: "payment_not_successful", reference: intent.reference };
    const metadata = typeof payment.metadata === "string" ? JSON.parse(payment.metadata || "{}") : payment.metadata;
    requireGuard(payment.reference === intent.reference && payment.amount === intent.amount
      && payment.currency === intent.currency && payment.domain === intent.mode
      && payment.customer?.customer_code === intent.customerCode
      && hash(payment.authorization?.authorization_code ?? "") === intent.authorizationHash
      && metadata?.catchupInvoice === intent.invoiceCode
      && metadata?.catchupSubscription === intent.subscriptionCode
      && String(metadata?.catchupUser) === String(intent.userId)
      && payment.id && Number.isFinite(Date.parse(payment.paid_at ?? payment.paidAt))
      && Date.parse(payment.paid_at ?? payment.paidAt) >= Date.parse(intent.periodStart)
      && Date.parse(payment.paid_at ?? payment.paidAt) < Date.parse(intent.periodEnd), "verified_payment_mismatch");
    const current = await provider.subscription(intent.subscriptionCode);
    requireGuard(current?.domain === intent.mode && current?.subscription_code === intent.subscriptionCode
      && current?.customer?.customer_code === intent.customerCode && current?.plan?.plan_code === intent.planCode
      && ["active", "attention"].includes(current?.status)
      && Date.parse(current?.next_payment_date) === Date.parse(intent.periodEnd), "provider_state_changed_before_settlement");
    const settled = await repository.settle(intent, payment, adminId);
    return { outcome: settled ? "payment_and_access_applied" : "payment_received_settlement_review_required", reference: intent.reference };
  };
  return {
    async preview(input: CatchupInput) {
      const reference = catchupReference(input.invoiceCode);
      const prior = await repository.attempt(reference);
      const intent = prior ?? (await assess(input)).intent;
      requireGuard(intent.userId === input.userId && intent.subscriptionId === input.subscriptionId
        && intent.invoiceCode === input.invoiceCode && intent.mode === provider.mode, "attempt_owner_mismatch");
      return { outcome: prior ? "verify_previous_attempt_only" : "ready_for_confirmation",
        amount: intent.amount, currency: intent.currency, reference, invoiceCode: intent.invoiceCode,
        userId: intent.userId, subscriptionId: intent.subscriptionId,
        periodEnd: intent.periodEnd, recurringSubscriptionMutation: "none",
        confirmationToken: token(intent) };
    },
    async execute(input: CatchupInput, confirmationToken: string, confirmed: boolean, adminId: number) {
      requireGuard(confirmed === true, "explicit_confirmation_required");
      const approved = decode(confirmationToken);
      requireGuard(approved.userId === input.userId && approved.subscriptionId === input.subscriptionId
        && approved.invoiceCode === input.invoiceCode && approved.mode === provider.mode, "confirmation_owner_mismatch");
      const prior = await repository.attempt(approved.reference);
      if (prior) {
        requireGuard(sameCatchupState(prior, approved), "attempt_changed");
        return reconcile(prior, adminId); // NEVER charge a second time.
      }
      const fresh = await assess(input);
      requireGuard(sameCatchupState(fresh.intent, approved), "preview_changed");
      if (!await repository.claim(fresh.intent, adminId)) return { outcome: "attempt_already_claimed", reference: approved.reference };
      try {
        await provider.charge({ email: fresh.email, amount: approved.amount, currency: approved.currency,
          authorization_code: fresh.authorizationCode, reference: approved.reference,
          metadata: { catchupInvoice: approved.invoiceCode, catchupSubscription: approved.subscriptionCode,
            catchupUser: approved.userId } }); // Intentionally NO plan parameter.
      } catch { /* Ambiguous/failed charge: verify, never retry. */ }
      return reconcile(approved, adminId);
    },
  };
}
