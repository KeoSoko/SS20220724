import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  identity: null as any,
  events: [] as any[],
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
vi.mock("./db", () => ({
  db: {
    transaction: async (callback: (tx: any) => Promise<any>) => callback({
      execute: vi.fn().mockResolvedValue({}),
      select: () => {
        const chain: any = {
          from: () => chain,
          where: () => chain,
          orderBy: () => chain,
          limit: () => chain,
          for: async () => state.identity ? [state.identity] : [],
        };
        return chain;
      },
      insert: () => ({
        values: async (value: any) => {
          state.events.push(value);
          return {};
        },
      }),
    }),
  },
}));

import { BillingService } from "./billing-service";
import { storage } from "./storage";

const localSubscription = {
  id: 11,
  userId: 42,
  planId: 3,
  status: "active",
  paystackCustomerCode: "CUS_owner",
};
const identity = {
  id: 7,
  userId: 42,
  subscriptionCode: "SUB_owner",
  customerCode: "CUS_owner",
  planCode: "PLN_monthly",
  status: "active",
  providerCreatedAt: new Date(),
  createdAt: new Date(),
};

function providerFor(data: any) {
  const create = vi.fn();
  const charge = vi.fn();
  return {
    subscription: {
      get: vi.fn().mockResolvedValue({ status: true, data }),
      create,
    },
    transaction: { charge },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.identity = identity;
  state.events.length = 0;
  process.env.PAYSTACK_SECRET_KEY = "test_key";
  vi.mocked(storage.getUserSubscription).mockResolvedValue(localSubscription as any);
  vi.mocked(storage.getSubscriptionPlan).mockResolvedValue({
    id: 3,
    paystackPlanCode: "PLN_monthly",
  } as any);
});

describe("Paystack hosted subscription management", () => {
  it("returns a hosted link for a trusted subscription needing a payment-method update without checkout", async () => {
    const provider = providerFor({
      subscription_code: "SUB_owner",
      customer: { customer_code: "CUS_owner" },
      plan: { plan_code: "PLN_monthly" },
      status: "attention",
      authorization: { authorization_code: "AUTH_old", reusable: false },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: true,
      data: { link: "https://paystack.example/manage/SUB_owner" },
    }), { status: 200 })));
    const service = new BillingService();
    (service as any).paystack = provider;

    await expect(service.createPaystackSubscriptionManagementLink(42)).resolves.toEqual({
      outcome: "ready",
      url: "https://paystack.example/manage/SUB_owner",
    });
    expect(provider.subscription.create).not.toHaveBeenCalled();
    expect(provider.transaction.charge).not.toHaveBeenCalled();
    expect(state.events[0]).toMatchObject({
      eventType: "paystack_subscription_management_link_requested",
      eventData: { subscriptionCode: "SUB_owner", recurringReadiness: "not_ready" },
    });
  });

  it("refuses a provider subscription that belongs to another customer", async () => {
    const provider = providerFor({
      subscription_code: "SUB_owner",
      customer: { customer_code: "CUS_other" },
      plan: { plan_code: "PLN_monthly" },
      status: "attention",
      authorization: { reusable: false },
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const service = new BillingService();
    (service as any).paystack = provider;

    await expect(service.createPaystackSubscriptionManagementLink(42)).resolves.toEqual({
      outcome: "manual_review_required",
      reason: "provider_subscription_customer_or_plan_mismatch",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(provider.subscription.create).not.toHaveBeenCalled();
  });
});