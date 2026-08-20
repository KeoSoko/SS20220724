import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  attempts: [] as any[],
  subscription: null as any,
  inserts: 0,
  activeIdentity: null as any,
  queue: Promise.resolve() as Promise<void>,
  nextId: 1,
}));

vi.mock("./storage", () => ({
  storage: {
    getUserSubscription: vi.fn(),
    getSubscriptionPlan: vi.fn(),
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
  function createTx() {
    let selectOrdinal = 0;
    return {
      execute: vi.fn().mockResolvedValue({}),
      select: () => {
        selectOrdinal += 1;
        let fromTable: any;
        const chain: any = {
          from: (table: any) => {
            fromTable = table;
            return chain;
          },
          where: () => chain,
          orderBy: () => chain,
          limit: async () => {
            if (fromTable?.[Symbol.for("drizzle:Name")] === "paystack_subscription_identities") {
              return state.activeIdentity ? [state.activeIdentity] : [];
            }
            const rows = selectOrdinal === 1
              ? (state.subscription ? [state.subscription] : [])
              : state.attempts.filter((attempt) => attempt.status === "pending");
            return rows.slice(0, 1);
          },
        };
        return chain;
      },
      insert: () => {
        let values: any;
        const chain: any = {
          values: (input: any) => {
            values = input;
            return chain;
          },
          onConflictDoNothing: () => chain,
          returning: async () => {
            const pending = state.attempts.find(
              (attempt) => attempt.billingOwnerUserId === values.billingOwnerUserId
                && attempt.status === "pending",
            );
            if (pending) return [];
            const created = { id: state.nextId++, ...values };
            state.attempts.push(created);
            state.inserts += 1;
            return [created];
          },
        };
        return chain;
      },
    };
  }

  return {
    db: {
      select: () => {
        const chain: any = {
          from: () => chain,
          where: () => chain,
          orderBy: () => chain,
          limit: async () => state.activeIdentity ? [state.activeIdentity] : [],
        };
        return chain;
      },
      transaction: async (callback: (tx: any) => Promise<any>) => {
        const previous = state.queue;
        let release!: () => void;
        state.queue = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        try {
          return await callback(createTx());
        } finally {
          release();
        }
      },
      update: () => {
        let updateValues: any;
        const chain: any = {
          set: (values: any) => {
            updateValues = values;
            return chain;
          },
          where: () => chain,
          returning: async () => {
            const attempt = state.attempts.find((candidate) => candidate.status === "pending");
            if (!attempt) return [];
            Object.assign(attempt, updateValues);
            return [attempt];
          },
        };
        return chain;
      },
    },
  };
});

import { BillingService } from "./billing-service";
import { storage } from "./storage";

const checkoutInput = (planId = 2) => ({
  billingOwnerUserId: 10,
  requestedByUserId: 10,
  planId,
  amount: 14_900,
  currency: "ZAR",
  paystackPlanCode: "PLN_monthly",
  customerEmail: "owner@example.com",
});

beforeEach(() => {
  state.attempts.length = 0;
  state.subscription = null;
  state.inserts = 0;
  state.activeIdentity = null;
  state.queue = Promise.resolve();
  state.nextId = 1;
  vi.mocked(storage.getUserSubscription).mockImplementation(async () => state.subscription);
  vi.mocked(storage.getSubscriptionPlan).mockResolvedValue({
    id: 2,
    paystackPlanCode: "PLN_monthly",
  } as any);
});

describe("server-owned Paystack checkout attempts", () => {
  it("serializes simultaneous browser sessions into one attempt and one reference", async () => {
    const service = new BillingService();
    const results = await Promise.all(
      Array.from({ length: 12 }, () => service.createOrReusePaystackCheckoutAttempt(checkoutInput())),
    );

    const references = results
      .filter((result) => result.outcome !== "checkout_blocked")
      .map((result: any) => result.attempt.paystackReference);
    expect(new Set(references).size).toBe(1);
    expect(state.inserts).toBe(1);
    expect(state.attempts).toHaveLength(1);
    expect(results.filter((result) => result.outcome === "created")).toHaveLength(1);
    expect(results.filter((result) => result.outcome === "reused")).toHaveLength(11);
  });

  it("reuses the original attempt after a lost browser response", async () => {
    const service = new BillingService();
    const first = await service.createOrReusePaystackCheckoutAttempt(checkoutInput());
    const retry = await service.createOrReusePaystackCheckoutAttempt(checkoutInput(3));

    expect(first.outcome).toBe("created");
    expect(retry.outcome).toBe("reused");
    expect((retry as any).attempt.paystackReference).toBe((first as any).attempt.paystackReference);
    expect((retry as any).attempt.planId).toBe(2);
    expect(state.inserts).toBe(1);
  });

  it("blocks generic checkout for a currently paid subscription", async () => {
    state.subscription = {
      id: 99,
      userId: 10,
      status: "active",
      nextBillingDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
    const service = new BillingService();
    const result = await service.createOrReusePaystackCheckoutAttempt(checkoutInput());

    expect(result.outcome).toBe("checkout_blocked");
    expect(state.inserts).toBe(0);
  });

  it("blocks generic checkout while an overdue active renewal can still settle", async () => {
    state.subscription = {
      id: 99,
      userId: 10,
      status: "active",
      nextBillingDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    };
    const service = new BillingService();
    const result = await service.createOrReusePaystackCheckoutAttempt(checkoutInput());

    expect(result).toMatchObject({
      outcome: "checkout_blocked",
      reason: "active_paid_subscription",
    });
    expect(state.inserts).toBe(0);
  });

  it("allows one deliberate recovery checkout only for a due active plan without an identity", async () => {
    state.subscription = {
      id: 99,
      userId: 10,
      planId: 2,
      status: "active",
      paystackCustomerCode: "CUS_owner",
      nextBillingDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      cancelledAt: null,
    };
    const service = new BillingService();
    (service as any).paystack = {
      customer: { get: vi.fn().mockResolvedValue({ status: true, data: { id: 101 } }) },
      subscription: {
        list: vi.fn().mockResolvedValue({
          status: true,
          data: [],
          meta: { total: 0, page: 1, pageCount: 1 },
        }),
      },
    };
    const results = await Promise.all(
      Array.from({ length: 8 }, () => service.createOrReusePaystackCheckoutAttempt({
        ...checkoutInput(),
        allowRenewalSetupRecovery: true,
      })),
    );

    expect(results.filter((result) => result.outcome === "created")).toHaveLength(1);
    expect(results.filter((result) => result.outcome === "reused")).toHaveLength(7);
    expect(state.inserts).toBe(1);
  });

  it("fails closed when the locked provider reinspection finds a subscription", async () => {
    state.subscription = {
      id: 99,
      userId: 10,
      planId: 2,
      status: "active",
      paystackCustomerCode: "CUS_owner",
      nextBillingDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      cancelledAt: null,
    };
    const list = vi.fn().mockResolvedValue({
      status: true,
      data: [{
        subscription_code: "SUB_provider",
        status: "active",
        customer: { customer_code: "CUS_owner" },
        plan: { plan_code: "PLN_monthly" },
      }],
      meta: { total: 1, page: 1, pageCount: 1 },
    });
    const service = new BillingService();
    (service as any).paystack = {
      customer: { get: vi.fn().mockResolvedValue({ status: true, data: { id: 101 } }) },
      subscription: { list, get: vi.fn().mockResolvedValue({ status: true, data: {} }) },
    };

    const result = await service.createOrReusePaystackCheckoutAttempt({
      ...checkoutInput(),
      allowRenewalSetupRecovery: true,
    });

    expect(list).toHaveBeenCalledOnce();
    expect(result.outcome).toBe("checkout_blocked");
    expect(state.inserts).toBe(0);
  });

  it("rechecks the identity under the owner lock before recovery checkout", async () => {
    state.subscription = {
      id: 99,
      userId: 10,
      planId: 2,
      status: "active",
      nextBillingDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
      cancelledAt: null,
    };
    state.activeIdentity = { id: 3, userId: 10, subscriptionCode: "SUB_recovered", status: "active" };
    const service = new BillingService();
    const result = await service.createOrReusePaystackCheckoutAttempt({
      ...checkoutInput(),
      allowRenewalSetupRecovery: true,
    });

    expect(result).toMatchObject({
      outcome: "checkout_blocked",
      reason: "renewal_relationship_available",
    });
    expect(state.inserts).toBe(0);
  });

  it("blocks a second checkout while failed-renewal recovery is unresolved", async () => {
    state.subscription = {
      id: 99,
      userId: 10,
      status: "paused",
      nextBillingDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    };
    const service = new BillingService();
    const result = await service.createOrReusePaystackCheckoutAttempt(checkoutInput());

    expect(result).toMatchObject({
      outcome: "checkout_blocked",
      reason: "renewal_recovery_required",
    });
    expect(state.inserts).toBe(0);
  });

  it("refreshes an expired lease without ever minting a second reference", async () => {
    const service = new BillingService();
    const first = await service.createOrReusePaystackCheckoutAttempt(checkoutInput());
    expect(first.outcome).toBe("created");
    const originalReference = (first as any).attempt.paystackReference;
    state.attempts[0].expiresAt = new Date(Date.now() - 1_000);

    const refreshed = await service.refreshPaystackCheckoutAttemptAfterVerification(originalReference);
    const retry = await service.createOrReusePaystackCheckoutAttempt(checkoutInput(3));

    expect(refreshed?.paystackReference).toBe(originalReference);
    expect(refreshed?.status).toBe("pending");
    expect(refreshed!.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect((retry as any).attempt.paystackReference).toBe(originalReference);
    expect(state.attempts).toHaveLength(1);
    expect(state.inserts).toBe(1);
  });
});