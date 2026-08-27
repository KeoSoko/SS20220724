import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  scenario: "checkout_race" as
    | "checkout_race"
    | "duplicate"
    | "old_renewal"
    | "trusted_renewal"
    | "lifecycle_stale",
  topLevelAttemptPresent: true,
  currentAttemptStatus: "pending",
  subscription: null as any,
  txSelectOrdinal: 0,
  txUpdates: 0,
  txUpdateOrdinal: 0,
  txUpdateValues: [] as any[],
  txInserts: [] as any[],
  loggedEvents: [] as any[],
  verificationStarted: null as null | (() => void),
  completeVerification: null as null | ((value: any) => void),
}));

const plan = {
  id: 2,
  name: "premium_monthly",
  displayName: "Premium Monthly",
  price: 14_900,
  currency: "ZAR",
  billingPeriod: "monthly",
  paystackPlanCode: "PLN_monthly",
  isActive: true,
};

const initialAttempt = {
  id: 41,
  billingOwnerUserId: 10,
  requestedByUserId: 10,
  planId: 2,
  amount: 14_900,
  currency: "ZAR",
  paystackPlanCode: "PLN_monthly",
  customerEmail: "owner@example.com",
  paystackReference: "ss_srv_10_race",
  status: "pending",
  expiresAt: new Date("2026-08-19T20:00:00.000Z"),
  completedAt: null,
  createdAt: new Date("2026-08-19T19:00:00.000Z"),
  updatedAt: new Date("2026-08-19T19:00:00.000Z"),
};

const baseSubscription = {
  id: 9,
  userId: 10,
  planId: 1,
  status: "trial",
  nextBillingDate: null,
  paystackCustomerCode: null,
};

