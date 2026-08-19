import { describe, it, expect } from "vitest";
import { resolvePlanForTransaction, resolvePlanWithRenewalFallback } from "./plan-resolver";
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

// Seat-based Team tiers (Solo = MONTHLY, 1 seat).
const TEAM_S = makePlan({ id: 4, name: "team_s", billingPeriod: "monthly", price: 24500, paystackPlanCode: "PLN_15dr43omaa0569q", maxSeats: 5 });
const TEAM_M = makePlan({ id: 5, name: "team_m", billingPeriod: "monthly", price: 49000, paystackPlanCode: "PLN_p92uns68g8zenic", maxSeats: 10 });
const TEAM_L = makePlan({ id: 6, name: "team_l", billingPeriod: "monthly", price: 98000, paystackPlanCode: "PLN_6dn6r7nvwe2nwnh", maxSeats: 20 });
const TEAM_XL = makePlan({ id: 7, name: "team_xl", billingPeriod: "monthly", price: 245000, paystackPlanCode: "PLN_xjrq6x5bqdxcctm", maxSeats: 50 });

const PLANS = [MONTHLY, YEARLY, TEAM_S, TEAM_M, TEAM_L, TEAM_XL];

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

  it.each([
    ["Team S", "PLN_15dr43omaa0569q", 4, 5],
    ["Team M", "PLN_p92uns68g8zenic", 5, 10],
    ["Team L", "PLN_6dn6r7nvwe2nwnh", 6, 20],
    ["Team XL", "PLN_xjrq6x5bqdxcctm", 7, 50],
  ])("resolves %s by its Paystack plan code to the right tier and seat count", (_label, code, expectedId, expectedSeats) => {
    const result = resolvePlanForTransaction({ plan: { plan_code: code } }, PLANS);
    expect(result).not.toBeNull();
    expect(result!.plan.id).toBe(expectedId);
    expect(result!.plan.maxSeats).toBe(expectedSeats);
    expect(result!.source).toBe("transaction_plan_code");
  });

  it("does not confuse Team tiers with one another (each code maps to exactly one tier)", () => {
    const sResult = resolvePlanForTransaction({ plan: { plan_code: "PLN_15dr43omaa0569q" } }, PLANS);
    const xlResult = resolvePlanForTransaction({ plan: { plan_code: "PLN_xjrq6x5bqdxcctm" } }, PLANS);
    expect(sResult!.plan.name).toBe("team_s");
    expect(xlResult!.plan.name).toBe("team_xl");
    expect(sResult!.plan.id).not.toBe(xlResult!.plan.id);
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

describe("resolvePlanWithRenewalFallback", () => {
  it("inherits the customer's CURRENT plan on a renewal charge that has no plan code/metadata", () => {
    // The exact failure case: a renewal charge with only an amount, but the
    // customer already has an active monthly subscription.
    const result = resolvePlanWithRenewalFallback(
      { amount: 4900 },
      PLANS,
      { status: "active", planId: MONTHLY.id },
    );
    expect(result).not.toBeNull();
    expect(result!.plan.id).toBe(MONTHLY.id);
    expect(result!.source).toBe("existing_subscription_renewal");
  });

  it("inherits the current plan for a delayed renewal success after payment pause", () => {
    const result = resolvePlanWithRenewalFallback(
      { amount: 4900, metadata: null, plan: null },
      PLANS,
      { status: "paused", planId: 2 },
    );

    expect(result?.source).toBe("existing_subscription_renewal");
    expect(result?.plan.id).toBe(2);
  });

  it("still fails safely (manual review) when there is no existing subscription to inherit from", () => {
    expect(resolvePlanWithRenewalFallback({ amount: 4900 }, PLANS, null)).toBeNull();
    expect(resolvePlanWithRenewalFallback({ amount: 4900 }, PLANS, undefined)).toBeNull();
  });

  it("does not inherit from a non-active subscription (cancelled/expired)", () => {
    expect(
      resolvePlanWithRenewalFallback({ amount: 4900 }, PLANS, { status: "cancelled", planId: MONTHLY.id }),
    ).toBeNull();
    expect(
      resolvePlanWithRenewalFallback({ amount: 4900 }, PLANS, { status: "expired", planId: MONTHLY.id }),
    ).toBeNull();
  });

  it("prefers the payload's deterministic plan code over the existing subscription's plan", () => {
    // Customer is on monthly, but this charge explicitly carries the yearly plan code.
    const result = resolvePlanWithRenewalFallback(
      { plan: { plan_code: YEARLY.paystackPlanCode } },
      PLANS,
      { status: "active", planId: MONTHLY.id },
    );
    expect(result!.plan.id).toBe(YEARLY.id);
    expect(result!.source).toBe("transaction_plan_code");
  });

  it("never guesses by amount: inheritance uses the existing plan id, not the amount", () => {
    // Amount looks like a Team tier price, but the customer is on monthly — we
    // inherit the customer's monthly plan, never the amount-matched plan.
    const result = resolvePlanWithRenewalFallback(
      { amount: 24500 },
      PLANS,
      { status: "active", planId: MONTHLY.id },
    );
    expect(result!.plan.id).toBe(MONTHLY.id);
    expect(result!.source).toBe("existing_subscription_renewal");
  });
});
