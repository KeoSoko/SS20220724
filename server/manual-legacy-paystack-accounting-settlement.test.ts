import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  classifyManualLegacyPaystackAccountingSettlement,
  createManualLegacyPaystackAccountingSettlementService,
  type ManualLegacyPaystackAccountingInput,
  type ManualLegacyPaystackAccountingRepository,
  type ManualLegacyPaystackAccountingSnapshot,
} from "./manual-legacy-paystack-accounting-settlement";

const input: ManualLegacyPaystackAccountingInput = {
  billingOwnerUserId: 376,
  localSubscriptionId: 346,
  identityId: 17,
  reference: "d7b327c7d7d3920a06593438abc3eadbee2bb22e2ca36373",
  subscriptionCode: "SUB_wx803wxf3avxgwt",
  customerCode: "CUS_yz5y4pl270165i0",
  planCode: "PLN_8l8p7v1mergg804",
};

const snapshot = (): ManualLegacyPaystackAccountingSnapshot => ({
  billingOwner: { id: 376, isCanonicalBillingOwner: true },
  localSubscription: {
    id: 346,
    userId: 376,
    planId: 2,
    status: "active",
    planCode: "PLN_8l8p7v1mergg804",
    planAmount: 4_900,
    planCurrency: "ZAR",
    paystackCustomerCode: "CUS_yz5y4pl270165i0",
    subscriptionStartDate: "2026-08-27T17:31:01.236Z",
    nextBillingDate: "2026-09-26T17:31:01.196Z",
    totalPaid: 4_900,
    lastPaymentDate: "2026-07-27T17:03:56.679Z",
    paystackReference: "ss_1785171767984_owuq9aba9",
  },
  entitlement: {
    subscriptionTier: "monthly",
    expiresAt: "2026-09-26T17:31:01.196Z",
  },
  identity: {
    id: 17,
    userId: 376,
    subscriptionCode: "SUB_wx803wxf3avxgwt",
    customerCode: "CUS_yz5y4pl270165i0",
    planCode: "PLN_8l8p7v1mergg804",
    status: "active",
  },
  activeIdentityCount: 1,
  providerPayment: {
    valid: true,
    status: "success",
    reference: input.reference,
    providerTransactionId: "4199338261",
    customerCode: input.customerCode,
    subscriptionCode: null,
    planCode: null,
    amount: 4_900,
    currency: "ZAR",
    paidAt: "2026-08-27T17:15:18.000Z",
  },
  providerSubscription: {
    valid: true,
    subscriptionCode: input.subscriptionCode,
    customerCode: input.customerCode,
    planCode: input.planCode,
    status: "active",
  },
  existingPayment: null,
});

function fakeRepository(initial = snapshot()) {
  let state = structuredClone(initial);
  const calls = {
    locks: [] as Array<{ userId: number; lockKey: 36 }>,
    paymentInserts: 0,
    financialWrites: 0,
    audits: [] as any[],
    providerMutations: 0,
  };

  const repository: ManualLegacyPaystackAccountingRepository = {
    async loadSnapshot() {
      return structuredClone(state);
    },
    async runAtomicallyWithBillingOwnerLock36(userId, callback) {
      calls.locks.push({ userId, lockKey: 36 });
      const before = structuredClone(state);
      const beforeCalls = structuredClone(calls);
      try {
        return await callback();
      } catch (error) {
        state = before;
        calls.paymentInserts = beforeCalls.paymentInserts;
        calls.financialWrites = beforeCalls.financialWrites;
        calls.audits = beforeCalls.audits;
        throw error;
      }
    },
    async claimReferenceAndInsertPayment(_input, assessment) {
      if (state.existingPayment) {
        return state.existingPayment.userId === input.billingOwnerUserId
          && state.existingPayment.subscriptionId === input.localSubscriptionId
          ? "already_applied"
          : "conflict";
      }
      calls.paymentInserts += 1;
      state.existingPayment = {
        userId: input.billingOwnerUserId,
        subscriptionId: input.localSubscriptionId,
        reference: input.reference,
        providerTransactionId: assessment.providerPayment.providerTransactionId,
        auditEventType: "manual_accounting_settlement_entitlement_not_adjudicated",
      };
      return "claimed";
    },
    async applyFinancialAccounting(_input, assessment) {
      calls.financialWrites += 1;
      state.localSubscription!.totalPaid += assessment.providerPayment.amount;
      if (assessment.preview.financialChanges.lastPaymentDate.willChange) {
        state.localSubscription!.lastPaymentDate = assessment.providerPayment.paidAt;
        state.localSubscription!.paystackReference = input.reference;
      }
    },
    async recordAuditEvent(event) {
      calls.audits.push(event);
    },
  };
  return { repository, calls, getState: () => structuredClone(state) };
}

