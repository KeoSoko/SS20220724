import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./storage", () => ({ storage: {} }));
vi.mock("./vite", () => ({ log: vi.fn() }));
vi.mock("./email-service", () => ({ emailService: null }));
vi.mock("./growth-event-service", () => ({ recordGrowthEventBestEffort: vi.fn() }));
vi.mock("./db", () => ({ db: { transaction: vi.fn(), select: vi.fn() } }));
vi.mock("./paystack-billing-schema", () => ({
  requirePaystackBillingSchema: vi.fn(async () => undefined),
  getPaystackBillingSchemaReadiness: vi.fn(async () => ({ ready: true, missing: [] })),
}));

import { BillingService } from "./billing-service";
import { db } from "./db";
import {
  billingEvents,
  paystackCancellationAttempts,
  paystackSubscriptionIdentities,
  userSubscriptions,
  paystackCheckoutAttempts,
} from "@shared/schema";

function harness() {
  const review = {
    id: 1,
    processed: false,
    eventData: {
      supersededSubscriptionCode: "SUB_old",
      authoritativeSubscriptionCode: "SUB_team",
      supersededPlanCode: "PLN_individual",
      authoritativePlanCode: "PLN_team",
      customerCode: "CUS_owner",
    },
  };
  const identities = [
    { userId: 7, subscriptionCode: "SUB_old", customerCode: "CUS_owner", planCode: "PLN_individual", status: "retired" },
    { userId: 7, subscriptionCode: "SUB_team", customerCode: "CUS_owner", planCode: "PLN_team", status: "active", recurringReadiness: "ready" },
  ];
  let attempt: any = null;
  const events: any[] = [];
  let lock = Promise.resolve();
  // Serialize transaction bodies like the real per-owner advisory lock.
  vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
    const previous = lock;
    let release!: () => void;
    lock = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const tx = {
      execute: vi.fn(async () => undefined),
      select: () => {
        let table: any;
        const rows = () => table === billingEvents
          ? (review.processed ? [] : [review])
          : table === paystackSubscriptionIdentities ? identities
            : table === paystackCancellationAttempts && attempt ? [attempt] : [];
        const chain: any = {
          from: (input: any) => { table = input; return chain; },
          where: () => chain,
          orderBy: () => chain,
          limit: async () => rows(),
          then: (resolve: any, reject: any) => Promise.resolve(rows()).then(resolve, reject),
        };
        return chain;
      },
      insert: (table: any) => ({
        values: (input: any) => {
          if (table === paystackCancellationAttempts) {
            attempt = { id: 2, ...input };
            return { returning: async () => [attempt] };
          }
          events.push(input);
          return Promise.resolve();
        },
      }),
      update: (table: any) => ({
        set: (input: any) => ({
          where: async () => {
            Object.assign(table === billingEvents ? review : attempt, input);
          },
        }),
      }),
    };
    try { return await callback(tx); } finally { release(); }
  });
  const oldProvider: any = {
    subscription_code: "SUB_old",
    customer: { customer_code: "CUS_owner" },
    plan: { plan_code: "PLN_individual" },
    status: "active",
    email_token: "test-only-email-token",
  };
  const newProvider: any = {
    subscription_code: "SUB_team",
    customer: { customer_code: "CUS_owner" },
    plan: { plan_code: "PLN_team" },
    status: "active",
  };
  const get = vi.fn(async (code: string) => ({
    status: true, data: { ...(code === "SUB_old" ? oldProvider : newProvider) },
  }));
  const disable = vi.fn(async () => {
    oldProvider.status = "non-renewing";
    return { status: true };
  });
  const service = Object.create(BillingService.prototype) as BillingService;
  (service as any).paystack = { subscription: { get, disable } };
  return { service, review, identities, events, oldProvider, newProvider, get, disable, getAttempt: () => attempt };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PAYSTACK_AUTOMATIC_SUPERSEDED_RETIREMENT_ENABLED", "true");
});

