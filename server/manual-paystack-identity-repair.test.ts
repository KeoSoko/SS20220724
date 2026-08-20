import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createManualPaystackIdentityRepairService,
  ManualPaystackIdentityRepairInput,
  ManualPaystackIdentityRepairRepository,
  ManualPaystackIdentityRepairSnapshot,
} from "./manual-paystack-identity-repair";

const input: ManualPaystackIdentityRepairInput = {
  billingOwnerUserId: 167,
  subscriptionCode: "SUB_eehaegvz7vf3jju",
  customerCode: "CUS_w9r4rwwmzjnt0nr",
  planCode: "PLN_8l8p7v1mergg804",
};

function validSnapshot(): ManualPaystackIdentityRepairSnapshot {
  return {
    billingOwner: { id: input.billingOwnerUserId, isCanonicalBillingOwner: true },
    localSubscription: {
      id: 137,
      userId: input.billingOwnerUserId,
      status: "active",
      paystackCustomerCode: input.customerCode,
      planCode: input.planCode,
      subscriptionStartDate: new Date("2026-07-23T05:49:29.992Z"),
      nextBillingDate: new Date("2026-08-23T06:00:20.934Z"),
    },
    activeIdentities: [],
    identityForSubscriptionCode: null,
    pendingCheckoutCount: 0,
  };
}

function setup(snapshot = validSnapshot()) {
  const calls = {
    load: 0,
    locks: 0,
    insertedIdentity: [] as ManualPaystackIdentityRepairInput[],
    audit: [] as Array<{ input: ManualPaystackIdentityRepairInput; adminUserId: number; localSubscriptionId: number }>,
    paystackRequests: 0,
    checkoutCreates: 0,
    entitlementWrites: 0,
    paymentWrites: 0,
  };
  const repository: ManualPaystackIdentityRepairRepository = {
    loadSnapshot: vi.fn(async () => {
      calls.load += 1;
      return snapshot;
    }),
    runWithBillingOwnerLock: vi.fn(async (_userId, callback) => {
      calls.locks += 1;
      return callback();
    }),
    insertCanonicalIdentity: vi.fn(async (repairInput) => {
      calls.insertedIdentity.push(repairInput);
    }),
    recordAuditEvent: vi.fn(async (repairInput, adminUserId, localSubscriptionId) => {
      calls.audit.push({ input: repairInput, adminUserId, localSubscriptionId });
    }),
  };

  return {
    calls,
    repository,
    service: createManualPaystackIdentityRepairService(repository),
  };
}

