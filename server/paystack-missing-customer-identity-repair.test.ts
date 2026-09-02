import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const billingSource = readFileSync(new URL("./billing-service.ts", import.meta.url), "utf8");
const routesSource = readFileSync(new URL("./admin-routes.ts", import.meta.url), "utf8");

describe("missing Paystack customer identity repair boundary", () => {
  it("exposes separate admin-only preview and exact-preview execution routes", () => {
    expect(routesSource).toContain(
      'app.post("/api/admin/users/:userId/paystack-missing-customer-identity-repair/preview", requireAdmin',
    );
    expect(routesSource).toContain(
      'app.post("/api/admin/users/:userId/paystack-missing-customer-identity-repair/execute", requireAdmin',
    );
    expect(routesSource).toContain('req.body?.confirmed !== true');
    expect(routesSource).toContain('typeof req.body?.previewFingerprint !== "string"');
  });

  it("requires live exact subscription, customer, plan, email, and active-status evidence", () => {
    expect(billingSource).toContain("this.paystack.subscription.get(input.subscriptionCode)");
    expect(billingSource).toContain("this.paystack.customer.get(input.customerCode)");
    expect(billingSource).toContain("extractPaystackSubscriptionCode(providerSubscription) === input.subscriptionCode");
    expect(billingSource).toContain("extractPaystackCustomerCode(providerSubscription) === input.customerCode");
    expect(billingSource).toContain("extractPaystackPlanCode(providerSubscription) === input.planCode");
    expect(billingSource).toContain("providerEmail === localEmail");
    expect(billingSource).toContain('providerStatus === "active"');
  });

  it("only backfills an empty local customer code and records the trusted identity", () => {
    expect(billingSource).toContain(
      'or(isNull(userSubscriptions.paystackCustomerCode), eq(userSubscriptions.paystackCustomerCode, ""))',
    );
    expect(billingSource).toContain('eventType: "paystack_missing_customer_identity_reconciled"');
    expect(billingSource).toContain('providerMutation: "none"');
    expect(billingSource).toContain('paystackRequest: "read_only"');
  });

  it("declares billing, entitlement, payment, and checkout state unchanged", () => {
    for (const field of [
      "user_subscriptions.status",
      "user_subscriptions.plan_id",
      "user_subscriptions.subscription_start_date",
      "user_subscriptions.next_billing_date",
      "payment_transactions",
      "entitlements",
      "paystack_checkout_attempts",
    ]) {
      expect(billingSource).toContain(`\"${field}\"`);
    }
  });
});
