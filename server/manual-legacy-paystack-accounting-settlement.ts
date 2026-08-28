import { createHash } from "node:crypto";

export const MANUAL_ACCOUNTING_SETTLEMENT_EVENT =
  "manual_accounting_settlement_entitlement_not_adjudicated" as const;

export interface ManualLegacyPaystackAccountingInput {
  billingOwnerUserId: number;
  localSubscriptionId: number;
  identityId: number;
  reference: string;
  subscriptionCode: string;
  customerCode: string;
  planCode: string;
}

export interface ManualLegacyPaystackAccountingSnapshot {
  billingOwner: { id: number; isCanonicalBillingOwner: boolean } | null;
  localSubscription: {
    id: number;
    userId: number;
    planId: number;
    status: string;
    planCode: string | null;
    planAmount: number;
    planCurrency: string;
    paystackCustomerCode: string | null;
    subscriptionStartDate: string | null;
    nextBillingDate: string | null;
    totalPaid: number;
    lastPaymentDate: string | null;
    paystackReference: string | null;
  } | null;
  entitlement: {
    subscriptionTier: string | null;
    expiresAt: string | null;
  };
  identity: {
    id: number;
    userId: number;
    subscriptionCode: string;
    customerCode: string | null;
    planCode: string | null;
    status: string;
  } | null;
  activeIdentityCount: number;
  /** Result of an exact-reference Paystack transaction verification read. */
  providerPayment: {
    valid: boolean;
    status: string;
    reference: string;
    providerTransactionId: string | null;
    customerCode: string | null;
    subscriptionCode: string | null;
    planCode: string | null;
    amount: number;
    currency: string;
    paidAt: string;
  } | null;
  /** Independently verified provider relationship for the trusted identity. */
  providerSubscription: {
    valid: boolean;
    subscriptionCode: string | null;
    customerCode: string | null;
    planCode: string | null;
    status: string;
  } | null;
  existingPayment: {
    userId: number;
    subscriptionId: number;
    reference: string;
    providerTransactionId: string | null;
    auditEventType: string | null;
  } | null;
}

export type ManualLegacyPaystackAccountingReviewReason =
  | "invalid_input"
  | "billing_owner_missing"
  | "not_effective_billing_owner"
  | "local_subscription_missing"
  | "local_subscription_owner_mismatch"
  | "local_subscription_state_invalid"
  | "local_plan_mismatch"
  | "local_customer_mismatch"
  | "trusted_identity_missing"
  | "trusted_identity_inactive"
  | "trusted_identity_mismatch"
  | "multiple_active_identities"
  | "provider_payment_invalid"
  | "provider_reference_mismatch"
  | "provider_customer_mismatch"
  | "provider_subscription_conflict"
  | "provider_plan_conflict"
  | "provider_amount_mismatch"
  | "provider_currency_mismatch"
  | "provider_subscription_invalid"
  | "provider_relationship_mismatch"
  | "payment_reference_conflict";

export interface ManualLegacyPaystackAccountingPreview {
  paymentTransaction: {
    willInsert: true;
    userId: number;
    subscriptionId: number;
    identityId: number;
    reference: string;
    providerTransactionId: string;
    amount: number;
    currency: string;
    paidAt: string;
  };
  financialChanges: {
    totalPaid: { before: number; after: number; delta: number };
    lastPaymentDate: { before: string | null; after: string | null; willChange: boolean };
    paystackReference: { before: string | null; after: string | null; willChange: boolean };
  };
  preserved: {
    subscriptionStartDate: string | null;
    nextBillingDate: string | null;
    entitlementExpiresAt: string | null;
    subscriptionTier: string | null;
    identityId: number;
    identityStatus: string;
  };
  entitlementChange: "none";
  identityChange: "none";
  compensationEvidenceCreated: false;
  providerMutation: "none";
  executionPermitted: true;
  confirmationFingerprint: string;
}

