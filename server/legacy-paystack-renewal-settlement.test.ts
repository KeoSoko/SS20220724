import { describe, expect, it } from "vitest";
import {
  buildStructuredCompensationEvent,
  classifyLegacyRenewalSettlement,
  createLegacyRenewalSettlementService,
  type LegacyRenewalSettlementInput,
  type LegacyRenewalSettlementRepository,
  type LegacyRenewalSettlementSnapshot,
} from "./legacy-paystack-renewal-settlement";

const input: LegacyRenewalSettlementInput = {
  billingOwnerUserId: 10,
  localSubscriptionId: 9,
  identityId: 17,
  reference: "renewal_august",
  subscriptionCode: "SUB_current",
  customerCode: "CUS_owner",
  planCode: "PLN_monthly",
};

const periodStart = "2026-08-27T17:03:56.679Z";
const periodEnd = "2026-09-27T17:03:56.679Z";

function snapshot(): LegacyRenewalSettlementSnapshot {
  return {
    billingOwner: { id: 10, isCanonicalBillingOwner: true },
    localSubscription: {
      id: 9,
      userId: 10,
      planId: 2,
      status: "active",
      planCode: "PLN_monthly",
      planAmount: 4_900,
      planCurrency: "ZAR",
      paystackCustomerCode: "CUS_owner",
      subscriptionStartDate: "2026-07-27T17:03:56.679Z",
      nextBillingDate: periodStart,
      totalPaid: 4_900,
      lastPaymentDate: "2026-07-27T17:03:56.679Z",
      paystackReference: "renewal_july",
    },
    entitlement: {
      subscriptionTier: "monthly",
      expiresAt: periodStart,
    },
    identity: {
      id: 17,
      userId: 10,
      subscriptionCode: "SUB_current",
      customerCode: "CUS_owner",
      planCode: "PLN_monthly",
      status: "active",
    },
    activeIdentityCount: 1,
    providerPayment: {
      valid: true,
      status: "success",
      reference: "renewal_august",
      providerTransactionId: "txn_700",
      customerCode: "CUS_owner",
      subscriptionCode: null,
      planCode: null,
      amount: 4_900,
      currency: "ZAR",
      paidAt: periodStart,
    },
    providerSubscription: {
      valid: true,
      subscriptionCode: "SUB_current",
      customerCode: "CUS_owner",
      planCode: "PLN_monthly",
      status: "active",
      renewalPeriodStart: periodStart,
      renewalPeriodEnd: periodEnd,
    },
    structuredCompensationEvents: [],
    legacyActivationEvents: [],
    existingPayment: null,
  };
}

function compensatedSnapshot() {
  const state = snapshot();
  state.localSubscription.nextBillingDate = periodEnd;
  state.entitlement.expiresAt = periodEnd;
  const compensation = buildStructuredCompensationEvent({
    adminUserId: 36,
    input,
    providerTransactionId: "txn_700",
    paidAt: periodStart,
    previousNextBillingDate: periodStart,
    previousEntitlementExpiresAt: periodStart,
    grantedPeriodStart: periodStart,
    grantedPeriodEnd: periodEnd,
    resultingNextBillingDate: periodEnd,
    resultingEntitlementExpiresAt: periodEnd,
    recordedAt: "2026-08-27T17:31:01.341Z",
  });
  compensation.billingEventId = 3001;
  state.structuredCompensationEvents = [compensation];
  return state;
}