describe("manual Paystack identity repair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("previews a valid admin repair without any write", async () => {
    const { service, calls } = setup();

    await expect(service.preview(input)).resolves.toMatchObject({
      outcome: "valid",
      preview: {
        proposedIdentity: {
          userId: 167,
          subscriptionCode: input.subscriptionCode,
          recurringReadiness: "unknown",
        },
      },
    });
    expect(calls.insertedIdentity).toEqual([]);
    expect(calls.audit).toEqual([]);
    expect(calls.locks).toBe(0);
  });

  it("executes a valid confirmed repair with one identity and one audit event", async () => {
    const { service, calls } = setup();

    await expect(service.execute(input, 9)).resolves.toMatchObject({ outcome: "repaired" });
    expect(calls.insertedIdentity).toEqual([input]);
    expect(calls.audit).toEqual([{
      input,
      adminUserId: 9,
      localSubscriptionId: 137,
    }]);
    expect(calls.locks).toBe(1);
  });

  it("rejects a mismatched stored customer code", async () => {
    const snapshot = validSnapshot();
    snapshot.localSubscription!.paystackCustomerCode = "CUS_different";
    const { service, calls } = setup(snapshot);

    await expect(service.execute(input, 9)).resolves.toMatchObject({
      outcome: "manual_review_required",
      reason: "local_customer_code_mismatch",
    });
    expect(calls.insertedIdentity).toEqual([]);
  });

  it("rejects a workspace member who is not the effective billing owner", async () => {
    const snapshot = validSnapshot();
    snapshot.billingOwner!.isCanonicalBillingOwner = false;
    const { service, calls } = setup(snapshot);

    await expect(service.execute(input, 9)).resolves.toMatchObject({
      outcome: "manual_review_required",
      reason: "not_effective_billing_owner",
    });
    expect(calls.insertedIdentity).toEqual([]);
  });

  it("rejects a wrong local plan", async () => {
    const snapshot = validSnapshot();
    snapshot.localSubscription!.planCode = "PLN_different";
    const { service, calls } = setup(snapshot);

    await expect(service.execute(input, 9)).resolves.toMatchObject({
      outcome: "manual_review_required",
      reason: "local_plan_code_mismatch",
    });
    expect(calls.insertedIdentity).toEqual([]);
  });

  it("rejects a SUB code already trusted by another user", async () => {
    const snapshot = validSnapshot();
    snapshot.identityForSubscriptionCode = {
      userId: 999,
      subscriptionCode: input.subscriptionCode,
      customerCode: input.customerCode,
      planCode: input.planCode,
      status: "active",
      recurringReadiness: "unknown",
    };
    const { service, calls } = setup(snapshot);

    await expect(service.execute(input, 9)).resolves.toMatchObject({
      outcome: "manual_review_required",
      reason: "subscription_code_owned_by_another_user",
    });
    expect(calls.insertedIdentity).toEqual([]);
  });

  it("rejects a conflicting active local identity", async () => {
    const snapshot = validSnapshot();
    snapshot.activeIdentities = [{
      userId: 167,
      subscriptionCode: "SUB_other",
      customerCode: input.customerCode,
      planCode: input.planCode,
      status: "active",
      recurringReadiness: "unknown",
    }];
    const { service, calls } = setup(snapshot);

    await expect(service.execute(input, 9)).resolves.toMatchObject({
      outcome: "manual_review_required",
      reason: "conflicting_active_local_identity",
    });
    expect(calls.insertedIdentity).toEqual([]);
  });

  it("is idempotent when the same canonical identity already exists correctly", async () => {
    const snapshot = validSnapshot();
    const existingIdentity = {
      userId: 167,
      subscriptionCode: input.subscriptionCode,
      customerCode: input.customerCode,
      planCode: input.planCode,
      status: "active",
      recurringReadiness: "unknown",
    };
    snapshot.activeIdentities = [existingIdentity];
    snapshot.identityForSubscriptionCode = existingIdentity;
    const { service, calls } = setup(snapshot);

    await expect(service.execute(input, 9)).resolves.toMatchObject({
      outcome: "already_reconciled",
    });
    expect(calls.insertedIdentity).toEqual([]);
    expect(calls.audit).toEqual([]);
  });

  it("keeps recurring readiness unknown without reusable authorization evidence", async () => {
    const { service } = setup();

    await expect(service.preview(input)).resolves.toMatchObject({
      outcome: "valid",
      preview: { proposedIdentity: { recurringReadiness: "unknown" } },
    });
  });

  it("does not alter entitlement, payment, or subscription-date state", async () => {
    const snapshot = validSnapshot();
    const before = structuredClone(snapshot);
    const { service, calls } = setup(snapshot);

    await service.execute(input, 9);

    expect(snapshot).toEqual(before);
    expect(calls.entitlementWrites).toBe(0);
    expect(calls.paymentWrites).toBe(0);
  });

  it("does not make a Paystack request", async () => {
    const { service, calls } = setup();

    await service.execute(input, 9);

    expect(calls.paystackRequests).toBe(0);
  });

  it("does not create a checkout", async () => {
    const { service, calls } = setup();

    await service.execute(input, 9);

    expect(calls.checkoutCreates).toBe(0);
  });

  it("creates a non-sensitive audit event only after the local identity write", async () => {
    const { service, calls } = setup();

    await service.execute(input, 41);

    expect(calls.audit).toHaveLength(1);
    expect(calls.audit[0]).toMatchObject({
      adminUserId: 41,
      localSubscriptionId: 137,
      input: {
        subscriptionCode: input.subscriptionCode,
        customerCode: input.customerCode,
        planCode: input.planCode,
      },
    });
  });

  it("rejects a pending checkout conflict before writing", async () => {
    const snapshot = validSnapshot();
    snapshot.pendingCheckoutCount = 1;
    const { service, calls } = setup(snapshot);

    await expect(service.preview(input)).resolves.toMatchObject({
      outcome: "manual_review_required",
      reason: "pending_checkout_conflict",
    });
    expect(calls.insertedIdentity).toEqual([]);
    expect(calls.audit).toEqual([]);
  });

  it("rejects invalid manual identity formats before writing", async () => {
    const { service, calls } = setup();

    await expect(service.execute({ ...input, subscriptionCode: "not-a-subscription" }, 9)).resolves.toMatchObject({
      outcome: "manual_review_required",
      reason: "invalid_manual_identity_input",
    });
    expect(calls.insertedIdentity).toEqual([]);
  });
});