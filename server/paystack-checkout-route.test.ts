import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const index = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

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
    expect(billingService).toContain('source: "server_checkout_attempt"');
    expect(billingService).toContain('["cancelled", "failed", "expired"]');
    expect(routes).toContain("refreshPaystackCheckoutAttemptAfterVerification");
    expect(routes).not.toContain("expirePaystackCheckoutAttemptAfterVerification");
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