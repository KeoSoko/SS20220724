import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("./vite", () => ({ log: vi.fn() }));
vi.mock("./email-service", () => ({ emailService: null }));
vi.mock("./storage", () => ({ storage: {} }));

import {
  BillingService,
  isPaystackSubscriptionManagementLinkEnabled,
} from "./billing-service";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const subscriptionPage = readFileSync(
  new URL("../client/src/pages/subscription-page.tsx", import.meta.url),
  "utf8",
);
const originalManagementLinkFlag = process.env.PAYSTACK_SUBSCRIPTION_MANAGEMENT_LINK_ENABLED;

function restoreFlag() {
  if (originalManagementLinkFlag === undefined) {
    delete process.env.PAYSTACK_SUBSCRIPTION_MANAGEMENT_LINK_ENABLED;
  } else {
    process.env.PAYSTACK_SUBSCRIPTION_MANAGEMENT_LINK_ENABLED = originalManagementLinkFlag;
  }
}

afterEach(() => {
  restoreFlag();
});

async function renewalStatusWithNotReadyIdentity() {
  const service = new BillingService();
  (service as any).getUserSubscription = vi.fn().mockResolvedValue({
    status: "active",
    nextBillingDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    paystackReference: "reference",
  });
  (service as any).getPaystackBillingSchemaReadiness = vi.fn().mockResolvedValue({ ready: true });
  (service as any).getActivePaystackSubscriptionIdentity = vi.fn().mockResolvedValue({
    recurringReadiness: "not_ready",
  });
  return service.getPaystackRenewalStatus(42);
}

function managementRouteSource() {
  const start = routes.indexOf('app.post("/api/billing/paystack/subscription/manage-link"');
  const end = routes.indexOf('app.post("/api/billing/paystack/verify"', start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return routes.slice(start, end);
}

describe("Paystack management-link release gate", () => {
  it("defaults to disabled when the feature variable is missing", async () => {
    delete process.env.PAYSTACK_SUBSCRIPTION_MANAGEMENT_LINK_ENABLED;

    expect(isPaystackSubscriptionManagementLinkEnabled()).toBe(false);
    await expect(renewalStatusWithNotReadyIdentity()).resolves.toMatchObject({
      state: "payment_method_needs_attention",
      managementLinkEligible: false,
      recoveryCheckoutEligible: false,
    });
  });

  it("stays disabled when the feature variable is explicitly false", async () => {
    process.env.PAYSTACK_SUBSCRIPTION_MANAGEMENT_LINK_ENABLED = "false";

    expect(isPaystackSubscriptionManagementLinkEnabled()).toBe(false);
    await expect(renewalStatusWithNotReadyIdentity()).resolves.toMatchObject({
      state: "payment_method_needs_attention",
      managementLinkEligible: false,
    });
  });

  it("enables guarded management-link eligibility only for explicit true", async () => {
    process.env.PAYSTACK_SUBSCRIPTION_MANAGEMENT_LINK_ENABLED = "true";

    expect(isPaystackSubscriptionManagementLinkEnabled()).toBe(true);
    await expect(renewalStatusWithNotReadyIdentity()).resolves.toMatchObject({
      state: "payment_method_needs_attention",
      managementLinkEligible: true,
      recoveryCheckoutEligible: false,
    });
  });

  it("returns a controlled disabled response before provider or billing actions", () => {
    const management = managementRouteSource();
    const gateIndex = management.indexOf("isPaystackSubscriptionManagementLinkEnabled()");
    const providerIndex = management.indexOf("createPaystackSubscriptionManagementLink");

    expect(gateIndex).toBeGreaterThan(-1);
    expect(providerIndex).toBeGreaterThan(gateIndex);
    expect(management).toContain('status(503)');
    expect(management).toContain('"paystack_management_link_disabled"');
    expect(management).not.toContain("createOrReusePaystackCheckoutAttempt");
    expect(management).not.toContain("transaction.charge");
    expect(management).not.toContain("subscription.create");
    expect(management).not.toContain("subscription.disable");
    expect(management).not.toContain("cancelSubscription");
    expect(management).not.toContain("refund");
  });

  it("hides both management CTAs and renders support guidance when unavailable", () => {
    expect(subscriptionPage).toContain(
      "paymentMethodNeedsAttention && statusData?.renewalManagementLinkEligible",
    );
    expect(subscriptionPage).toContain(
      "statusData?.renewalManagementLinkEligible ? (",
    );
    expect(subscriptionPage).toContain(
      "Your payment method needs attention. Please contact support while we confirm the safest way to update your automatic renewal.",
    );

    const paymentAttentionBranchStart = subscriptionPage.indexOf(") : paymentMethodNeedsAttention ? (");
    const nextPlanBranchStart = subscriptionPage.indexOf(") : subscription?.planId", paymentAttentionBranchStart);
    const paymentAttentionBranch = subscriptionPage.slice(paymentAttentionBranchStart, nextPlanBranchStart);
    expect(paymentAttentionBranch).toContain("<Alert");
    expect(paymentAttentionBranch).not.toContain("handleSubscribe");
    expect(paymentAttentionBranch).not.toContain("Restore automatic renewal");
  });
});