export interface ManualLegacyPaystackAccountingReadyAssessment {
  outcome: "ready_for_manual_accounting_settlement";
  providerPayment: {
    providerTransactionId: string;
    amount: number;
    currency: string;
    paidAt: string;
  };
  preview: ManualLegacyPaystackAccountingPreview;
}

export type ManualLegacyPaystackAccountingAssessment =
  | ManualLegacyPaystackAccountingReadyAssessment
  | { outcome: "already_applied" }
  | { outcome: "manual_review_required"; reason: ManualLegacyPaystackAccountingReviewReason };

export type ManualLegacyPaystackAccountingExecutionResult =
  | ManualLegacyPaystackAccountingAssessment
  | { outcome: "confirmation_required" }
  | { outcome: "preview_changed" }
  | { outcome: "manual_accounting_settled"; preview: ManualLegacyPaystackAccountingPreview };

export interface ManualLegacyPaystackAccountingAuditEvent {
  eventType: typeof MANUAL_ACCOUNTING_SETTLEMENT_EVENT;
  adminUserId: number;
  billingOwnerUserId: number;
  localSubscriptionId: number;
  identityId: number;
  paymentReference: string;
  providerTransactionId: string;
  subscriptionCode: string;
  customerCode: string;
  planCode: string;
  amount: number;
  currency: string;
  paidAt: string;
  preservedSubscriptionStartDate: string | null;
  preservedNextBillingDate: string | null;
  preservedEntitlementExpiresAt: string | null;
  entitlementChange: "none";
  providerMutation: "none";
  compensationEvidenceCreated: false;
}

export interface ManualLegacyPaystackAccountingRepository {
  /** Must perform Paystack verification using read-only provider endpoints only. */
  loadSnapshot(
    input: ManualLegacyPaystackAccountingInput,
  ): Promise<ManualLegacyPaystackAccountingSnapshot>;
  /** Adapter implementation must use pg_advisory_xact_lock(userId, 36). */
  runAtomicallyWithBillingOwnerLock36<T>(
    billingOwnerUserId: number,
    callback: () => Promise<T>,
  ): Promise<T>;
  /** The unique payment insert is the idempotency claim and first write. */
  claimReferenceAndInsertPayment(
    input: ManualLegacyPaystackAccountingInput,
    assessment: ManualLegacyPaystackAccountingReadyAssessment,
  ): Promise<"claimed" | "already_applied" | "conflict">;
  /** May update only totalPaid and chronologically eligible last-payment fields. */
  applyFinancialAccounting(
    input: ManualLegacyPaystackAccountingInput,
    assessment: ManualLegacyPaystackAccountingReadyAssessment,
  ): Promise<void>;
  recordAuditEvent(event: ManualLegacyPaystackAccountingAuditEvent): Promise<void>;
}

