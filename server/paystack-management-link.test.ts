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
    select: () => {
      const chain: any = {
        from: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: async () => state.identity ? [state.identity] : [],
      };
      return chain;
    },
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

function providerFor(
  data: any,
  listedSubscriptions: any[] = [data],
  detailsBySubscriptionCode: Record<string, any> = {},
) {
  const create = vi.fn();
  const charge = vi.fn();
  return {
    customer: {
      get: vi.fn().mockResolvedValue({ status: true, data: { id: 501 } }),
    },
    subscription: {
      get: vi.fn().mockImplementation(async (subscriptionCode: string) => ({
        status: true,
        data: detailsBySubscriptionCode[subscriptionCode] ?? data,
      })),
      list: vi.fn().mockResolvedValue({
        status: true,
        data: listedSubscriptions,
        meta: { total: listedSubscriptions.length, page: 1, pageCount: 1 },
      }),
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
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: true,
      data: { link: "https://paystack.com/manage/subscriptions/SUB_owner?subscription_token=safe-token" },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
    const service = new BillingService();
    (service as any).paystack = provider;

    await expect(service.createPaystackSubscriptionManagementLink(42)).resolves.toEqual({
      outcome: "ready",
      url: "https://paystack.com/manage/subscriptions/SUB_owner?subscription_token=safe-token",
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.paystack.co/subscription/SUB_owner/manage/link",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer test_key" }),
      }),
    );
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

  it("fails closed when the provider lists more than one viable subscription", async () => {
    const ownerSubscription = {
      subscription_code: "SUB_owner",
      customer: { customer_code: "CUS_owner" },
      plan: { plan_code: "PLN_monthly" },
      status: "attention",
      authorization: { authorization_code: "AUTH_old", reusable: false },
    };
    const duplicateSubscription = {
      subscription_code: "SUB_duplicate",
      customer: { customer_code: "CUS_owner" },
      plan: { plan_code: "PLN_monthly" },
      status: "active",
    };
    const provider = providerFor(ownerSubscription, [
      ownerSubscription,
      duplicateSubscription,
    ], {
      SUB_owner: ownerSubscription,
      SUB_duplicate: duplicateSubscription,
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const service = new BillingService();
    (service as any).paystack = provider;

    await expect(service.createPaystackSubscriptionManagementLink(42)).resolves.toEqual({
      outcome: "manual_review_required",
      reason: "provider_subscription_relationship_ambiguous",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(provider.subscription.create).not.toHaveBeenCalled();
    expect(provider.transaction.charge).not.toHaveBeenCalled();
  });

  it.each([
    ["missing URL", { status: true, data: {} }],
    ["malformed URL", { status: true, data: { link: "https://evil.example/manage/subscriptions/SUB_owner" } }],
    ["provider-declared failure", { status: false, data: { link: "https://paystack.com/manage/subscriptions/SUB_owner" } }],
  ])("returns a controlled error for a %s response without a fallback checkout", async (_label, responseBody) => {
    const provider = providerFor({
      subscription_code: "SUB_owner",
      customer: { customer_code: "CUS_owner" },
      plan: { plan_code: "PLN_monthly" },
      status: "attention",
      authorization: { authorization_code: "AUTH_old", reusable: false },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(responseBody), { status: 200 })));
    const service = new BillingService();
    (service as any).paystack = provider;

    await expect(service.createPaystackSubscriptionManagementLink(42)).resolves.toEqual({
      outcome: "reconciling",
      reason: "paystack_management_link_invalid",
    });
    expect(provider.subscription.create).not.toHaveBeenCalled();
    expect(provider.transaction.charge).not.toHaveBeenCalled();
  });

  it("keeps the account reconciling when the management-link request fails", async () => {
    const provider = providerFor({
      subscription_code: "SUB_owner",
      customer: { customer_code: "CUS_owner" },
      plan: { plan_code: "PLN_monthly" },
      status: "attention",
      authorization: { authorization_code: "AUTH_old", reusable: false },
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("provider timeout")));
    const service = new BillingService();
    (service as any).paystack = provider;

    await expect(service.createPaystackSubscriptionManagementLink(42)).resolves.toEqual({
      outcome: "reconciling",
      reason: "paystack_management_link_unavailable",
    });
    expect(provider.subscription.create).not.toHaveBeenCalled();
    expect(provider.transaction.charge).not.toHaveBeenCalled();
  });
});