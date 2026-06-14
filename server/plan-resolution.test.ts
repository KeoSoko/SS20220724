import { describe, it, expect } from "vitest";
import { resolvePlanForTransaction } from "./plan-resolver";
import type { SubscriptionPlan } from "@shared/schema";

function makePlan(partial: Partial<SubscriptionPlan>): SubscriptionPlan {
  return {
    id: 0,
    name: "",
    displayName: "",
    description: null,
    price: 0,
    currency: "ZAR",
    billingPeriod: "monthly",
    trialDays: 0,
    paystackPlanCode: null,
    maxSeats: 1,
    googlePlayProductId: null,
    appleProductId: null,
    features: [],
    isActive: true,
    createdAt: new Date(),
    updatedAt: null,
    ...partial,
  } as SubscriptionPlan;
}

const MONTHLY = makePlan({
  id: 2,
  name: "premium_monthly",
  billingPeriod: "monthly",
  price: 4900,
  paystackPlanCode: "PLN_8l8p7v1mergg804",
});

const YEARLY = makePlan({
  id: 3,
  name: "premium_yearly",
  billingPeriod: "yearly",
  price: 53000,
  paystackPlanCode: "PLN_k9q25ilwueuz17j",
});

const PLANS = [MONTHLY, YEARLY];

describe("resolvePlanForTransaction", () => {
  it("resolves by the transaction's Paystack plan code", () => {
    const result = resolvePlanForTransaction(
      { amount: 4900, plan: { plan_code: "PLN_k9q25ilwueuz17j" } },
      PLANS,
    );
    expect(result).not.toBeNull();
    expect(result!.plan.id).toBe(YEARLY.id);
    expect(result!.source).toBe("transaction_plan_code");
  });

  it("ignores the payment amount entirely (yearly plan code at a monthly-looking amount resolves to yearly)", () => {
    // A R49 (4900 kobo) amount would be classified monthly by the old amount-based logic,
    // but the plan code is authoritative.
    const result = resolvePlanForTransaction(
      { amount: 4900, plan: { plan_code: "PLN_k9q25ilwueuz17j" } },
      PLANS,
    );
    expect(result!.plan.billingPeriod).toBe("yearly");
  });

  it("falls back to metadata plan_code when the transaction has no plan object", () => {
    const result = resolvePlanForTransaction(
      { amount: 53000, metadata: { plan_code: "PLN_8l8p7v1mergg804" } },
      PLANS,
    );
    expect(result!.plan.id).toBe(MONTHLY.id);
    expect(result!.source).toBe("metadata_plan_code");
  });

  it("falls back to metadata plan_id (string or number) when no code is present", () => {
    const asString = resolvePlanForTransaction({ metadata: { plan_id: "3" } }, PLANS);
    expect(asString!.plan.id).toBe(YEARLY.id);
    expect(asString!.source).toBe("metadata_plan_id");

    const asNumber = resolvePlanForTransaction({ metadata: { plan_id: 2 } }, PLANS);
    expect(asNumber!.plan.id).toBe(MONTHLY.id);
  });

  it("prefers the transaction plan code over metadata when both are present", () => {
    const result = resolvePlanForTransaction(
      { plan: { plan_code: "PLN_8l8p7v1mergg804" }, metadata: { plan_code: "PLN_k9q25ilwueuz17j", plan_id: 3 } },
      PLANS,
    );
    expect(result!.plan.id).toBe(MONTHLY.id);
    expect(result!.source).toBe("transaction_plan_code");
  });

  it("returns null when the plan cannot be resolved (so the caller flags it for review)", () => {
    expect(resolvePlanForTransaction({ amount: 4900 }, PLANS)).toBeNull();
    expect(
      resolvePlanForTransaction({ plan: { plan_code: "PLN_does_not_exist" } }, PLANS),
    ).toBeNull();
    expect(resolvePlanForTransaction({ metadata: { plan_id: 999 } }, PLANS)).toBeNull();
  });

  it("does not match plans that have no Paystack plan code (e.g. trial)", () => {
    const trial = makePlan({ id: 1, name: "free_trial", billingPeriod: "trial", paystackPlanCode: null });
    const result = resolvePlanForTransaction(
      { plan: { plan_code: null } },
      [trial, ...PLANS],
    );
    expect(result).toBeNull();
  });
});