vi.mock("./storage", () => ({
  storage: {
    getSubscriptionPlan: vi.fn(async () => plan),
    getSubscriptionPlans: vi.fn(async () => [plan]),
    getUserSubscription: vi.fn(async () => state.subscription),
    getUser: vi.fn(async () => ({
      id: 10,
      email: "owner@example.com",
      username: "owner",
    })),
    createBillingEvent: vi.fn(async (event: any) => {
      state.loggedEvents.push(event);
      return event;
    }),
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
  const query = (rows: any[]) => {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      for: async () => rows,
      then: (resolve: (value: any[]) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(rows).then(resolve, reject),
    };
    return chain;
  };

  const insert = (capture: any[]) => {
    const chain: any = {
      values: (values: any) => {
        capture.push(values);
        return chain;
      },
      onConflictDoNothing: () => chain,
      onConflictDoUpdate: () => chain,
      returning: async () => [],
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(undefined).then(resolve, reject),
    };
    return chain;
  };

  return {
    db: {
      select: () => query(state.topLevelAttemptPresent ? [{ ...initialAttempt }] : []),
      insert: () => insert([]),
      transaction: async (callback: (tx: any) => Promise<any>) => {
        state.txSelectOrdinal = 0;
        const tx = {
          execute: vi.fn(async () => ({})),
          select: () => {
            state.txSelectOrdinal += 1;
            if (state.scenario === "lifecycle_stale") {
              if (state.txSelectOrdinal === 1) {
                return query([{
                  id: 77,
                  userId: 10,
                  subscriptionCode: "SUB_new_checkout",
                  customerCode: "CUS_owner",
                  planCode: "PLN_monthly",
                  status: "active",
                  providerCreatedAt: new Date("2026-08-19T19:10:00.000Z"),
                  createdAt: new Date("2026-08-19T19:10:00.000Z"),
                }]);
              }
              return query([]);
            }
            if (state.scenario === "old_renewal" || state.scenario === "trusted_renewal") {
              if (state.txSelectOrdinal === 1) return query([]);
              if (state.txSelectOrdinal === 2) return query([state.subscription]);
              // Ordinal 3 is the recurring-invoice paystackCancellationAttempts
              // lookup added for the Phase 3 cancellation foundation; these
              // scenarios have no open cancellation attempt, so it stays empty.
              if (state.txSelectOrdinal === 3) return query([]);
              if (state.txSelectOrdinal === 4) {
                return query([{
                  id: 77,
                  userId: 10,
                  subscriptionCode: state.scenario === "old_renewal"
                    ? "SUB_new_checkout"
                    : "SUB_current",
                  customerCode: "CUS_owner",
                  planCode: "PLN_monthly",
                  status: "active",
                  providerCreatedAt: new Date("2026-08-19T19:10:00.000Z"),
                  createdAt: new Date("2026-08-19T19:10:00.000Z"),
                }]);
              }
              return query([]);
            }
            if (state.txSelectOrdinal === 1) {
              return query([{
                ...initialAttempt,
                status: state.currentAttemptStatus,
                updatedAt: new Date(),
              }]);
            }
            if (state.txSelectOrdinal === 2) return query([plan]);
            if (state.txSelectOrdinal === 3) {
              return query(state.scenario === "duplicate"
                ? [{
                    id: 501,
                    userId: 10,
                    platform: "paystack",
                    platformTransactionId: initialAttempt.paystackReference,
                  }]
                : []);
            }
            if (state.scenario === "duplicate" && state.txSelectOrdinal === 4) {
              return query([state.subscription]);
            }
            return query([]);
          },
          insert: () => insert(state.txInserts),
          update: () => {
            state.txUpdates += 1;
            state.txUpdateOrdinal += 1;
            const updateOrdinal = state.txUpdateOrdinal;
            const chain: any = {
              set: (values: any) => {
                state.txUpdateValues.push(values);
                return chain;
              },
              where: () => chain,
              returning: async () => (
                state.scenario === "trusted_renewal" && updateOrdinal === 1
                  ? [{
                      ...state.subscription,
                      status: "active",
                      planId: 2,
                      nextBillingDate: new Date("2026-10-19T19:00:00.000Z"),
                      paystackReference: "renewal_current_sub",
                    }]
                  : []
              ),
              then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
                Promise.resolve(undefined).then(resolve, reject),
            };
            return chain;
          },
        };
        return callback(tx);
      },
    },
  };
});

import { BillingService } from "./billing-service";

beforeEach(() => {
  state.scenario = "checkout_race";
  state.topLevelAttemptPresent = true;
  state.currentAttemptStatus = "pending";
  state.subscription = { ...baseSubscription };
  state.txSelectOrdinal = 0;
  state.txUpdates = 0;
  state.txUpdateOrdinal = 0;
  state.txUpdateValues.length = 0;
  state.txInserts.length = 0;
  state.loggedEvents.length = 0;
  state.verificationStarted = null;
  state.completeVerification = null;
});

describe("Paystack checkout and renewal settlement ordering", () => {
  it("re-reads a checkout invalidated while Paystack verification was in flight", async () => {
    const service = new BillingService();
    let completeVerification!: (value: any) => void;
    const verification = new Promise<any>((resolve) => {
      completeVerification = resolve;
    });
    let verificationStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      verificationStarted = resolve;
    });

    vi.spyOn(service, "verifyPaystackTransaction").mockImplementation(async () => {
      verificationStarted();
      return verification;
    });

    const processing = service.processPaystackSubscription(10, "ss_srv_10_race");
    await started;

    // Simulate a renewal winning lock 36 and invalidating the pending checkout
    // while this checkout was waiting on the external verification response.
    state.currentAttemptStatus = "cancelled";
    completeVerification({
      valid: true,
      subscription: {
        status: "success",
        reference: "ss_srv_10_race",
        amount: 14_900,
        currency: "ZAR",
        plan: { plan_code: "PLN_monthly" },
        customer: {
          email: "owner@example.com",
          customer_code: "CUS_owner",
        },
        metadata: { plan_id: 2, plan_code: "PLN_monthly" },
      },
    });

    await expect(processing).rejects.toThrow(
      "Verified Paystack payment requires financial review: checkout_state_invalid",
    );

    expect(state.txUpdates).toBe(0);
    expect(state.txInserts).toHaveLength(1);
    expect(state.txInserts[0]).toMatchObject({
      eventType: "paystack_successful_payment_requires_review",
      processed: false,
      eventData: {
        reason: "checkout_state_invalid",
        transactionReference: "ss_srv_10_race",
        currentAttemptStatus: "cancelled",
      },
    });
    expect(state.loggedEvents.some(
      (event) => event.eventType === "subscription_failed",
    )).toBe(true);
  });

  it("keeps callback and webhook replays idempotent after one reference is in the ledger", async () => {
    state.scenario = "duplicate";
    state.currentAttemptStatus = "completed";
    state.subscription = {
      ...baseSubscription,
      status: "active",
      planId: 2,
      paystackCustomerCode: "CUS_owner",
      nextBillingDate: new Date("2026-09-19T19:00:00.000Z"),
    };
    const service = new BillingService();
    vi.spyOn(service, "verifyPaystackTransaction").mockResolvedValue({
      valid: true,
      subscription: {
        status: "success",
        reference: initialAttempt.paystackReference,
        amount: 14_900,
        currency: "ZAR",
        plan: { plan_code: "PLN_monthly" },
        customer: {
          email: "owner@example.com",
          customer_code: "CUS_owner",
        },
        metadata: { plan_id: 2, plan_code: "PLN_monthly" },
      },
    } as any);

    const result = await service.processPaystackSubscription(
      10,
      initialAttempt.paystackReference,
    );

    expect(result).toBe(state.subscription);
    expect(state.txInserts).toHaveLength(0);
    expect(state.txUpdateValues).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "completed" }),
      expect.objectContaining({ status: "cancelled" }),
    ]));
    expect(state.loggedEvents).toHaveLength(0);
  });

  it("rejects an old renewal after a newer checkout has become the active identity", async () => {
    state.scenario = "old_renewal";
    state.topLevelAttemptPresent = false;
    state.subscription = {
      ...baseSubscription,
      status: "active",
      planId: 2,
      paystackCustomerCode: "CUS_owner",
      cancelledAt: null,
      nextBillingDate: new Date("2026-09-19T19:00:00.000Z"),
    };
    const service = new BillingService();
    vi.spyOn(service, "verifyPaystackTransaction").mockResolvedValue({
      valid: true,
      subscription: {
        status: "success",
        reference: "renewal_old_sub",
        amount: 14_900,
        currency: "ZAR",
        subscription: { subscription_code: "SUB_old" },
        plan: { plan_code: "PLN_monthly" },
        customer: {
          email: "owner@example.com",
          customer_code: "CUS_owner",
        },
      },
    } as any);

    await expect(service.processPaystackSubscription(
      10,
      "renewal_old_sub",
      {
        source: "charge.success",
        expectedSubscriptionCode: "SUB_old",
        expectedCustomerCode: "CUS_owner",
      },
    )).rejects.toThrow(
      "Verified Paystack payment requires financial review: stale_subscription_identity",
    );

    expect(state.txUpdates).toBe(0);
    expect(state.txInserts).toHaveLength(1);
    expect(state.txInserts[0]).toMatchObject({
      eventType: "paystack_successful_payment_requires_review",
      processed: false,
      eventData: {
        reason: "stale_subscription_identity",
        verifiedSubscriptionCode: "SUB_old",
        activeSubscriptionCode: "SUB_new_checkout",
      },
    });
  });

  it("applies one trusted renewal for the exact active SUB_* and customer relationship", async () => {
    state.scenario = "trusted_renewal";
    state.topLevelAttemptPresent = false;
    state.subscription = {
      ...baseSubscription,
      status: "active",
      planId: 2,
      paystackCustomerCode: "CUS_owner",
      cancelledAt: null,
      nextBillingDate: new Date("2026-09-19T19:00:00.000Z"),
      totalPaid: 14_900,
    };
    const service = new BillingService();
    vi.spyOn(service, "verifyPaystackTransaction").mockResolvedValue({
      valid: true,
      subscription: {
        status: "success",
        reference: "renewal_current_sub",
        amount: 14_900,
        currency: "ZAR",
        paid_at: "2026-09-19T19:00:00.000Z",
        subscription: { subscription_code: "SUB_current" },
        plan: { plan_code: "PLN_monthly" },
        customer: {
          email: "owner@example.com",
          customer_code: "CUS_owner",
        },
      },
    } as any);

    const result = await service.processPaystackSubscription(
      10,
      "renewal_current_sub",
      {
        source: "charge.success",
        expectedSubscriptionCode: "SUB_current",
        expectedCustomerCode: "CUS_owner",
      },
    );

    expect(result).toMatchObject({
      userId: 10,
      planId: 2,
      status: "active",
      paystackReference: "renewal_current_sub",
    });
    const ledgerWrites = state.txInserts.filter(
      (value) => value.platform === "paystack"
        && value.platformTransactionId === "renewal_current_sub",
    );
    expect(ledgerWrites).toHaveLength(1);
    expect(state.txInserts.filter(
      (value) => value.eventType === "subscription_activated",
    )).toHaveLength(1);
    expect(state.txInserts.some(
      (value) => value.eventType === "paystack_successful_payment_requires_review",
    )).toBe(false);
  });

  it("does not reactivate a subscription cancelled before renewal settlement", async () => {
    state.scenario = "trusted_renewal";
    state.topLevelAttemptPresent = false;
    state.subscription = {
      ...baseSubscription,
      status: "active",
      planId: 2,
      paystackCustomerCode: "CUS_owner",
      cancelledAt: new Date("2026-09-18T12:00:00.000Z"),
      nextBillingDate: new Date("2026-09-19T19:00:00.000Z"),
    };
    const service = new BillingService();
    vi.spyOn(service, "verifyPaystackTransaction").mockResolvedValue({
      valid: true,
      subscription: {
        status: "success",
        reference: "renewal_after_cancellation",
        amount: 14_900,
        currency: "ZAR",
        subscription: { subscription_code: "SUB_current" },
        plan: { plan_code: "PLN_monthly" },
        customer: {
          email: "owner@example.com",
          customer_code: "CUS_owner",
        },
      },
    } as any);

    await expect(service.processPaystackSubscription(
      10,
      "renewal_after_cancellation",
      {
        source: "charge.success",
        expectedSubscriptionCode: "SUB_current",
        expectedCustomerCode: "CUS_owner",
      },
    )).rejects.toThrow(
      "Verified Paystack payment requires financial review: renewal_subscription_state_changed",
    );

    expect(state.txUpdates).toBe(0);
    expect(state.txInserts).toHaveLength(1);
    expect(state.txInserts[0]).toMatchObject({
      eventType: "paystack_successful_payment_requires_review",
      processed: false,
      eventData: {
        reason: "renewal_subscription_state_changed",
        currentSubscriptionCancelledAt: new Date("2026-09-18T12:00:00.000Z"),
      },
    });
  });

  it.each([
    ["subscription.disable", "cancelSubscription"],
    ["subscription.not_renew", "markSubscriptionNotRenewing"],
  ] as const)(
    "rejects %s when the active identity changes after webhook pre-resolution",
    async (source, method) => {
      state.scenario = "lifecycle_stale";
      state.subscription = {
        ...baseSubscription,
        status: "active",
        planId: 2,
        paystackCustomerCode: "CUS_owner",
        cancelledAt: null,
      };
      const service = new BillingService();
      const context = {
        expectedSubscriptionCode: "SUB_old",
        expectedCustomerCode: "CUS_owner",
        source,
      };

      const result = method === "cancelSubscription"
        ? await service.cancelSubscription(10, context)
        : await service.markSubscriptionNotRenewing(10, context);

      expect(result).toBe(method === "cancelSubscription" ? false : null);
      expect(state.txUpdates).toBe(0);
      expect(state.txInserts).toHaveLength(1);
      expect(state.txInserts[0]).toMatchObject({
        userId: 10,
        eventType: "paystack_lifecycle_event_rejected",
        processed: false,
        eventData: {
          source,
          reason: "stale_subscription_identity",
          expectedSubscriptionCode: "SUB_old",
          activeSubscriptionCode: "SUB_new_checkout",
        },
      });
    },
  );
});