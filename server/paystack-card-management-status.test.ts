import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { billingEvents, paystackSubscriptionIdentities } from "@shared/schema";
import { cardManagementExplanation } from "@shared/paystack-card-management";

const state = vi.hoisted(() => ({
  identities: [] as any[], pending: false, schemaReady: true,
}));
vi.mock("./storage", () => ({ storage: { getSubscriptionPlan: vi.fn(async () => ({ paystackPlanCode: "PLN_first" })) } }));
vi.mock("./vite", () => ({ log: vi.fn() }));
vi.mock("./email-service", () => ({ emailService: null }));
vi.mock("./paystack-billing-schema", () => ({
  getPaystackBillingSchemaReadiness: vi.fn(async () => ({ ready: state.schemaReady })),
}));
vi.mock("./db", () => ({
  db: {
    select: () => {
      let table: any;
      const chain: any = {
        from: (value: any) => { table = value; return chain; },
        where: () => chain,
        limit: async () => table === paystackSubscriptionIdentities ? state.identities
          : table === billingEvents && state.pending ? [{ id: 1 }] : [],
      };
      return chain;
    },
  },
}));
import { BillingService } from "./billing-service";

function harness(overrides = {}) {
  const service = Object.create(BillingService.prototype) as BillingService;
  const provider = {
    subscription: { create: vi.fn(), get: vi.fn(), list: vi.fn(), disable: vi.fn() },
    transaction: { charge: vi.fn(), initialize: vi.fn() },
  };
  (service as any).paystack = provider;
  vi.spyOn(service, "getUserSubscription").mockResolvedValue({
    userId: 7, status: "active", planId: 1,
    paystackReference: "first_payment", paystackCustomerCode: "CUS_first",
    lastPaymentDate: new Date(), nextBillingDate: new Date(Date.now() + 86400000),
    ...overrides,
  } as any);
  return { service, provider };
}
const trusted = { status: "active", subscriptionCode: "SUB_first", customerCode: "CUS_first", planCode: "PLN_first" };

beforeEach(() => {
  state.identities = [];
  state.pending = false;
  state.schemaReady = true;
  vi.stubEnv("PAYSTACK_SUBSCRIPTION_MANAGEMENT_LINK_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());

describe("first-subscriber card management status", () => {
  it("changes from pending to ready from persisted exact trust, without provider calls", async () => {
    const { service, provider } = harness();
    expect(await service.getPaystackCardManagementStatus(7)).toBe("pending");
    state.identities = [trusted];
    expect(await service.getPaystackCardManagementStatus(7)).toBe("ready");
    expect(await harness().service.getPaystackCardManagementStatus(7)).toBe("ready");
    for (const calls of [provider.subscription, provider.transaction]) {
      for (const fn of Object.values(calls)) expect(fn).not.toHaveBeenCalled();
    }
  });

  it("waits for a payment-linked unresolved event, but otherwise requires review", async () => {
    state.identities = [{ ...trusted, status: "unresolved" }];
    const { service } = harness();
    expect(await service.getPaystackCardManagementStatus(7)).toBe("review_required");
    state.pending = true;
    expect(await service.getPaystackCardManagementStatus(7)).toBe("pending");
  });

  it.each([
    [trusted, { ...trusted, subscriptionCode: "SUB_duplicate" }],
    [{ ...trusted, customerCode: "CUS_other" }],
    [{ ...trusted, planCode: "PLN_other" }],
  ])("fails closed for ambiguous or mismatched identities %#", async (...identities) => {
    state.identities = identities;
    expect(await harness().service.getPaystackCardManagementStatus(7)).toBe("review_required");
  });

  it.each([
    { status: "trial" }, { status: "cancelled" }, { status: "expired" },
    { cancelledAt: new Date() }, { cancellationRequestedAt: new Date() },
    { googlePlayPurchaseToken: "play-token" }, { appleOriginalTransactionId: "apple-id" },
    { paystackReference: null, paystackCustomerCode: null }, { lastPaymentDate: null },
  ])("does not expose Paystack controls outside paid uncancelled Paystack subscriptions %#", async (overrides) => {
    state.identities = [trusted];
    expect(await harness(overrides).service.getPaystackCardManagementStatus(7)).toBe("hidden");
  });

  it("honors the release gate even with trusted identity", async () => {
    state.identities = [trusted];
    vi.stubEnv("PAYSTACK_SUBSCRIPTION_MANAGEMENT_LINK_ENABLED", "false");
    expect(await harness().service.getPaystackCardManagementStatus(7)).toBe("disabled");
    expect(cardManagementExplanation("disabled", false)).toContain("temporarily unavailable");
  });

  it("explains unavailable schema without claiming a reconciliation is running", async () => {
    state.schemaReady = false;
    expect(await harness().service.getPaystackCardManagementStatus(7)).toBe("unavailable");
    expect(cardManagementExplanation("pending", false)).not.toMatch(/checking|being checked|reconciling/i);
    expect(cardManagementExplanation("pending", true)).toContain("Automatic refresh has stopped");
  });
});