function setup(initial = snapshot()) {
  const state = structuredClone(initial);
  const calls = {
    locks: 0,
    paymentInserts: 0,
    entitlementWrites: 0,
    financialWrites: 0,
    audits: [] as any[],
  };
  let tail = Promise.resolve();
  const withLock = async <T>(callback: () => Promise<T>): Promise<T> => {
    calls.locks += 1;
    const prior = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => { release = resolve; });
    await prior;
    try {
      return await callback();
    } finally {
      release();
    }
  };

  const repository: LegacyRenewalSettlementRepository = {
    loadSnapshot: async () => structuredClone(state),
    runAtomicallyWithBillingOwnerLock: async (_ownerId, callback) => withLock(callback),
    claimPaymentReference: async (settlementInput, classification) => {
      if (state.existingPayment) {
        return state.existingPayment.userId === settlementInput.billingOwnerUserId
          && state.existingPayment.subscriptionId === settlementInput.localSubscriptionId
          && state.existingPayment.reference === settlementInput.reference
          ? "already_applied"
          : "conflict";
      }
      calls.paymentInserts += 1;
      state.existingPayment = {
        userId: settlementInput.billingOwnerUserId,
        subscriptionId: settlementInput.localSubscriptionId,
        reference: settlementInput.reference,
        outcome: classification,
      };
      return "claimed";
    },
    applyPaymentAndEntitlement: async (_settlementInput, assessment) => {
      calls.financialWrites += 1;
      calls.entitlementWrites += 1;
      state.localSubscription!.totalPaid += state.providerPayment!.amount;
      state.localSubscription!.lastPaymentDate = state.providerPayment!.paidAt;
      state.localSubscription!.paystackReference = state.providerPayment!.reference;
      state.localSubscription!.nextBillingDate = assessment.preview.proposed.nextBillingDate;
      state.entitlement.expiresAt = assessment.preview.proposed.entitlementExpiresAt;
    },
    applyPaymentForPreviouslyGrantedEntitlement: async () => {
      calls.financialWrites += 1;
      state.localSubscription!.totalPaid += state.providerPayment!.amount;
      if (!state.localSubscription!.lastPaymentDate
        || state.localSubscription!.lastPaymentDate < state.providerPayment!.paidAt) {
        state.localSubscription!.lastPaymentDate = state.providerPayment!.paidAt;
        state.localSubscription!.paystackReference = state.providerPayment!.reference;
      }
    },
    recordAuditEvent: async (event) => {
      calls.audits.push(event);
    },
  };

  return {
    calls,
    state,
    service: createLegacyRenewalSettlementService(repository),
    runNormalSettlement: () => withLock(async () => {
      if (state.existingPayment) return "already_applied" as const;
      state.existingPayment = {
        userId: input.billingOwnerUserId,
        subscriptionId: input.localSubscriptionId,
        reference: input.reference,
        outcome: "payment_and_entitlement_applied",
      };
      calls.paymentInserts += 1;
      calls.financialWrites += 1;
      calls.entitlementWrites += 1;
      state.localSubscription!.totalPaid += state.providerPayment!.amount;
      state.localSubscription!.lastPaymentDate = state.providerPayment!.paidAt;
      state.localSubscription!.paystackReference = state.providerPayment!.reference;
      state.localSubscription!.nextBillingDate = periodEnd;
      state.entitlement.expiresAt = periodEnd;
      return "applied" as const;
    }),
  };
}

