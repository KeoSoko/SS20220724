import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  transactionInserts: [] as any[],
  billingEventInserts: [] as any[],
}));

vi.mock("./storage", () => ({
  storage: {
    getUserSubscription: vi.fn(),
    getSubscriptionPlan: vi.fn(),
  },
}));
vi.mock("./vite", () => ({ log: vi.fn() }));
vi.mock("./email-service", () => ({ emailService: null }));
vi.mock("./db", () => {
  const emptySelect = () => {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: async () => [],
    };
    return chain;
  };
  const transaction = async (callback: (tx: any) => Promise<any>) => callback({
    execute: vi.fn().mockResolvedValue({}),
    select: emptySelect,
    update: () => {
      const chain: any = {
        set: () => chain,
        where: () => chain,
        returning: async () => [],
      };
      return chain;
    },
    insert: () => {
      let values: any;
      const chain: any = {
        values: (input: any) => {
          values = input;
          state.transactionInserts.push(input);
          return chain;
        },
        onConflictDoUpdate: () => chain,
        returning: async () => [{ id: 1, ...values }],
      };
      return chain;
    },
  });

  return {
    db: {
      select: vi.fn(emptySelect),
      transaction,
      insert: () => ({
        values: async (input: any) => {
          state.billingEventInserts.push(input);
          return {};
        },
      }),
    },
  };
});

import { BillingService } from "./billing-service";
import { storage } from "./storage";

const localSubscription = {
  id: 11,
  userId: 42,
  planId: 3,
  status: "active",
  paystackCustomerCode: "CUS_customer",
  nextBillingDate: new Date("2026-08-01T00:00:00.000Z"),
};
const providerCandidate = {
  subscription_code: "SUB_attention",
  customer: { customer_code: "CUS_customer" },
  plan: { plan_code: "PLN_monthly" },
  status: "attention",
  created_at: "2026-07-01T00:00:00.000Z",
};

function setupProvider() {
  const charge = vi.fn();
  const create = vi.fn();
  const disable = vi.fn();
  const provider = {
    customer: { get: vi.fn().mockResolvedValue({ status: true, data: { id: 123 } }) },
    subscription: {
      list: vi.fn().mockResolvedValue({ status: true, data: [providerCandidate] }),
      get: vi.fn().mockResolvedValue({
        status: true,
        data: {
          ...providerCandidate,
          most_recent_invoice: {
            invoice_code: "INV_due",
            paid: false,
            due_date: "2026-08-01T00:00:00.000Z",
          },
        },
      }),
      create,
      disable,
    },
    transaction: { charge },
  };
  return { provider, charge, create, disable };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.transactionInserts.length = 0;
  state.billingEventInserts.length = 0;
  vi.mocked(storage.getUserSubscription).mockResolvedValue(localSubscription as any);
  vi.mocked(storage.getSubscriptionPlan).mockResolvedValue({
    id: 3,
    paystackPlanCode: "PLN_monthly",
  } as any);
});

describe("support Paystack subscription resolution", () => {
  it("fails closed when the local plan does not identify its Paystack plan", async () => {
    vi.mocked(storage.getSubscriptionPlan).mockResolvedValue({
      id: 3,
      paystackPlanCode: null,
    } as any);
    const { provider } = setupProvider();
    const service = new BillingService();
    (service as any).paystack = provider;

    await expect(service.inspectPaystackSubscriptionCandidates(42)).resolves.toEqual({
      available: false,
      reason: "missing_paystack_plan_code",
    });
    expect(provider.customer.get).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation before any provider inspection or identity mutation", async () => {
    const { provider } = setupProvider();
    const service = new BillingService();
    (service as any).paystack = provider;

    await expect(service.resolvePaystackSubscriptionIdentity(42, "SUB_attention", {
      confirmed: false,
      adminUserId: 9,
    })).resolves.toEqual({
      outcome: "confirmation_required",
      reason: "explicit_confirmation_required",
    });
    expect(provider.customer.get).not.toHaveBeenCalled();
    expect(state.billingEventInserts[0]).toMatchObject({
      eventType: "paystack_subscription_resolution_confirmation_required",
      eventData: { adminUserId: 9, selectedSubscriptionCode: "SUB_attention" },
    });
  });

  it("uses only provider reads and records the confirmed support decision", async () => {
    const { provider, charge, create, disable } = setupProvider();
    const service = new BillingService();
    (service as any).paystack = provider;

    await expect(service.resolvePaystackSubscriptionIdentity(42, "SUB_attention", {
      confirmed: true,
      adminUserId: 9,
    })).resolves.toMatchObject({
      outcome: "resolved",
      selectedSubscriptionCode: "SUB_attention",
      providerStatus: "attention",
    });

    expect(provider.customer.get).toHaveBeenCalledWith("CUS_customer");
    expect(provider.subscription.list).toHaveBeenCalledWith({ customer: 123, perPage: 100 });
    expect(provider.subscription.get).toHaveBeenCalledWith("SUB_attention");
    expect(charge).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(disable).not.toHaveBeenCalled();
    expect(state.transactionInserts).toContainEqual(expect.objectContaining({
      eventType: "paystack_subscription_identified",
      eventData: expect.objectContaining({
        subscriptionCode: "SUB_attention",
        source: "support_duplicate_resolution",
        adminUserId: 9,
      }),
    }));
    expect(state.billingEventInserts).toContainEqual(expect.objectContaining({
      eventType: "paystack_subscription_identity_resolved_by_support",
      eventData: expect.objectContaining({
        selectedSubscriptionCode: "SUB_attention",
        adminUserId: 9,
        providerMutation: "none",
      }),
    }));
  });

  it("refuses provider details that replace the SUB code selected from the candidate list", async () => {
    const { provider } = setupProvider();
    provider.subscription.get.mockResolvedValue({
      status: true,
      data: {
        ...providerCandidate,
        subscription_code: "SUB_different",
      },
    });
    const service = new BillingService();
    (service as any).paystack = provider;

    await expect(service.resolvePaystackSubscriptionIdentity(42, "SUB_attention", {
      confirmed: true,
      adminUserId: 9,
    })).resolves.toEqual({
      outcome: "unresolved",
      reason: "selected_subscription_not_a_viable_candidate",
    });
    expect(state.transactionInserts).toHaveLength(0);
  });

  it.each([
    ["throws", (get: any) => get.mockRejectedValue(new Error("provider timeout"))],
    ["is unsuccessful", (get: any) => get.mockResolvedValue({ status: false })],
    ["is empty", (get: any) => get.mockResolvedValue({ status: true, data: null })],
  ])("keeps an unverifiable candidate visible but refuses to select it when detail lookup %s", async (_case, configure) => {
    const { provider } = setupProvider();
    configure(provider.subscription.get);
    const service = new BillingService();
    (service as any).paystack = provider;

    await expect(service.inspectPaystackSubscriptionCandidates(42)).resolves.toMatchObject({
      available: true,
      candidates: [expect.objectContaining({
        subscriptionCode: "SUB_attention",
        providerLookupFailed: true,
      })],
    });
    await expect(service.resolvePaystackSubscriptionIdentity(42, "SUB_attention", {
      confirmed: true,
      adminUserId: 9,
    })).resolves.toEqual({
      outcome: "unresolved",
      reason: "selected_subscription_detail_unavailable",
    });
    expect(state.transactionInserts).toHaveLength(0);
  });
});