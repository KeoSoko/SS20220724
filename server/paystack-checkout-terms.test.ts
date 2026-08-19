import { describe, expect, it } from "vitest";
import { validateTrackedCheckoutTerms } from "./billing-service";

const attempt = {
  planId: 2,
  amount: 14_900,
  currency: "ZAR",
  paystackPlanCode: "PLN_monthly",
  customerEmail: "owner@example.com",
  paystackReference: "ss_srv_10_reference",
};

const plan = {
  id: 2,
  paystackPlanCode: "PLN_monthly",
} as any;

const verifiedTransaction = {
  reference: "ss_srv_10_reference",
  amount: 14_900,
  currency: "ZAR",
  plan: { plan_code: "PLN_monthly" },
  customer: { email: "OWNER@example.com" },
  metadata: {
    plan_id: 2,
    plan_code: "PLN_monthly",
  },
};

describe("tracked Paystack checkout terms", () => {
  it("accepts only the exact server-owned commercial terms", () => {
    expect(validateTrackedCheckoutTerms(attempt as any, plan, verifiedTransaction))
      .toEqual({ valid: true });
  });

  it("rejects an altered amount", () => {
    expect(validateTrackedCheckoutTerms(attempt as any, plan, {
      ...verifiedTransaction,
      amount: 100,
    })).toEqual({ valid: false, reason: "amount_mismatch" });
  });

  it("rejects an alternate provider plan code", () => {
    expect(validateTrackedCheckoutTerms(attempt as any, plan, {
      ...verifiedTransaction,
      plan: { plan_code: "PLN_cheaper" },
    })).toEqual({ valid: false, reason: "plan_code_mismatch" });
  });

  it("rejects forged plan metadata instead of using it for entitlement", () => {
    expect(validateTrackedCheckoutTerms(attempt as any, plan, {
      ...verifiedTransaction,
      metadata: { plan_id: 999, plan_code: "PLN_cheaper" },
    })).toEqual({ valid: false, reason: "metadata_plan_mismatch" });
  });

  it("rejects a different customer email or currency", () => {
    expect(validateTrackedCheckoutTerms(attempt as any, plan, {
      ...verifiedTransaction,
      customer: { email: "other@example.com" },
    })).toEqual({ valid: false, reason: "customer_email_mismatch" });
    expect(validateTrackedCheckoutTerms(attempt as any, plan, {
      ...verifiedTransaction,
      currency: "USD",
    })).toEqual({ valid: false, reason: "currency_mismatch" });
  });
});