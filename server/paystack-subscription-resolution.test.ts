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
vi.mock("./paystack-billing-schema", () => ({
  getPaystackBillingSchemaReadiness: vi.fn(async () => ({
    ready: true,
    missing: [],
    checkedAt: new Date(),
  })),
  requirePaystackBillingSchema: vi.fn(async () => undefined),
}));
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
import { db } from "./db";

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

describe("automatic legacy renewal relationship recovery", () => {
  it("derives setup recovery separately from an authoritative failed payment", async () => {
    const service = new BillingService();
    await expect(service.getPaystackRenewalStatus(42)).resolves.toEqual({
      state: "renewal_setup_required",
      recoveryCheckoutEligible: true,
      managementLinkEligible: false,
    });

    vi.mocked(storage.getUserSubscription).mockResolvedValue({
      ...localSubscription,
      status: "paused",
    } as any);
    await expect(service.getPaystackRenewalStatus(42)).resolves.toEqual({
      state: "payment_failed",
      recoveryCheckoutEligible: false,
      managementLinkEligible: false,
    });
  });

  it("records exactly one verified provider relationship without creating a charge or subscription", async () => {
    const { provider, charge, create, disable } = setupProvider();
    const service = new BillingService();
    (service as any).paystack = provider;

    await expect(service.recoverPaystackRenewalRelationship(42)).resolves.toEqual({
      outcome: "recovered",
      subscriptionCode: "SUB_attention",
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
        source: "automatic_legacy_renewal_recovery",
      }),
    }));
  });

  it("permits a recovery checkout only when Paystack confirms there is no subscription at all", async () => {
    const { provider, charge, create, disable } = setupProvider();
    provider.subscription.list.mockResolvedValue({ status: true, data: [] });
    const service = new BillingService();
    (service as any).paystack = provider;

    await expect(service.recoverPaystackRenewalRelationship(42)).resolves.toEqual({
      outcome: "no_verified_relationship",
    });

    expect(charge).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(disable).not.toHaveBeenCalled();
    expect(state.billingEventInserts).toContainEqual(expect.objectContaining({
      eventType: "renewal_setup_recovery_required",
      eventData: expect.objectContaining({
        reason: "no_verified_recurring_relationship",
      }),
    }));
  });

  it("fails closed for multiple plausible subscriptions or a provider relationship mismatch", async () => {
    const { provider, charge, create, disable } = setupProvider();
    const candidates = [
      providerCandidate,
      { ...providerCandidate, subscription_code: "SUB_second" },
    ];
    provider.subscription.list.mockResolvedValue({
      status: true,
      data: candidates,
    });
    provider.subscription.get.mockImplementation(async (subscriptionCode: string) => ({
      status: true,
      data: candidates.find((candidate) => candidate.subscription_code === subscriptionCode),
    }));
    const service = new BillingService();
    (service as any).paystack = provider;

    await expect(service.recoverPaystackRenewalRelationship(42)).resolves.toEqual({
      outcome: "manual_review_required",
      reason: "multiple_plausible_paystack_subscriptions",
    });
    expect(charge).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(disable).not.toHaveBeenCalled();

    provider.subscription.list.mockResolvedValue({
      status: true,
      data: [{
        ...providerCandidate,
        customer: { customer_code: "CUS_someone_else" },
      }],
    });
    const mismatchService = new BillingService();
    (mismatchService as any).paystack = provider;
    await expect(mismatchService.recoverPaystackRenewalRelationship(42)).resolves.toEqual({
      outcome: "manual_review_required",
      reason: "provider_subscription_customer_or_plan_mismatch",
    });
  });

  it("inspects later Paystack pages before deciding whether a relationship exists", async () => {
    const { provider, charge, create, disable } = setupProvider();
    const unrelatedSubscriptions = Array.from({ length: 100 }, (_, index) => ({
      ...providerCandidate,
      subscription_code: `SUB_other_${index}`,
      customer: { customer_code: "CUS_other" },
    }));
    provider.subscription.list
      .mockResolvedValueOnce({
        status: true,
        data: unrelatedSubscriptions,
        meta: { page: 1, pageCount: 2 },
      })
      .mockResolvedValueOnce({
        status: true,
        data: [providerCandidate],
        meta: { page: 2, pageCount: 2 },
      });
    const service = new BillingService();
    (service as any).paystack = provider;

    await expect(service.recoverPaystackRenewalRelationship(42)).resolves.toEqual({
      outcome: "recovered",
      subscriptionCode: "SUB_attention",
    });
    expect(provider.subscription.list).toHaveBeenNthCalledWith(1, {
      customer: 123,
      perPage: 100,
    });
    expect(provider.subscription.list).toHaveBeenNthCalledWith(2, {
      customer: 123,
      perPage: 100,
      page: 2,
    });
    expect(charge).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(disable).not.toHaveBeenCalled();
  });

  it("fails closed when Paystack returns a full page without pagination proof", async () => {
    const { provider, charge, create, disable } = setupProvider();
    provider.subscription.list.mockResolvedValue({
      status: true,
      data: Array.from({ length: 100 }, (_, index) => ({
        ...providerCandidate,
        subscription_code: `SUB_unknown_${index}`,
        customer: { customer_code: "CUS_other" },
      })),
    });
    const service = new BillingService();
    (service as any).paystack = provider;

    await expect(service.recoverPaystackRenewalRelationship(42)).resolves.toEqual({
      outcome: "reconciling",
      reason: "paystack_subscription_list_pagination_unresolved",
    });
    expect(charge).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(disable).not.toHaveBeenCalled();
  });

  it("fails closed when Paystack pagination metadata contradicts its returned page", async () => {
    const { provider, charge, create, disable } = setupProvider();
    provider.subscription.list.mockResolvedValue({
      status: true,
      data: Array.from({ length: 100 }, (_, index) => ({
        ...providerCandidate,
        subscription_code: `SUB_unknown_${index}`,
        customer: { customer_code: "CUS_other" },
      })),
      meta: { page: 1, pageCount: 1, total: 101 },
    });
    const service = new BillingService();
    (service as any).paystack = provider;

    await expect(service.recoverPaystackRenewalRelationship(42)).resolves.toEqual({
      outcome: "reconciling",
      reason: "paystack_subscription_list_pagination_unresolved",
    });
    expect(charge).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(disable).not.toHaveBeenCalled();
  });

  // Regression: unknown readiness must never alias automatic_renewal_active or
  // reconciling merely because the billing date is in the future.
  const futureBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  it("maps unknown readiness + future billing date to subscription_active, not reconciling or automatic_renewal_active", async () => {
    vi.mocked(storage.getUserSubscription).mockResolvedValue({
      ...localSubscription,
      nextBillingDate: futureBillingDate,
    } as any);
    const service = new BillingService();
    vi.spyOn(service as any, "getActivePaystackSubscriptionIdentity")
      .mockResolvedValue({ recurringReadiness: "unknown", subscriptionCode: "SUB_legacy" });

    const result = await service.getPaystackRenewalStatus(42);
    expect(result.state).toBe("subscription_active");
    expect(result.state).not.toBe("automatic_renewal_active");
    expect(result.state).not.toBe("reconciling");
    expect(result).toEqual({ state: "subscription_active", recoveryCheckoutEligible: false, managementLinkEligible: false });
  });

  it("maps ready readiness + future billing date to automatic_renewal_active, not subscription_active", async () => {
    vi.mocked(storage.getUserSubscription).mockResolvedValue({
      ...localSubscription,
      nextBillingDate: futureBillingDate,
    } as any);
    const service = new BillingService();
    vi.spyOn(service as any, "getActivePaystackSubscriptionIdentity")
      .mockResolvedValue({ recurringReadiness: "ready", subscriptionCode: "SUB_verified" });

    const result = await service.getPaystackRenewalStatus(42);
    expect(result.state).toBe("automatic_renewal_active");
    expect(result.state).not.toBe("subscription_active");
    expect(result).toEqual({ state: "automatic_renewal_active", recoveryCheckoutEligible: false, managementLinkEligible: false });
  });

  it("maps unknown readiness + future billing + active reconciliation event to reconciling, not subscription_active", async () => {
    vi.mocked(storage.getUserSubscription).mockResolvedValue({
      ...localSubscription,
      nextBillingDate: futureBillingDate,
    } as any);
    const service = new BillingService();
    vi.spyOn(service as any, "getActivePaystackSubscriptionIdentity")
      .mockResolvedValue({ recurringReadiness: "unknown", subscriptionCode: "SUB_legacy" });
    vi.mocked(db.select).mockImplementationOnce(() => {
      const chain: any = {
        from: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: async () => [{ eventType: "renewal_reconciliation_pending" }],
      };
      return chain;
    });

    const result = await service.getPaystackRenewalStatus(42);
    expect(result.state).toBe("reconciling");
    expect(result.state).not.toBe("subscription_active");
    expect(result).toEqual({ state: "reconciling", recoveryCheckoutEligible: false, managementLinkEligible: false });
  });

  it("routes unknown readiness + overdue billing through setup-required path, not reconciling", async () => {
    // localSubscription.nextBillingDate (2026-08-01) is already overdue
    const service = new BillingService();
    vi.spyOn(service as any, "getActivePaystackSubscriptionIdentity")
      .mockResolvedValue({ recurringReadiness: "unknown", subscriptionCode: "SUB_legacy" });

    const result = await service.getPaystackRenewalStatus(42);
    expect(result.state).toBe("renewal_setup_required");
    expect(result.state).not.toBe("reconciling");
    expect(result.state).not.toBe("subscription_active");
    expect(result).toEqual({ state: "renewal_setup_required", recoveryCheckoutEligible: true, managementLinkEligible: false });
  });
});