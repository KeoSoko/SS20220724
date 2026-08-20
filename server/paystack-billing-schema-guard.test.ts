import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  transactions: 0,
  providerVerify: vi.fn(),
}));

vi.mock("./storage", () => ({ storage: {} }));
vi.mock("./vite", () => ({ log: vi.fn() }));
vi.mock("./email-service", () => ({ emailService: null }));
vi.mock("./paystack-billing-schema", () => ({
  getPaystackBillingSchemaReadiness: vi.fn(async () => ({
    ready: false,
    missing: ["checkout_attempts_table"],
    checkedAt: new Date(),
  })),
  requirePaystackBillingSchema: vi.fn(async () => {
    throw new Error("Paystack billing schema is not ready");
  }),
}));
vi.mock("./db", () => ({
  db: {
    transaction: vi.fn(async () => {
      state.transactions += 1;
      throw new Error("database mutation should not run");
    }),
    select: vi.fn(),
  },
}));

import { BillingService } from "./billing-service";

describe("Paystack billing schema guards", () => {
  it("blocks checkout creation, provider verification, and settlement before a reference or mutation", async () => {
    const service = new BillingService();
    (service as any).paystack = {
      transaction: { verify: state.providerVerify },
    };

    await expect(service.createOrReusePaystackCheckoutAttempt({
      billingOwnerUserId: 1,
      requestedByUserId: 1,
      planId: 2,
      amount: 4_900,
      currency: "ZAR",
      paystackPlanCode: "PLN_monthly",
      customerEmail: "owner@example.com",
    })).rejects.toThrow("Paystack billing schema is not ready");
    await expect(service.verifyPaystackTransaction("ss_srv_should_not_verify"))
      .rejects.toThrow("Paystack billing schema is not ready");
    await expect(service.processPaystackSubscription(1, "ss_srv_should_not_settle"))
      .rejects.toThrow("Paystack billing schema is not ready");

    expect(state.transactions).toBe(0);
    expect(state.providerVerify).not.toHaveBeenCalled();
  });
});