describe("manual legacy Paystack accounting settlement", () => {
  beforeEach(() => undefined);

  it("previews and settles the exact user-376-style payment without entitlement", async () => {
    const fake = fakeRepository();
    const service = createManualLegacyPaystackAccountingSettlementService(fake.repository);
    const preview = await service.preview(input);

    expect(preview).toMatchObject({
      outcome: "ready_for_manual_accounting_settlement",
      preview: {
        entitlementChange: "none",
        identityChange: "none",
        executionPermitted: true,
        financialChanges: {
          totalPaid: { before: 4_900, after: 9_800, delta: 4_900 },
          lastPaymentDate: {
            before: "2026-07-27T17:03:56.679Z",
            after: "2026-08-27T17:15:18.000Z",
            willChange: true,
          },
          paystackReference: {
            before: "ss_1785171767984_owuq9aba9",
            after: input.reference,
            willChange: true,
          },
        },
      },
    });

    const result = await service.execute(input, 7, {
      confirmed: true,
      previewFingerprint: preview.preview.confirmationFingerprint,
    });
    expect(result.outcome).toBe("manual_accounting_settled");
    expect(fake.calls.paymentInserts).toBe(1);
    expect(fake.calls.financialWrites).toBe(1);
    expect(fake.calls.audits).toEqual([expect.objectContaining({
      eventType: "manual_accounting_settlement_entitlement_not_adjudicated",
      adminUserId: 7,
      billingOwnerUserId: 376,
      localSubscriptionId: 346,
      identityId: 17,
      paymentReference: input.reference,
      providerTransactionId: "4199338261",
      subscriptionCode: input.subscriptionCode,
      customerCode: input.customerCode,
      planCode: input.planCode,
      amount: 4_900,
      currency: "ZAR",
      paidAt: "2026-08-27T17:15:18.000Z",
      preservedSubscriptionStartDate: "2026-08-27T17:31:01.236Z",
      preservedNextBillingDate: "2026-09-26T17:31:01.196Z",
      preservedEntitlementExpiresAt: "2026-09-26T17:31:01.196Z",
      entitlementChange: "none",
      providerMutation: "none",
      compensationEvidenceCreated: false,
    })]);
  });

  it("requires explicit confirmation bound to the current preview", async () => {
    const fake = fakeRepository();
    const service = createManualLegacyPaystackAccountingSettlementService(fake.repository);
    expect(await service.execute(input, 7, { confirmed: false, previewFingerprint: "" }))
      .toMatchObject({ outcome: "confirmation_required" });
    expect(await service.execute(input, 7, { confirmed: true, previewFingerprint: "stale" }))
      .toMatchObject({ outcome: "preview_changed" });
    expect(fake.calls.paymentInserts).toBe(0);
  });

  it("returns already_applied for a duplicate retry", async () => {
    const fake = fakeRepository();
    const service = createManualLegacyPaystackAccountingSettlementService(fake.repository);
    const preview = await service.preview(input);
    await service.execute(input, 7, { confirmed: true, previewFingerprint: preview.preview.confirmationFingerprint });
    const duplicate = await service.execute(input, 7, { confirmed: true, previewFingerprint: preview.preview.confirmationFingerprint });
    expect(duplicate.outcome).toBe("already_applied");
    expect(fake.calls.paymentInserts).toBe(1);
    expect(fake.calls.financialWrites).toBe(1);
    expect(fake.calls.audits).toHaveLength(1);
  });

  it("gives concurrent requests one reference winner", async () => {
    const fake = fakeRepository();
    const service = createManualLegacyPaystackAccountingSettlementService(fake.repository);
    const preview = await service.preview(input);
    const confirmation = { confirmed: true as const, previewFingerprint: preview.preview.confirmationFingerprint };
    const results = await Promise.all([
      service.execute(input, 7, confirmation),
      service.execute(input, 7, confirmation),
    ]);
    expect(results.map((result) => result.outcome).sort()).toEqual([
      "already_applied",
      "manual_accounting_settled",
    ]);
    expect(fake.calls.paymentInserts).toBe(1);
    expect(fake.calls.financialWrites).toBe(1);
  });

  it.each([
    ["wrong SUB", (s: ManualLegacyPaystackAccountingSnapshot) => { s.identity!.subscriptionCode = "SUB_wrong"; }],
    ["wrong CUS", (s: ManualLegacyPaystackAccountingSnapshot) => { s.identity!.customerCode = "CUS_wrong"; }],
    ["wrong PLN", (s: ManualLegacyPaystackAccountingSnapshot) => { s.identity!.planCode = "PLN_wrong"; }],
  ])("rejects %s", async (_label, mutate) => {
    const state = snapshot();
    mutate(state);
    expect(classifyManualLegacyPaystackAccountingSettlement(input, state))
      .toMatchObject({ outcome: "manual_review_required", reason: "trusted_identity_mismatch" });
  });

  it.each([
    ["owner", (s: ManualLegacyPaystackAccountingSnapshot) => { s.billingOwner!.id = 999; }, "not_effective_billing_owner"],
    ["subscription", (s: ManualLegacyPaystackAccountingSnapshot) => { s.localSubscription!.id = 999; }, "local_subscription_owner_mismatch"],
    ["identity", (s: ManualLegacyPaystackAccountingSnapshot) => { s.identity!.id = 999; }, "trusted_identity_mismatch"],
  ])("rejects the wrong %s", (_label, mutate, reason) => {
    const state = snapshot();
    mutate(state);
    expect(classifyManualLegacyPaystackAccountingSettlement(input, state))
      .toMatchObject({ outcome: "manual_review_required", reason });
  });

  it.each([
    ["amount", (s: ManualLegacyPaystackAccountingSnapshot) => { s.providerPayment!.amount = 5_000; }, "provider_amount_mismatch"],
    ["currency", (s: ManualLegacyPaystackAccountingSnapshot) => { s.providerPayment!.currency = "USD"; }, "provider_currency_mismatch"],
  ])("rejects a %s mismatch", (_label, mutate, reason) => {
    const state = snapshot();
    mutate(state);
    expect(classifyManualLegacyPaystackAccountingSettlement(input, state))
      .toMatchObject({ outcome: "manual_review_required", reason });
  });

  it("rejects a payment reference owned elsewhere", () => {
    const state = snapshot();
    state.existingPayment = {
      userId: 999,
      subscriptionId: 888,
      reference: input.reference,
      providerTransactionId: "4199338261",
      auditEventType: "other_settlement",
    };
    expect(classifyManualLegacyPaystackAccountingSettlement(input, state))
      .toMatchObject({ outcome: "manual_review_required", reason: "payment_reference_conflict" });
  });

  it("does not let an older repaired payment overwrite newer last-payment fields", () => {
    const state = snapshot();
    state.localSubscription!.lastPaymentDate = "2026-09-27T17:15:18.000Z";
    state.localSubscription!.paystackReference = "newer_reference";
    const result = classifyManualLegacyPaystackAccountingSettlement(input, state);
    expect(result).toMatchObject({
      outcome: "ready_for_manual_accounting_settlement",
      preview: {
        financialChanges: {
          totalPaid: { after: 9_800 },
          lastPaymentDate: { after: "2026-09-27T17:15:18.000Z", willChange: false },
          paystackReference: { after: "newer_reference", willChange: false },
        },
      },
    });
  });

  it("preserves every entitlement and identity byte-for-byte", async () => {
    const initial = snapshot();
    const before = {
      subscriptionStartDate: initial.localSubscription!.subscriptionStartDate,
      nextBillingDate: initial.localSubscription!.nextBillingDate,
      entitlement: structuredClone(initial.entitlement),
      identity: structuredClone(initial.identity),
    };
    const fake = fakeRepository(initial);
    const service = createManualLegacyPaystackAccountingSettlementService(fake.repository);
    const preview = await service.preview(input);
    await service.execute(input, 7, { confirmed: true, previewFingerprint: preview.preview.confirmationFingerprint });
    const after = fake.getState();
    expect({
      subscriptionStartDate: after.localSubscription!.subscriptionStartDate,
      nextBillingDate: after.localSubscription!.nextBillingDate,
      entitlement: after.entitlement,
      identity: after.identity,
    }).toEqual(before);
  });

  it("rolls back payment, financial, and audit writes on error", async () => {
    const fake = fakeRepository();
    fake.repository.recordAuditEvent = async () => { throw new Error("audit unavailable"); };
    const service = createManualLegacyPaystackAccountingSettlementService(fake.repository);
    const preview = await service.preview(input);
    await expect(service.execute(input, 7, {
      confirmed: true,
      previewFingerprint: preview.preview.confirmationFingerprint,
    })).rejects.toThrow("audit unavailable");
    expect(fake.calls.paymentInserts).toBe(0);
    expect(fake.calls.financialWrites).toBe(0);
    expect(fake.getState().existingPayment).toBeNull();
    expect(fake.getState().localSubscription!.totalPaid).toBe(4_900);
  });

  it("has no Paystack mutation or compensation-evidence capability", () => {
    const fake = fakeRepository();
    expect(Object.keys(fake.repository)).not.toContain("mutatePaystack");
    expect(Object.keys(fake.repository)).not.toContain("grantEntitlement");
    expect(Object.keys(fake.repository)).not.toContain("createCompensationEvidence");
    expect(fake.calls.providerMutations).toBe(0);
  });

  it("wires preview and execute only through admin-protected routes", () => {
    const source = readFileSync(new URL("./admin-routes.ts", import.meta.url), "utf8");
    expect(source).toMatch(
      /paystack-manual-accounting-settlement\/preview", requireAdmin/,
    );
    expect(source).toMatch(
      /paystack-manual-accounting-settlement\/execute", requireAdmin/,
    );
    expect(source).toContain("Explicit confirmation of the exact preview is required");
  });

  it("implements the adapter with lock 36 and no entitlement or Paystack mutation write", () => {
    const source = readFileSync(new URL("./billing-service.ts", import.meta.url), "utf8");
    const start = source.indexOf("private manualLegacyPaystackAccountingService");
    const nextMethod = source.indexOf("private async recordPaystackSubscriptionIdentityInTransaction", start);
    const end = source.lastIndexOf("  /**", nextMethod);
    const adapter = source.slice(start, end);
    const financialStart = adapter.indexOf("applyFinancialAccounting:");
    const financialEnd = adapter.indexOf("recordAuditEvent:", financialStart);
    const financialWrite = adapter.slice(financialStart, financialEnd);
    expect(adapter).toContain("pg_advisory_xact_lock(${billingOwnerUserId}, 36)");
    expect(adapter).toContain("onConflictDoNothing");
    expect(financialWrite).not.toContain("subscriptionStartDate");
    expect(financialWrite).not.toContain("nextBillingDate");
    expect(financialWrite).not.toContain("subscriptionExpiresAt");
    expect(adapter).not.toContain("admin_verified_renewal_entitlement_compensation");
    expect(adapter).not.toMatch(/subscription\.(disable|create|enable)|transaction\.charge/);
  });

  it("uses an explicit production-compatible subscription projection for provider inspection", () => {
    const source = readFileSync(new URL("./billing-service.ts", import.meta.url), "utf8");
    const start = source.indexOf("private manualLegacyPaystackAccountingService");
    const nextMethod = source.indexOf("private async recordPaystackSubscriptionIdentityInTransaction", start);
    const end = source.lastIndexOf("  /**", nextMethod);
    const adapter = source.slice(start, end);
    const selectedSubscription = adapter.slice(
      adapter.indexOf("database.select({", adapter.indexOf("subscriptionRows")),
      adapter.indexOf("}).from(userSubscriptions)", adapter.indexOf("subscriptionRows")),
    );

    expect(selectedSubscription).toContain("planId: userSubscriptions.planId");
    expect(selectedSubscription).toContain("paystackCustomerCode: userSubscriptions.paystackCustomerCode");
    expect(selectedSubscription).toContain("nextBillingDate: userSubscriptions.nextBillingDate");
    expect(selectedSubscription).not.toContain("cancellationRequestedAt");
    expect(adapter).toContain(
      "this.loadPaystackSubscriptionCandidates(input.billingOwnerUserId, providerInspectionSubscription)",
    );
    expect(adapter.indexOf("const providerInspectionSubscription"))
      .toBeGreaterThan(adapter.indexOf("const localSubscription = subscriptionRows[0]"));
  });
});