describe("superseded subscription provider retirement", () => {
  it("disables only the old subscription using its fetched token, and retries are harmless", async () => {
    const h = harness();
    expect(await h.service.retireVerifiedSupersededSubscription(7, "SUB_team"))
      .toEqual({ outcome: "retired", providerMutation: "subscription_disable" });
    expect(h.disable).toHaveBeenCalledExactlyOnceWith({ code: "SUB_old", token: "test-only-email-token" });
    expect(h.getAttempt().providerConfirmedAt).toBeInstanceOf(Date);
    expect(h.review.processed).toBe(true);
    expect(await h.service.retireVerifiedSupersededSubscription(7, "SUB_team"))
      .toEqual({ outcome: "not_required", providerMutation: "none" });
    expect(h.disable).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(h.events)).not.toContain("test-only-email-token");
  });

  it("uses readback to confirm a disable that succeeded despite a timeout", async () => {
    const h = harness();
    h.disable.mockImplementation(async () => {
      h.oldProvider.status = "non-renewing";
      throw new Error("timeout");
    });
    expect((await h.service.retireVerifiedSupersededSubscription(7, "SUB_team")).outcome).toBe("retired");
    expect(h.disable).toHaveBeenCalledTimes(1);
  });

  it("recovers delayed confirmation on a later delivery without disabling twice", async () => {
    const h = harness();
    h.disable.mockRejectedValue(new Error("timeout"));
    expect((await h.service.retireVerifiedSupersededSubscription(7, "SUB_team")).outcome).toBe("manual_review_required");
    expect(h.review.processed).toBe(false);
    h.oldProvider.status = "non-renewing";
    expect(await h.service.retireVerifiedSupersededSubscription(7, "SUB_team"))
      .toEqual({ outcome: "retired", providerMutation: "none" });
    expect(h.review.processed).toBe(true);
    expect(h.disable).toHaveBeenCalledTimes(1);
  });

  it("does not blindly retry when the provider still reports active", async () => {
    const h = harness();
    h.disable.mockRejectedValue(new Error("timeout"));
    await h.service.retireVerifiedSupersededSubscription(7, "SUB_team");
    const before = { ...h.getAttempt() };
    expect(await h.service.retireVerifiedSupersededSubscription(7, "SUB_team"))
      .toEqual({ outcome: "manual_review_required", reason: "existing_retirement_attempt", providerMutation: "none" });
    expect(h.getAttempt()).toEqual(before);
    expect(h.disable).toHaveBeenCalledTimes(1);
  });

  it("concurrent deliveries make only one provider call", async () => {
    const h = harness();
    const results = await Promise.all([
      h.service.retireVerifiedSupersededSubscription(7, "SUB_team"),
      h.service.retireVerifiedSupersededSubscription(7, "SUB_team"),
    ]);
    expect(results.some((result) => result.outcome === "retired")).toBe(true);
    expect(h.disable).toHaveBeenCalledTimes(1);
  });

  it.each(["old customer", "new customer", "new plan", "new state", "token"])("fails closed on invalid %s evidence", async (field) => {
    const h = harness();
    if (field === "old customer") h.oldProvider.customer.customer_code = "CUS_other";
    if (field === "new customer") h.newProvider.customer.customer_code = "CUS_other";
    if (field === "new plan") h.newProvider.plan.plan_code = "PLN_other";
    if (field === "new state") h.newProvider.status = "attention";
    if (field === "token") delete h.oldProvider.email_token;
    expect((await h.service.retireVerifiedSupersededSubscription(7, "SUB_team")).outcome).toBe("manual_review_required");
    expect(h.disable).not.toHaveBeenCalled();
    expect(h.review.processed).toBe(false);
  });

  it("does not mutate the provider for a trial checkout with no previous subscription", async () => {
    const h = harness();
    h.review.processed = true; // No supersession review exists for a trial.
    expect((await h.service.retireVerifiedSupersededSubscription(7, "SUB_team")).outcome).toBe("not_required");
    expect(h.get).not.toHaveBeenCalled();
    expect(h.disable).not.toHaveBeenCalled();
  });
});