describe("legacy renewal settlement classifier", () => {
  it("records an unpaid payment and grants exactly one missing entitlement period", async () => {
    const { service, state, calls } = setup();

    await expect(service.execute(input, 36)).resolves.toMatchObject({
      outcome: "payment_and_entitlement_applied",
    });
    expect(calls.paymentInserts).toBe(1);
    expect(calls.financialWrites).toBe(1);
    expect(calls.entitlementWrites).toBe(1);
    expect(state.localSubscription).toMatchObject({
      totalPaid: 9_800,
      nextBillingDate: periodEnd,
      lastPaymentDate: periodStart,
      paystackReference: input.reference,
    });
    expect(state.entitlement.expiresAt).toBe(periodEnd);
  });

  it("records payment but grants zero extra entitlement for exact structured compensation", async () => {
    const { service, state, calls } = setup(compensatedSnapshot());

    await expect(service.execute(input, 36)).resolves.toMatchObject({
      outcome: "payment_applied_entitlement_already_granted",
    });
    expect(calls.paymentInserts).toBe(1);
    expect(calls.financialWrites).toBe(1);
    expect(calls.entitlementWrites).toBe(0);
    expect(state.localSubscription!.nextBillingDate).toBe(periodEnd);
    expect(state.entitlement.expiresAt).toBe(periodEnd);
  });

  it("uses a server-owned structured compensation contract with no entitlement override", () => {
    const event = compensatedSnapshot().structuredCompensationEvents[0];

    expect(event).toMatchObject({
      billingEventId: 3001,
      schemaVersion: 1,
      eventType: "admin_verified_renewal_entitlement_compensation",
      source: "server_verified_admin_recovery",
      reason: "verified_renewal_entitlement_compensation",
      paymentReference: input.reference,
      billingOwnerUserId: input.billingOwnerUserId,
      localSubscriptionId: input.localSubscriptionId,
      identityId: input.identityId,
      providerMutation: "none",
    });
    expect(event).not.toHaveProperty("skipEntitlement");
    expect(event).not.toHaveProperty("entitlementOverride");
  });

  it("rejects provider amount and currency that differ from server-owned plan terms", () => {
    const wrongAmount = snapshot();
    wrongAmount.providerPayment!.amount = 1;
    expect(classifyLegacyRenewalSettlement(input, wrongAmount)).toMatchObject({
      outcome: "manual_review_required",
      reason: "provider_amount_mismatch",
    });

    const wrongCurrency = snapshot();
    wrongCurrency.providerPayment!.currency = "USD";
    expect(classifyLegacyRenewalSettlement(input, wrongCurrency)).toMatchObject({
      outcome: "manual_review_required",
      reason: "provider_currency_mismatch",
    });
  });

  it("blocks a legacy activation without exact payment linkage", () => {
    const state = compensatedSnapshot();
    state.structuredCompensationEvents = [];
    state.legacyActivationEvents = [{
      eventId: 2571,
      createdAt: "2026-08-27T17:31:01.341Z",
      adminUserId: 36,
      reason: "No reason provided",
    }];

    expect(classifyLegacyRenewalSettlement(input, state)).toMatchObject({
      outcome: "manual_review_required",
      reason: "compensation_activation_not_explicitly_linked_to_payment",
    });
  });

  it("blocks structured compensation for the wrong interval", () => {
    const state = compensatedSnapshot();
    state.structuredCompensationEvents[0].grantedPeriodEnd = "2026-09-26T17:31:01.196Z";

    expect(classifyLegacyRenewalSettlement(input, state)).toMatchObject({
      outcome: "manual_review_required",
      reason: "compensation_interval_mismatch",
    });
  });

  it("blocks multiple plausible structured recovery events", () => {
    const state = compensatedSnapshot();
    state.structuredCompensationEvents.push({
      ...state.structuredCompensationEvents[0],
      recordedAt: "2026-08-27T17:32:01.341Z",
    });

    expect(classifyLegacyRenewalSettlement(input, state)).toMatchObject({
      outcome: "manual_review_required",
      reason: "multiple_compensation_events",
    });
  });

  it("does not trust an unpersisted compensation object as durable evidence", () => {
    const state = compensatedSnapshot();
    state.structuredCompensationEvents[0].billingEventId = null;

    expect(classifyLegacyRenewalSettlement(input, state)).toMatchObject({
      outcome: "manual_review_required",
      reason: "compensation_interval_mismatch",
      preview: { executionPermitted: false },
    });
  });

  it("makes a compensated repair duplicate a complete no-op", async () => {
    const { service, state, calls } = setup(compensatedSnapshot());

    await service.execute(input, 36);
    const afterFirst = structuredClone(state);
    await expect(service.execute(input, 36)).resolves.toMatchObject({
      outcome: "already_applied",
      preview: {
        proposed: {
          totalPaid: 9_800,
          nextBillingDate: periodEnd,
        },
      },
    });

    expect(state).toEqual(afterFirst);
    expect(calls.paymentInserts).toBe(1);
    expect(calls.financialWrites).toBe(1);
    expect(calls.entitlementWrites).toBe(0);
  });

  it("gives concurrent repairs one payment and entitlement winner", async () => {
    const { service, state, calls } = setup();

    const outcomes = await Promise.all([
      service.execute(input, 36),
      service.execute(input, 36),
    ]);

    expect(outcomes.map((result) => result.outcome).sort()).toEqual([
      "already_applied",
      "payment_and_entitlement_applied",
    ]);
    expect(calls.paymentInserts).toBe(1);
    expect(calls.entitlementWrites).toBe(1);
    expect(state.localSubscription!.totalPaid).toBe(9_800);
  });

  it("cannot double entitlement when normal settlement races the repair", async () => {
    const { service, runNormalSettlement, state, calls } = setup();

    await Promise.all([
      service.execute(input, 36),
      runNormalSettlement(),
    ]);

    expect(calls.paymentInserts).toBe(1);
    expect(calls.entitlementWrites).toBe(1);
    expect(state.localSubscription!.totalPaid).toBe(9_800);
    expect(state.localSubscription!.nextBillingDate).toBe(periodEnd);
  });

  it("does not let an older repaired payment replace newer last-payment fields", async () => {
    const state = compensatedSnapshot();
    state.localSubscription!.lastPaymentDate = "2026-10-27T17:03:56.679Z";
    state.localSubscription!.paystackReference = "renewal_october";
    const { service, state: applied, calls } = setup(state);

    await service.execute(input, 36);

    expect(calls.financialWrites).toBe(1);
    expect(applied.localSubscription).toMatchObject({
      totalPaid: 9_800,
      lastPaymentDate: "2026-10-27T17:03:56.679Z",
      paystackReference: "renewal_october",
    });
  });

  it("keeps the user-376 evidence fixture blocked", () => {
    const user376Input: LegacyRenewalSettlementInput = {
      billingOwnerUserId: 376,
      localSubscriptionId: 346,
      identityId: 17,
      reference: "d7b327c7d7d3920a06593438abc3eadbee2bb22e2ca36373",
      subscriptionCode: "SUB_wx803wxf3avxgwt",
      customerCode: "CUS_yz5y4pl270165i0",
      planCode: "PLN_8l8p7v1mergg804",
    };
    const state = snapshot();
    state.billingOwner = { id: 376, isCanonicalBillingOwner: true };
    state.localSubscription = {
      ...state.localSubscription!,
      id: 346,
      userId: 376,
      nextBillingDate: "2026-09-26T17:31:01.196Z",
      totalPaid: 4_900,
      lastPaymentDate: "2026-07-27T17:03:56.679Z",
      paystackReference: "ss_1785171767984_owuq9aba9",
      paystackCustomerCode: user376Input.customerCode,
      planCode: user376Input.planCode,
    };
    state.entitlement.expiresAt = "2026-09-26T17:31:01.196Z";
    state.identity = {
      ...state.identity!,
      id: 17,
      userId: 376,
      subscriptionCode: user376Input.subscriptionCode,
      customerCode: user376Input.customerCode,
      planCode: user376Input.planCode,
    };
    state.providerPayment = {
      ...state.providerPayment!,
      reference: user376Input.reference,
      customerCode: user376Input.customerCode,
    };
    state.providerSubscription = {
      ...state.providerSubscription!,
      subscriptionCode: user376Input.subscriptionCode,
      customerCode: user376Input.customerCode,
      planCode: user376Input.planCode,
    };
    state.legacyActivationEvents = [{
      eventId: 2571,
      createdAt: "2026-08-27T17:31:01.341Z",
      adminUserId: 36,
      reason: "No reason provided",
    }];

    expect(classifyLegacyRenewalSettlement(user376Input, state)).toMatchObject({
      outcome: "manual_review_required",
      reason: "compensation_activation_not_explicitly_linked_to_payment",
      preview: {
        current: {
          nextBillingDate: "2026-09-26T17:31:01.196Z",
          entitlementExpiresAt: "2026-09-26T17:31:01.196Z",
          totalPaid: 4_900,
          lastPaymentDate: "2026-07-27T17:03:56.679Z",
          paystackReference: "ss_1785171767984_owuq9aba9",
        },
        executionPermitted: false,
      },
    });
  });
});