function isIsoDate(value: string | null | undefined): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validInput(input: ManualLegacyPaystackAccountingInput): boolean {
  return Number.isInteger(input.billingOwnerUserId)
    && input.billingOwnerUserId > 0
    && Number.isInteger(input.localSubscriptionId)
    && input.localSubscriptionId > 0
    && Number.isInteger(input.identityId)
    && input.identityId > 0
    && input.reference.trim().length > 0
    && /^SUB_[A-Za-z0-9_-]+$/.test(input.subscriptionCode)
    && /^CUS_[A-Za-z0-9_-]+$/.test(input.customerCode)
    && /^PLN_[A-Za-z0-9_-]+$/.test(input.planCode);
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function buildPreview(
  input: ManualLegacyPaystackAccountingInput,
  snapshot: ManualLegacyPaystackAccountingSnapshot,
  providerTransactionId: string,
): ManualLegacyPaystackAccountingPreview {
  const subscription = snapshot.localSubscription!;
  const payment = snapshot.providerPayment!;
  const paymentIsLatest = !subscription.lastPaymentDate
    || Date.parse(payment.paidAt) > Date.parse(subscription.lastPaymentDate);
  const previewWithoutFingerprint = {
    paymentTransaction: {
      willInsert: true as const,
      userId: input.billingOwnerUserId,
      subscriptionId: input.localSubscriptionId,
      identityId: input.identityId,
      reference: input.reference,
      providerTransactionId,
      amount: payment.amount,
      currency: payment.currency.toUpperCase(),
      paidAt: payment.paidAt,
    },
    financialChanges: {
      totalPaid: {
        before: subscription.totalPaid,
        after: subscription.totalPaid + payment.amount,
        delta: payment.amount,
      },
      lastPaymentDate: {
        before: subscription.lastPaymentDate,
        after: paymentIsLatest ? payment.paidAt : subscription.lastPaymentDate,
        willChange: paymentIsLatest,
      },
      paystackReference: {
        before: subscription.paystackReference,
        after: paymentIsLatest ? input.reference : subscription.paystackReference,
        willChange: paymentIsLatest,
      },
    },
    preserved: {
      subscriptionStartDate: subscription.subscriptionStartDate,
      nextBillingDate: subscription.nextBillingDate,
      entitlementExpiresAt: snapshot.entitlement.expiresAt,
      subscriptionTier: snapshot.entitlement.subscriptionTier,
      identityId: snapshot.identity!.id,
      identityStatus: snapshot.identity!.status,
    },
    entitlementChange: "none" as const,
    identityChange: "none" as const,
    compensationEvidenceCreated: false as const,
    providerMutation: "none" as const,
    executionPermitted: true as const,
  };
  return {
    ...previewWithoutFingerprint,
    confirmationFingerprint: fingerprint({ input, ...previewWithoutFingerprint }),
  };
}

export function classifyManualLegacyPaystackAccountingSettlement(
  input: ManualLegacyPaystackAccountingInput,
  snapshot: ManualLegacyPaystackAccountingSnapshot,
): ManualLegacyPaystackAccountingAssessment {
  const review = (
    reason: ManualLegacyPaystackAccountingReviewReason,
  ): ManualLegacyPaystackAccountingAssessment => ({ outcome: "manual_review_required", reason });

  if (!validInput(input)) return review("invalid_input");
  if (!snapshot.billingOwner) return review("billing_owner_missing");
  if (!snapshot.billingOwner.isCanonicalBillingOwner
    || snapshot.billingOwner.id !== input.billingOwnerUserId) {
    return review("not_effective_billing_owner");
  }
  const subscription = snapshot.localSubscription;
  if (!subscription) return review("local_subscription_missing");
  if (subscription.id !== input.localSubscriptionId
    || subscription.userId !== input.billingOwnerUserId) {
    return review("local_subscription_owner_mismatch");
  }
  if (!["active", "paused", "cancelled"].includes(subscription.status)) {
    return review("local_subscription_state_invalid");
  }
  if (subscription.planCode !== input.planCode) return review("local_plan_mismatch");
  if (subscription.paystackCustomerCode !== input.customerCode) return review("local_customer_mismatch");

  const identity = snapshot.identity;
  if (!identity) return review("trusted_identity_missing");
  if (identity.status !== "active") return review("trusted_identity_inactive");
  if (identity.id !== input.identityId
    || identity.userId !== input.billingOwnerUserId
    || identity.subscriptionCode !== input.subscriptionCode
    || identity.customerCode !== input.customerCode
    || identity.planCode !== input.planCode) {
    return review("trusted_identity_mismatch");
  }
  if (snapshot.activeIdentityCount !== 1) return review("multiple_active_identities");

  const payment = snapshot.providerPayment;
  if (!payment || !payment.valid || payment.status !== "success"
    || payment.amount <= 0 || !payment.providerTransactionId || !isIsoDate(payment.paidAt)) {
    return review("provider_payment_invalid");
  }
  if (payment.reference !== input.reference) return review("provider_reference_mismatch");
  if (payment.customerCode !== input.customerCode) return review("provider_customer_mismatch");
  if (payment.subscriptionCode && payment.subscriptionCode !== input.subscriptionCode) {
    return review("provider_subscription_conflict");
  }
  if (payment.planCode && payment.planCode !== input.planCode) {
    return review("provider_plan_conflict");
  }
  if (payment.amount !== subscription.planAmount) return review("provider_amount_mismatch");
  if (payment.currency.toUpperCase() !== subscription.planCurrency.toUpperCase()) {
    return review("provider_currency_mismatch");
  }

  const providerSubscription = snapshot.providerSubscription;
  if (!providerSubscription || !providerSubscription.valid) {
    return review("provider_subscription_invalid");
  }
  if (providerSubscription.subscriptionCode !== input.subscriptionCode
    || providerSubscription.customerCode !== input.customerCode
    || providerSubscription.planCode !== input.planCode) {
    return review("provider_relationship_mismatch");
  }

  if (snapshot.existingPayment) {
    if (snapshot.existingPayment.userId === input.billingOwnerUserId
      && snapshot.existingPayment.subscriptionId === input.localSubscriptionId
      && snapshot.existingPayment.reference === input.reference) {
      return { outcome: "already_applied" };
    }
    return review("payment_reference_conflict");
  }

  return {
    outcome: "ready_for_manual_accounting_settlement",
    providerPayment: {
      providerTransactionId: payment.providerTransactionId,
      amount: payment.amount,
      currency: payment.currency.toUpperCase(),
      paidAt: payment.paidAt,
    },
    preview: buildPreview(input, snapshot, payment.providerTransactionId),
  };
}

export function createManualLegacyPaystackAccountingSettlementService(
  repository: ManualLegacyPaystackAccountingRepository,
) {
  return {
    async preview(
      input: ManualLegacyPaystackAccountingInput,
    ): Promise<ManualLegacyPaystackAccountingAssessment> {
      return classifyManualLegacyPaystackAccountingSettlement(
        input,
        await repository.loadSnapshot(input),
      );
    },

    async execute(
      input: ManualLegacyPaystackAccountingInput,
      adminUserId: number,
      confirmation: { confirmed: boolean; previewFingerprint: string },
    ): Promise<ManualLegacyPaystackAccountingExecutionResult> {
      if (!confirmation.confirmed || !Number.isInteger(adminUserId) || adminUserId <= 0) {
        return { outcome: "confirmation_required" };
      }
      return repository.runAtomicallyWithBillingOwnerLock36(
        input.billingOwnerUserId,
        async () => {
          const assessment = classifyManualLegacyPaystackAccountingSettlement(
            input,
            await repository.loadSnapshot(input),
          );
          if (assessment.outcome !== "ready_for_manual_accounting_settlement") {
            return assessment;
          }
          if (assessment.preview.confirmationFingerprint !== confirmation.previewFingerprint) {
            return { outcome: "preview_changed" };
          }

          const claim = await repository.claimReferenceAndInsertPayment(input, assessment);
          if (claim === "already_applied") return { outcome: "already_applied" };
          if (claim === "conflict") {
            return { outcome: "manual_review_required", reason: "payment_reference_conflict" };
          }

          await repository.applyFinancialAccounting(input, assessment);
          await repository.recordAuditEvent({
            eventType: MANUAL_ACCOUNTING_SETTLEMENT_EVENT,
            adminUserId,
            billingOwnerUserId: input.billingOwnerUserId,
            localSubscriptionId: input.localSubscriptionId,
            identityId: input.identityId,
            paymentReference: input.reference,
            providerTransactionId: assessment.providerPayment.providerTransactionId,
            subscriptionCode: input.subscriptionCode,
            customerCode: input.customerCode,
            planCode: input.planCode,
            amount: assessment.providerPayment.amount,
            currency: assessment.providerPayment.currency,
            paidAt: assessment.providerPayment.paidAt,
            preservedSubscriptionStartDate: assessment.preview.preserved.subscriptionStartDate,
            preservedNextBillingDate: assessment.preview.preserved.nextBillingDate,
            preservedEntitlementExpiresAt: assessment.preview.preserved.entitlementExpiresAt,
            entitlementChange: "none",
            providerMutation: "none",
            compensationEvidenceCreated: false,
          });
          return { outcome: "manual_accounting_settled", preview: assessment.preview };
        },
      );
    },
  };
}