function pendingIdentityHarness() {
  let newIdentity: any = null;
  let identityReads = 0;
  const pending = {
    id: 9, processed: false,
    eventData: {
      transactionReference: "ss_srv_paid_upgrade",
      previousIdentity: { userId: 7, subscriptionCode: "SUB_old", customerCode: "CUS_owner", planCode: "PLN_individual" },
    },
  };
  const subscription: any = {
    userId: 7, status: "active", planId: 3, paystackReference: "ss_srv_paid_upgrade",
    paystackCustomerCode: "CUS_owner", cancelledAt: null, cancellationRequestedAt: null,
  };
  const checkout = {
    billingOwnerUserId: 7, status: "completed", planId: 3,
    paystackPlanCode: "PLN_team", createdAt: new Date("2026-10-01T00:00:00Z"),
    paystackReference: "ss_srv_paid_upgrade", amount: 24_500, currency: "ZAR",
    customerEmail: "owner@example.com",
  };
  const candidate: any = {
    subscriptionCode: "SUB_team", providerLookupFailed: false,
    providerData: {
      subscription_code: "SUB_team", customer: { customer_code: "CUS_owner" },
      plan: { plan_code: "PLN_team" }, status: "active", createdAt: "2026-10-01T00:01:00Z",
      authorization: { authorization_code: "AUTH_test", channel: "card", reusable: true },
      most_recent_invoice: { invoice_code: "INV_checkout", paid: true, transaction: { id: 1234 } },
    },
  };
  const inspection: any = {
    available: true, customerCode: "CUS_owner", expectedPlanCode: "PLN_team", candidates: [candidate],
  };
  const query = () => {
    let table: any;
    const chain: any = {
      from: (input: any) => { table = input; return chain; },
      where: () => chain, orderBy: () => chain,
      limit: async () => {
        if (table === billingEvents) return pending.processed ? [] : [pending];
        if (table === userSubscriptions) return [subscription];
        if (table === paystackCheckoutAttempts) return [checkout];
        if (table === paystackSubscriptionIdentities) {
          identityReads += 1;
          return newIdentity && (identityReads === 1 || newIdentity.status === "active")
            ? [newIdentity] : [];
        }
        return [];
      },
    };
    return chain;
  };
  vi.mocked(db.select).mockImplementation(query);
  const inserted: any[] = [];
  vi.mocked(db.transaction).mockImplementation(async (callback: any) => {
    identityReads = 0;
    return callback({
      execute: vi.fn(),
      select: query,
      insert: (table: any) => ({
        values: (input: any) => {
          if (table !== paystackSubscriptionIdentities) {
            inserted.push(input);
            return Promise.resolve();
          }
          const chain = {
            onConflictDoUpdate: ({ set }: any) => {
              newIdentity = newIdentity ? { ...newIdentity, ...set } : { id: 5, ...input };
              return chain;
            },
            returning: async () => [newIdentity],
          };
          return chain;
        },
      }),
      update: () => ({ set: (input: any) => ({ where: async () => Object.assign(pending, input) }) }),
    });
  });
  const service = Object.create(BillingService.prototype) as BillingService;
  const payment: any = {
    id: 1234, reference: "ss_srv_paid_upgrade", status: "success",
    customer: { customer_code: "CUS_owner", email: "owner@example.com" },
    plan: { plan_code: "PLN_team" }, amount: 24_500, currency: "ZAR",
  };
  vi.spyOn(service, "verifyPaystackTransaction").mockImplementation(async () => ({ valid: true, subscription: payment }));
  vi.spyOn(service as any, "loadPaystackSubscriptionCandidates").mockImplementation(async () => inspection);
  const record = vi.spyOn(service as any, "recordPaystackSubscriptionIdentityInTransaction")
    .mockResolvedValue({ subscriptionCode: "SUB_team", status: "active" });
  const retire = vi.spyOn(service, "retireVerifiedSupersededSubscription")
    .mockResolvedValue({ outcome: "retired", providerMutation: "subscription_disable" });
  return {
    service, pending, subscription, checkout, candidate, inspection, payment, record, retire, inserted,
    getNewIdentity: () => newIdentity,
  };
}

