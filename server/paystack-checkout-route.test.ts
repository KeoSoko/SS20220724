import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const index = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const paystackClient = readFileSync(
  new URL("../client/src/components/paystack-billing.tsx", import.meta.url),
  "utf8",
);

function routeSource(startMarker: string, nextMarker: string): string {
  const start = routes.indexOf(startMarker);
  const end = routes.indexOf(nextMarker, start + startMarker.length);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return routes.slice(start, end);
}

describe("Paystack route safety invariants", () => {
  it("forces browser activation through a matching server-owned attempt", () => {
    const source = routeSource(
      'app.post("/api/billing/paystack/subscription"',
      'app.post("/api/billing/paystack/verify"',
    );
    expect(source).toContain("resolveBillingOwner(userId)");
    expect(source).toContain("workspace_member_billing_restricted");
    expect(source).toContain("getPaystackCheckoutAttempt(reference)");
    expect(source).toContain("untracked_checkout_reference");
    expect(source).toContain("checkout_reference_cancelled");
    expect(source).not.toContain("checkoutAttempt?.billingOwnerUserId ?? userId");
    expect(routes).toContain("untracked_paystack_charge_rejected");
  });

  it("shares the renewal entitlement lock and fails closed on recovery overlap", () => {
    const billingService = readFileSync(
      new URL("./billing-service.ts", import.meta.url),
      "utf8",
    );
    const checkoutStart = billingService.indexOf("async createOrReusePaystackCheckoutAttempt");
    const checkoutEnd = billingService.indexOf("async getPaystackCheckoutAttempt", checkoutStart);
    const checkoutSource = billingService.slice(checkoutStart, checkoutEnd);
    expect(checkoutSource).toContain("pg_advisory_xact_lock(${input.billingOwnerUserId}, 36)");
    expect(checkoutSource).toContain('"paused", "payment_failed", "past_due"');
    expect(billingService).toContain("cancelOtherPendingCheckoutAttempts");
    expect(billingService).toContain("validateTrackedCheckoutTerms");
    expect(billingService).toContain("validateCurrentTrackedCheckoutAttempt");
    expect(billingService).toContain('source: "server_checkout_attempt"');
    expect(billingService).toContain('currentAttempt.status !== "pending"');
    expect(billingService).toContain('.for("update")');
    expect(billingService).toContain("paystack_successful_payment_requires_review");
    expect(routes).toContain("refreshPaystackCheckoutAttemptAfterVerification");
    expect(routes).not.toContain("expirePaystackCheckoutAttemptAfterVerification");
  });

  it("opens a recovery checkout only after a deliberate, provider-checked request", () => {
    const checkout = routeSource(
      'app.post("/api/billing/paystack/checkout"',
      'app.post("/api/billing/paystack/subscription"',
    );
    const billingService = readFileSync(
      new URL("./billing-service.ts", import.meta.url),
      "utf8",
    );

    expect(checkout).toContain("renewalRecoveryRequested");
    expect(checkout).toContain("recoverPaystackRenewalRelationship");
    expect(checkout).toContain("allowRenewalSetupRecovery: renewalRecoveryRequested");
    expect(checkout).toContain("renewal_recovery_manual_review");
    expect(billingService).toContain('outcome: "no_verified_relationship"');
    expect(billingService).toContain("multiple_plausible_paystack_subscriptions");
    expect(billingService).toContain("provider_subscription_customer_or_plan_mismatch");
    expect(billingService).toContain("renewal_setup_recovery_required");
  });

  it("keeps hosted payment management owner-scoped and separate from checkout", () => {
    const management = routeSource(
      'app.post("/api/billing/paystack/subscription/manage-link"',
      'app.post("/api/billing/paystack/verify"',
    );
    const billingService = readFileSync(
      new URL("./billing-service.ts", import.meta.url),
      "utf8",
    );
    expect(management).toContain("resolveBillingOwner(requestedByUserId)");
    expect(management).toContain("workspace_member_billing_restricted");
    expect(management).toContain("isPaystackSubscriptionManagementLinkEnabled()");
    expect(management).toContain("paystack_management_link_disabled");
    expect(management).toContain("createPaystackSubscriptionManagementLink");
    expect(management).not.toContain("createOrReusePaystackCheckoutAttempt");
    const methodStart = billingService.indexOf("async createPaystackSubscriptionManagementLink");
    const methodEnd = billingService.indexOf("async resolvePaystackSubscriptionIdentity", methodStart);
    const method = billingService.slice(methodStart, methodEnd);
    expect(method).toContain("pg_advisory_xact_lock(${userId}, 36)");
    expect(method).toContain("/manage/link");
    expect(method).not.toContain("subscription.create");
    expect(method).not.toContain("transaction.charge");
  });

  it("keeps reconciliation observational and unable to create a historical collection", () => {
    const billingService = readFileSync(
      new URL("./billing-service.ts", import.meta.url),
      "utf8",
    );
    const reconciliationStart = billingService.indexOf("async reconcilePaystackSubscriptionForUser");
    const reconciliationEnd = billingService.indexOf("async hasActiveSubscription", reconciliationStart);
    const reconciliation = billingService.slice(reconciliationStart, reconciliationEnd);

    expect(reconciliation).toContain('source: "reconciliation"');
    expect(reconciliation).not.toContain("transaction.charge");
    expect(reconciliation).not.toContain("subscription.create");
    expect(reconciliation).not.toContain("createOrReusePaystackCheckoutAttempt");
    expect(reconciliation).not.toContain("missedMonths");
    expect(reconciliation).not.toContain("* 3");
  });

  it("never trusts recurring-looking metadata for an untracked charge", () => {
    const renewal = readFileSync(
      new URL("./paystack-renewal.ts", import.meta.url),
      "utf8",
    );
    const billingService = readFileSync(
      new URL("./billing-service.ts", import.meta.url),
      "utf8",
    );
    expect(renewal).not.toContain("metadata?.invoice_action");
    expect(routes).toContain("extractPaystackRenewalEvidence(data)");
    expect(routes).toContain("getPaystackSubscriptionIdentityByCode");
    expect(routes).toContain("validateActivePaystackRenewalRelationship");
    expect(billingService).not.toContain("isPaystackRecurringInvoiceTransaction");
  });

  it("rejects stale lifecycle events before they can cancel a newer subscription", () => {
    const billingService = readFileSync(
      new URL("./billing-service.ts", import.meta.url),
      "utf8",
    );
    expect(routes).toContain("resolveActivePaystackLifecycleUser");
    const disableSource = routeSource(
      "async function handlePaystackSubscriptionDisable",
      "async function handlePaystackSubscriptionNotRenew",
    );
    const notRenewSource = routeSource(
      "async function handlePaystackSubscriptionNotRenew",
      "async function handlePaystackPaymentFailed",
    );
    expect(disableSource).toContain("resolveActivePaystackLifecycleUser");
    expect(notRenewSource).toContain("resolveActivePaystackLifecycleUser");
    expect(disableSource).not.toContain("resolvePaystackUser");
    expect(notRenewSource).not.toContain("resolvePaystackUser");
    const cancelStart = billingService.indexOf("async cancelSubscription(");
    const cancelEnd = billingService.indexOf("async markSubscriptionNotRenewing(", cancelStart);
    const notRenewEnd = billingService.indexOf("/**", cancelEnd);
    const lifecycleMutationSource = billingService.slice(cancelStart, notRenewEnd);
    expect(lifecycleMutationSource).toContain("pg_advisory_xact_lock(${userId}, 36)");
    expect(lifecycleMutationSource).toContain("validatePaystackLifecycleIdentityInTransaction");
    expect(billingService).toContain("paystack_lifecycle_event_rejected");
  });

  it("does not let an unsolicited subscription.create establish active trust", () => {
    const billingService = readFileSync(
      new URL("./billing-service.ts", import.meta.url),
      "utf8",
    );
    const createHandler = routeSource(
      "async function handlePaystackSubscriptionCreate",
      "async function resolvePaystackUser",
    );
    expect(createHandler).toContain("recordPaystackSubscriptionIdentity(");
    expect(createHandler).not.toContain("allowNewActive");
    expect(billingService).toContain('(options.allowNewActive ? "active" : "unresolved")');
  });

  it("passes every browser session the one server-generated Paystack reference", () => {
    expect(paystackClient).toContain("ref: checkout.reference");
    expect(paystackClient).not.toContain("Date.now()");
    expect(paystackClient).not.toContain("randomUUID");
  });

  it("returns a controlled temporary-unavailable result before checkout, settlement, or provider verification", () => {
    const checkout = routeSource(
      'app.post("/api/billing/paystack/checkout"',
      'app.post("/api/billing/paystack/subscription"',
    );
    const settlement = routeSource(
      'app.post("/api/billing/paystack/subscription"',
      'app.post("/api/billing/paystack/verify"',
    );
    const verification = routeSource(
      'app.post("/api/billing/paystack/verify"',
      'app.post("/api/billing/paystack/webhook"',
    );

    expect(routes).toContain('code: "billing_temporarily_unavailable"');
    expect(checkout.indexOf('requirePaystackBillingSchemaForRequest')).toBeLessThan(
      checkout.indexOf("createOrReusePaystackCheckoutAttempt"),
    );
    expect(settlement.indexOf('requirePaystackBillingSchemaForRequest')).toBeLessThan(
      settlement.indexOf("verifyPaystackTransaction(reference)"),
    );
    expect(verification.indexOf('requirePaystackBillingSchemaForRequest')).toBeLessThan(
      verification.indexOf("verifyPaystackTransaction(reference)"),
    );
  });

  it("durably defers signed provider events while the required schema is unavailable", () => {
    const webhook = routeSource(
      'app.post("/api/billing/paystack/webhook"',
      'app.post("/api/billing/verify-subscription"',
    );

    expect(webhook).toContain("deferPaystackWebhookForSchema");
    expect(webhook).toContain("paystack_event_deferred_schema_unavailable");
    expect(webhook).toContain('retryAction: "replay_after_billing_schema_ready"');
    expect(webhook.indexOf("deferPaystackWebhookForSchema")).toBeLessThan(
      webhook.indexOf("setImmediate"),
    );
  });

  it("replays deferred signed events only after readiness recovers and marks them complete afterward", () => {
    const replay = routeSource(
      "async function replayDeferredPaystackWebhooks",
      "function startDeferredPaystackWebhookReplay",
    );

    expect(replay).toContain('eventType, "paystack_event_deferred_schema_unavailable"');
    expect(replay).toContain('.for("update", { skipLocked: true })');
    expect(replay.indexOf("await dispatchPaystackWebhookEvent")).toBeLessThan(
      replay.indexOf("set({ processed: true, processingError: null })"),
    );
    expect(routes).toContain("startDeferredPaystackWebhookReplay();");
  });

  it("does not let a poison deferred event starve later events", () => {
    const replay = routeSource(
      "async function replayDeferredPaystackWebhooks",
      "function scheduleDeferredPaystackWebhookReplay",
    );

    expect(routes).toContain('const deferredReplayRetryPrefix = "deferred_replay_retry"');
    expect(replay).toContain("deferredReplayRetryPrefix");
    expect(replay).toContain("deferred_replay_invalid_envelope_manual_review");
    expect(replay).toContain('if (outcome === "empty") break;');
    expect(replay).toContain("split_part");
  });

  it("captures and verifies the exact raw webhook body", () => {
    expect(index).toContain("rawBody = Buffer.from(body)");
    const source = routeSource(
      'app.post("/api/billing/paystack/webhook"',
      'app.post("/api/billing/verify-subscription"',
    );
    expect(source).toContain(".update(rawBody)");
    expect(source).toContain("crypto.timingSafeEqual");
  });

  it("uses canonical ownership for subscription-page workspace context", () => {
    const source = routeSource(
      'app.get("/api/subscription/status"',
      "// ===== RECEIPT ENDPOINTS =====",
    );
    expect(source).toContain("resolveBillingOwner(userId)");
    expect(source).toContain('billingOwner.relationship === "workspace_member"');
  });
});