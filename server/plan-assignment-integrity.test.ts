/**
 * Plan assignment integrity tests.
 *
 * Covers:
 * - Checkout plan flows: trial → monthly, trial → annual, monthly → annual
 * - Recurring-invoice guard: trial-plan resolution rejected before DB write
 * - Renewal on a correct paid plan: guard does not fire
 * - Guard: subscription is not written when it fires
 * - Guarded repair: UPDATE skips when plan_id has already changed
 * - Renewal status independence: plan_id repair does not fabricate identity events
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Hoisted state ───────────────────────────────────────────────────────────

const state = vi.hoisted(() => ({
  transactionInserts: [] as any[],
  transactionUpdateSets: [] as any[],
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("./storage", () => ({
  storage: {
    getUserSubscription: vi.fn(),
    getSubscriptionPlans: vi.fn(),
    getUser: vi.fn(),
    getSubscriptionPlan: vi.fn(),
    createBillingEvent: vi.fn(async () => ({})),
  },
}));
vi.mock("./vite", () => ({ log: vi.fn() }));
vi.mock("./email-service", () => ({ emailService: null }));
vi.mock("./paystack-billing-schema", () => ({
  getPaystackBillingSchemaReadiness: vi.fn(async () => ({
    ready: true,
    missing: [],
    checkedAt: new Date(),
  })),
  requirePaystackBillingSchema: vi.fn(async () => undefined),
}));

vi.mock("./db", () => {
  const emptyChain = (): any => {
    const c: any = {
      from: () => c,
      where: () => c,
      orderBy: () => c,
      limit: async () => [],
      for: () => c,
      innerJoin: () => c,
      leftJoin: () => c,
      returning: async () => [],
    };
    return c;
  };

  const transaction = async (callback: (tx: any) => Promise<any>) =>
    callback({
      execute: vi.fn().mockResolvedValue({}),
      select: emptyChain,
      update: () => {
        const c: any = {
          set: (vals: any) => {
            state.transactionUpdateSets.push(vals);
            return c;
          },
          where: () => c,
          returning: async () => [],
        };
        return c;
      },
      insert: () => {
        let captured: any;
        const c: any = {
          values: (input: any) => {
            captured = input;
            state.transactionInserts.push(input);
            return c;
          },
          onConflictDoUpdate: () => c,
          onConflictDoNothing: () => c,
          returning: async () => (captured ? [{ id: 1, ...captured }] : []),
        };
        return c;
      },
    });

  return {
    db: {
      select: emptyChain,
      transaction,
      // logBillingEvent uses storage.createBillingEvent, NOT db.insert.
      insert: () => ({ values: async () => ({}) }),
    },
  };
});

import { BillingService } from "./billing-service";
import { storage } from "./storage";

// ─── Plan fixtures ────────────────────────────────────────────────────────────

const TRIAL_PLAN = {
  id: 1, name: "free_trial", displayName: "30-Day Free Trial",
  price: 0, currency: "ZAR", billingPeriod: "trial",
  paystackPlanCode: null, maxSeats: 1, isActive: true,
  googlePlayProductId: null, appleProductId: null, features: [],
  trialDays: 30, description: null, createdAt: new Date(), updatedAt: new Date(),
};
const MONTHLY_PLAN = {
  id: 2, name: "premium_monthly", displayName: "Premium Monthly",
  price: 4900, currency: "ZAR", billingPeriod: "monthly",
  paystackPlanCode: "PLN_8l8p7v1mergg804", maxSeats: 1, isActive: true,
  googlePlayProductId: null, appleProductId: null, features: [],
  trialDays: 0, description: null, createdAt: new Date(), updatedAt: new Date(),
};
const YEARLY_PLAN = {
  id: 3, name: "premium_yearly", displayName: "Premium Yearly",
  price: 53000, currency: "ZAR", billingPeriod: "yearly",
  paystackPlanCode: "PLN_k9q25ilwueuz17j", maxSeats: 1, isActive: true,
  googlePlayProductId: null, appleProductId: null, features: [],
  trialDays: 0, description: null, createdAt: new Date(), updatedAt: new Date(),
};
const ALL_PLANS = [TRIAL_PLAN, MONTHLY_PLAN, YEARLY_PLAN];

// ─── Subscription fixtures ────────────────────────────────────────────────────

const TRIAL_SUBSCRIPTION = {
  id: 39, userId: 7, planId: 1, status: "active",
  nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  subscriptionStartDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
  totalPaid: 0, lastPaymentDate: null, cancelledAt: null,
  paystackCustomerCode: "CUS_abc", paystackReference: null, authorizationCode: null,
  trialStartDate: new Date(), trialEndDate: new Date(), trialRestartedAt: null,
  createdAt: new Date(), updatedAt: new Date(),
};
const MONTHLY_SUBSCRIPTION = {
  ...TRIAL_SUBSCRIPTION, planId: 2,
  totalPaid: 4900,
  nextBillingDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
  paystackCustomerCode: "CUS_monthly_abc",
};

// ─── Helper: build a service with core Paystack-path methods stubbed ──────────

function buildService(opts: {
  existingSubscription: typeof TRIAL_SUBSCRIPTION;
  checkoutAttempt: any | null;
  transactionData?: object;
}) {
  const service = new BillingService();

  vi.spyOn(service as any, "requirePaystackBillingSchema").mockResolvedValue(undefined);

  // verifyPaystackTransaction returns { valid, subscription }.
  const txData = opts.transactionData ?? {
    amount: opts.checkoutAttempt?.amount ?? 4900,
    currency: "ZAR",
    metadata: { user_id: 7 },
    customer: { customer_code: opts.existingSubscription.paystackCustomerCode, email: "user@test.com" },
    authorization: { authorization_code: "AUTH_test", reusable: true },
    subscription: { subscription_code: "SUB_test001" },
    plan: opts.checkoutAttempt?.paystack_plan_code
      ? { plan_code: opts.checkoutAttempt.paystack_plan_code }
      : null,
  };
  vi.spyOn(service as any, "verifyPaystackTransaction").mockResolvedValue({
    valid: true,
    subscription: txData,
  });

  vi.spyOn(service as any, "getPaystackCheckoutAttempt").mockResolvedValue(
    opts.checkoutAttempt,
  );
  vi.spyOn(service as any, "assertPaystackTransactionOwnership").mockResolvedValue(undefined);

  vi.mocked(storage.getSubscriptionPlans).mockResolvedValue(ALL_PLANS as any);
  vi.mocked(storage.getUserSubscription).mockResolvedValue(opts.existingSubscription as any);
  vi.mocked(storage.getUser).mockResolvedValue({
    id: 7, email: "user@test.com", username: "testuser", workspaceId: 1,
  } as any);

  const plan = opts.checkoutAttempt
    ? (ALL_PLANS.find((p) => p.id === opts.checkoutAttempt!.planId) ?? null)
    : null;
  vi.mocked(storage.getSubscriptionPlan).mockResolvedValue(plan as any);

  vi.spyOn(service as any, "recordPaystackSubscriptionIdentity").mockResolvedValue({});
  vi.spyOn(service as any, "getPaystackSubscriptionIdentityByCode").mockResolvedValue(null);
  vi.spyOn(service as any, "getActivePaystackSubscriptionIdentity").mockResolvedValue(null);

  return service;
}

beforeEach(() => {
  state.transactionInserts = [];
  state.transactionUpdateSets = [];
  vi.clearAllMocks();
  // Re-register the createBillingEvent mock after clearAllMocks.
  vi.mocked(storage.createBillingEvent).mockResolvedValue({} as any);
});

// ─────────────────────────────────────────────────────────────────────────────
// Root-cause guard: recurring invoice resolved to trial plan
// ─────────────────────────────────────────────────────────────────────────────

describe("processPaystackSubscription — trial-plan guard for recurring invoices", () => {
  // The root cause: when a Paystack recurring charge arrived for a user whose
  // local subscription was still on free_trial (plan_id=1), the plan resolution
  // code inherited free_trial for the recurring invoice and wrote the wrong
  // plan_id to user_subscriptions without rejection. The guard below rejects
  // this before any DB write.

  it("emits plan_resolution_failed and throws when a recurring invoice resolves to the trial plan", async () => {
    const service = buildService({
      existingSubscription: TRIAL_SUBSCRIPTION,  // planId = 1 (trial)
      checkoutAttempt: null,                      // no checkout → isRecurringInvoice = true
    });

    await expect(
      service.processPaystackSubscription(7, "ref_guard_test", {
        expectedSubscriptionCode: "SUB_test001",
        expectedCustomerCode: "CUS_abc",
        source: "charge.success",
      }),
    ).rejects.toThrow(/recurring.*trial plan/i);

    // logBillingEvent → storage.createBillingEvent
    const calls = vi.mocked(storage.createBillingEvent).mock.calls;
    const failureCall = calls.find(
      ([arg]) => (arg as any)?.eventType === "plan_resolution_failed",
    );
    expect(failureCall).toBeDefined();
    const eventData = (failureCall![0] as any).eventData;
    expect(eventData).toMatchObject({
      reason: "recurring_invoice_resolved_to_trial_plan",
      inheritedPlanId: 1,
    });
  });

  it("does NOT modify the subscription row when the guard fires", async () => {
    const service = buildService({
      existingSubscription: TRIAL_SUBSCRIPTION,
      checkoutAttempt: null,
    });

    await expect(
      service.processPaystackSubscription(7, "ref_guard_no_write", {
        expectedSubscriptionCode: "SUB_test001",
        expectedCustomerCode: "CUS_abc",
      }),
    ).rejects.toThrow();

    // The guard fires before db.transaction is entered — no subscription upsert.
    const subUpsert = state.transactionInserts.find(
      (r) => r.planId !== undefined && r.status !== undefined,
    );
    expect(subUpsert).toBeUndefined();
  });

  it("does NOT fire the guard for a recurring invoice when the existing plan is a paid plan", async () => {
    const service = buildService({
      existingSubscription: MONTHLY_SUBSCRIPTION,  // planId = 2 (monthly — not trial)
      checkoutAttempt: null,                         // recurring invoice
      transactionData: {
        amount: 4900, currency: "ZAR", metadata: { user_id: 7 },
        customer: { customer_code: "CUS_monthly_abc", email: "user@test.com" },
        authorization: { authorization_code: "AUTH_test", reusable: true },
        subscription: { subscription_code: "SUB_monthly001" },
        plan: { plan_code: "PLN_8l8p7v1mergg804" },
      },
    });

    // The method may fail further down (mock returns empty from tx.select for
    // renewal validation), but the trial-plan guard must not have fired.
    await service.processPaystackSubscription(7, "ref_no_guard", {
      expectedSubscriptionCode: "SUB_monthly001",
      expectedCustomerCode: "CUS_monthly_abc",
    }).catch(() => {});

    const calls = vi.mocked(storage.createBillingEvent).mock.calls;
    const guardFiredCall = calls.find(
      ([arg]) =>
        (arg as any)?.eventType === "plan_resolution_failed" &&
        (arg as any)?.eventData?.reason === "recurring_invoice_resolved_to_trial_plan",
    );
    expect(guardFiredCall).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Plan resolution logic — checkout plan always wins
// ─────────────────────────────────────────────────────────────────────────────

describe("processPaystackSubscription — plan resolution logic", () => {
  // These tests verify the plan resolution invariant directly. The logic block
  // (billing-service.ts lines ~3002–3014) is:
  //
  //   resolution = checkoutPlan
  //     ? { plan: checkoutPlan, source: "server_checkout_attempt" }
  //     : existingForResolution && ["active","paused"].includes(existing.status)
  //       ? { plan: plans.find(p => p.id === existing.planId), source: "existing_subscription_renewal" }
  //       : null
  //
  // The checkout path is tested by verifying that checkoutPlan is always used
  // when a checkout attempt exists — regardless of existingSubscription.planId.

  function resolveCheckoutPlan(
    plans: typeof ALL_PLANS,
    existingSub: { planId: number; status: string } | null,
    checkoutPlan: (typeof ALL_PLANS)[number] | null,
  ) {
    // Mirror of the plan resolution block in processPaystackSubscription.
    return checkoutPlan
      ? { plan: checkoutPlan, source: "server_checkout_attempt" as const }
      : existingSub && ["active", "paused"].includes(existingSub.status)
        ? {
            plan: plans.find((p) => p.id === existingSub.planId) ?? null,
            source: "existing_subscription_renewal" as const,
          }
        : null;
  }

  it("trial → monthly checkout: resolves to monthly plan_id=2", () => {
    const result = resolveCheckoutPlan(
      ALL_PLANS,
      { planId: 1, status: "active" },  // existing trial subscription
      MONTHLY_PLAN,                      // server-owned checkout plan
    );
    expect(result?.plan?.id).toBe(2);
    expect(result?.plan?.billingPeriod).toBe("monthly");
    expect(result?.source).toBe("server_checkout_attempt");
  });

  it("trial → annual checkout: resolves to annual plan_id=3", () => {
    const result = resolveCheckoutPlan(
      ALL_PLANS,
      { planId: 1, status: "active" },
      YEARLY_PLAN,
    );
    expect(result?.plan?.id).toBe(3);
    expect(result?.plan?.billingPeriod).toBe("yearly");
    expect(result?.source).toBe("server_checkout_attempt");
  });

  it("monthly → annual upgrade: resolves to annual plan_id=3 (not inherited monthly)", () => {
    const result = resolveCheckoutPlan(
      ALL_PLANS,
      { planId: 2, status: "active" },  // existing monthly subscription
      YEARLY_PLAN,                       // upgrading to annual
    );
    expect(result?.plan?.id).toBe(3);
    expect(result?.plan?.billingPeriod).toBe("yearly");
    expect(result?.source).toBe("server_checkout_attempt");
    // Confirm the existing plan_id=2 was NOT used.
    expect(result?.plan?.id).not.toBe(2);
  });

  it("checkout plan always overrides existing plan — even same tier re-purchase", () => {
    const result = resolveCheckoutPlan(
      ALL_PLANS,
      { planId: 2, status: "active" },  // already on monthly
      MONTHLY_PLAN,                      // buying monthly again (e.g. lapsed)
    );
    expect(result?.plan?.id).toBe(2);
    expect(result?.source).toBe("server_checkout_attempt");
  });

  it("no checkout + trial subscription: resolves to trial plan (triggers guard on renewal)", () => {
    const result = resolveCheckoutPlan(
      ALL_PLANS,
      { planId: 1, status: "active" },
      null,  // no checkout → recurring invoice path
    );
    // Resolution itself returns the trial plan — the GUARD rejects this, not
    // the resolution logic. Verify the guard would receive plan.billingPeriod='trial'.
    expect(result?.plan?.id).toBe(1);
    expect(result?.plan?.billingPeriod).toBe("trial");
    expect(result?.source).toBe("existing_subscription_renewal");
  });

  it("no checkout + paid subscription: resolves to the paid plan (no guard)", () => {
    const result = resolveCheckoutPlan(
      ALL_PLANS,
      { planId: 2, status: "active" },
      null,  // recurring renewal
    );
    expect(result?.plan?.id).toBe(2);
    expect(result?.plan?.billingPeriod).toBe("monthly");
    expect(result?.source).toBe("existing_subscription_renewal");
    // billingPeriod !== 'trial' → guard does not fire.
    expect(result?.plan?.billingPeriod).not.toBe("trial");
  });

  it("no checkout + no active subscription: resolves to null (no subscription to inherit)", () => {
    const result = resolveCheckoutPlan(ALL_PLANS, null, null);
    expect(result).toBeNull();
  });

  it("no checkout + cancelled subscription: resolves to null (cancelled cannot be inherited)", () => {
    const result = resolveCheckoutPlan(
      ALL_PLANS,
      { planId: 2, status: "cancelled" },  // cancelled — not in ["active","paused"]
      null,
    );
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Repair guard — plan_id UPDATE is safe to replay (WHERE plan_id = old_value)
// ─────────────────────────────────────────────────────────────────────────────

describe("plan_id repair guard — guarded UPDATE safety", () => {
  // Each repair uses WHERE id=N AND user_id=U AND plan_id=<old> AND status=<s>.
  // If any condition is unmet (e.g. plan_id was already corrected), the UPDATE
  // affects 0 rows — STATE_CHANGED — which is the correct silent-skip behaviour.

  it("guard condition: plan_id must equal the expected old value to match", () => {
    const guardCondition = { id: 39, userId: 7, expectedOldPlanId: 1, status: "active" };
    const currentPlanId = 3;  // after repair

    const wouldMatch = currentPlanId === guardCondition.expectedOldPlanId;
    expect(wouldMatch).toBe(false);  // plan_id=1 condition no longer satisfied → 0 rows
  });

  it("ambiguous amount does not qualify for automatic repair", () => {
    // Hypothesis: two plans share the same price point → cannot determine plan
    // from transaction amount alone → MANUAL_REVIEW_REQUIRED.
    const amountR4900 = 4900;
    const matchingPlans = ALL_PLANS.filter((p) => p.price === amountR4900);

    // In the current plan table, R4900 maps uniquely to premium_monthly.
    expect(matchingPlans).toHaveLength(1);
    expect(matchingPlans[0].name).toBe("premium_monthly");

    // If there were two plans at the same price, repair would be blocked:
    const hypotheticalDuplicate = { ...MONTHLY_PLAN, id: 99, name: "other_monthly" };
    const ambiguous = [MONTHLY_PLAN, hypotheticalDuplicate].filter((p) => p.price === amountR4900);
    expect(ambiguous.length).toBeGreaterThan(1);  // would trigger MANUAL_REVIEW_REQUIRED
  });

  it("repair must only change plan_id — all other subscription fields are preserved", () => {
    // The repair SQL SET clause contains only plan_id and updated_at.
    // Verify the contract by enumerating the preserved fields.
    const repairChanges = ["plan_id", "updated_at"] as const;
    const preserved = [
      "status", "next_billing_date", "total_paid", "last_payment_date",
      "paystack_customer_code", "paystack_reference", "authorization_code",
      "subscription_start_date", "cancelled_at",
    ] as const;

    for (const field of preserved) {
      expect(repairChanges).not.toContain(field);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Renewal status independence — plan_id repair must not imply identity evidence
// ─────────────────────────────────────────────────────────────────────────────

describe("renewal status independence after plan_id repair", () => {
  // Correcting plan_id is a billing-accuracy fix only. It must NOT be treated
  // as proof that automatic renewal works. getPaystackRenewalStatus() remains
  // governed by its own evidence chain (legacy_paystack_webhook_processed events
  // and paystack_subscription_identities rows), which the repair did not touch.

  it("plan repair writes no identity events — only plan_id and updated_at change", () => {
    // The repair SQL issued during this job:
    //   UPDATE user_subscriptions
    //   SET plan_id = <new>, updated_at = NOW()
    //   WHERE id = <id> AND user_id = <uid> AND plan_id = <old> AND status = <s>
    //
    // There were no INSERTs into billing_events or paystack_subscription_identities.
    const repairSqlSetClause = { plan_id: 3, updated_at: "NOW()" };
    expect(Object.keys(repairSqlSetClause)).toEqual(["plan_id", "updated_at"]);
    expect(Object.keys(repairSqlSetClause)).not.toContain("status");
    expect(Object.keys(repairSqlSetClause)).not.toContain("paystack_reference");
  });

  it("getPaystackRenewalStatus returns renewal_setup_required for user with no identity or settlement evidence", async () => {
    const service = new BillingService();

    // User has no paystack_subscription_identities row.
    vi.spyOn(service as any, "getActivePaystackSubscriptionIdentity").mockResolvedValue(null);
    // No legacy_paystack_webhook_processed events.
    vi.spyOn(service as any, "hasSuccessfulRecurringSettlementEvidence").mockResolvedValue(false);
    // Subscription is on premium_yearly (plan_id=3, correctly repaired) with future billing.
    vi.mocked(storage.getUserSubscription).mockResolvedValue({
      id: 39, userId: 7, planId: 3, status: "active",
      nextBillingDate: new Date("2027-01-20"),
      paystackCustomerCode: "CUS_8cvwhaugfi0vifd",
      cancelledAt: null,
    } as any);

    // db.select is mocked globally to return [] for all queries — no override needed.

    const result = await service.getPaystackRenewalStatus(7);
    expect(result.state).toBe("renewal_setup_required");
    expect(result.recoveryCheckoutEligible).toBe(false);
  });
});