describe("checkout settlement before subscription.create", () => {
  it("promotes an early unresolved subscription.create only after exact paid-invoice linkage, once", async () => {
    const h = pendingIdentityHarness();
    h.record.mockRestore(); // Exercise the real identity writer, not a stub.
    await h.service.recordPaystackSubscriptionIdentity(7, h.candidate.providerData);
    expect(h.getNewIdentity().status).toBe("unresolved");
    // The verified checkout is now settled, with the old identity preserved in
    // the pending event and its exact provider transaction matched by invoice.
    await h.service.completePendingPaystackUpgradeIdentity(7);
    expect(h.getNewIdentity().status).toBe("active");
    expect(h.getNewIdentity().recurringReadiness).toBe("ready");
    expect(h.retire).toHaveBeenCalledExactlyOnceWith(7, "SUB_team");
    expect(h.pending.processed).toBe(true);
    expect(h.inserted.filter((event) => event.eventType === "paystack_superseded_subscription_review_required")).toHaveLength(1);
    // Repeated early/late webhook deliveries preserve the active identity and
    // cannot generate another retirement review or disable call.
    await h.service.recordPaystackSubscriptionIdentity(7, h.candidate.providerData);
    await h.service.completePendingPaystackUpgradeIdentity(7);
    expect(h.getNewIdentity().status).toBe("active");
    expect(h.retire).toHaveBeenCalledTimes(1);
  });

  it("does not promote an early subscription without a paid transaction link", async () => {
    const h = pendingIdentityHarness();
    h.record.mockRestore();
    await h.service.recordPaystackSubscriptionIdentity(7, h.candidate.providerData);
    h.candidate.providerData.most_recent_invoice.transaction.id = 9999;
    await h.service.completePendingPaystackUpgradeIdentity(7);
    expect(h.getNewIdentity().status).toBe("unresolved");
    expect(h.retire).not.toHaveBeenCalled();
    expect(h.pending.processed).toBe(false);
  });

  it("preserves the old relationship and retires it after exact new identity recovery", async () => {
    const h = pendingIdentityHarness();
    await h.service.completePendingPaystackUpgradeIdentity(7);
    expect(h.record).toHaveBeenCalledOnce();
    expect(h.retire).toHaveBeenCalledExactlyOnceWith(7, "SUB_team");
    expect(h.pending.processed).toBe(true);
    expect(h.inserted[0].eventData).toMatchObject({
      supersededSubscriptionCode: "SUB_old", authoritativeSubscriptionCode: "SUB_team",
    });
    await h.service.completePendingPaystackUpgradeIdentity(7);
    expect(h.retire).toHaveBeenCalledTimes(1);
  });

  it.each(["ambiguous", "provider unavailable", "old provider identity", "newer checkout", "cancelled", "plan mismatch", "not reusable", "code mismatch"])(
    "does not authorize retirement for %s", async (condition) => {
      const h = pendingIdentityHarness();
      if (condition === "ambiguous") h.inspection.candidates.push({ ...h.candidate });
      if (condition === "provider unavailable") h.inspection.available = false;
      if (condition === "old provider identity") h.candidate.providerData.createdAt = "2026-09-01T00:00:00Z";
      if (condition === "newer checkout") h.subscription.paystackReference = "ss_srv_newer";
      if (condition === "cancelled") h.subscription.cancellationRequestedAt = new Date();
      if (condition === "plan mismatch") h.checkout.paystackPlanCode = "PLN_other";
      if (condition === "not reusable") h.candidate.providerData.authorization.reusable = false;
      if (condition === "code mismatch") h.candidate.providerData.subscription_code = "SUB_other";
      await h.service.completePendingPaystackUpgradeIdentity(7);
      expect(h.record).not.toHaveBeenCalled();
      expect(h.retire).not.toHaveBeenCalled();
      expect(h.pending.processed).toBe(false);
    },
  );

  it("rejects an unrelated Team subscription created after checkout initiation but before payment", async () => {
    const h = pendingIdentityHarness();
    h.payment.paid_at = "2026-10-01T00:05:00Z";
    // Same customer/plan, unique active candidate, inside the checkout window,
    // but its invoice was paid by a different transaction.
    h.candidate.providerData.most_recent_invoice.transaction.id = 9999;
    await h.service.completePendingPaystackUpgradeIdentity(7);
    expect(h.record).not.toHaveBeenCalled();
    expect(h.retire).not.toHaveBeenCalled();
    expect(h.pending.processed).toBe(false);
  });

  it("accepts an exact subscription identity returned on later payment verification", async () => {
    const h = pendingIdentityHarness();
    delete h.candidate.providerData.most_recent_invoice;
    h.payment.subscription = { subscription_code: "SUB_team" };
    await h.service.completePendingPaystackUpgradeIdentity(7);
    expect(h.retire).toHaveBeenCalledExactlyOnceWith(7, "SUB_team");
  });

  it.each(["missing invoice", "unpaid invoice", "conflicting reference", "conflicting subscription", "altered amount", "wrong verified subscription"])(
    "rejects %s as payment linkage", async (condition) => {
      const h = pendingIdentityHarness();
      if (condition === "missing invoice") delete h.candidate.providerData.most_recent_invoice;
      if (condition === "unpaid invoice") h.candidate.providerData.most_recent_invoice.paid = false;
      if (condition === "conflicting reference") h.candidate.providerData.most_recent_invoice.transaction.reference = "another_payment";
      if (condition === "conflicting subscription") h.candidate.providerData.most_recent_invoice.subscription_code = "SUB_other";
      if (condition === "altered amount") h.payment.amount = 1;
      if (condition === "wrong verified subscription") h.payment.subscription = { subscription_code: "SUB_other" };
      await h.service.completePendingPaystackUpgradeIdentity(7);
      expect(h.record).not.toHaveBeenCalled();
      expect(h.retire).not.toHaveBeenCalled();
      expect(h.pending.processed).toBe(false);
    },
  );
});
