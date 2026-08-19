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