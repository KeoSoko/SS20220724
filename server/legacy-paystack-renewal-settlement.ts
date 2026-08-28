import { createHash } from "node:crypto";

export type LegacyRenewalSettlementAppliedOutcome =
  | "payment_and_entitlement_applied"
  | "payment_applied_entitlement_already_granted";

export type LegacyRenewalSettlementReviewReason =
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
  | "provider_amount_mismatch"
  | "provider_currency_mismatch"
  | "provider_reference_mismatch"
  | "provider_customer_mismatch"
  | "provider_subscription_conflict"
  | "provider_plan_conflict"
  | "provider_subscription_invalid"
  | "provider_relationship_mismatch"
  | "provider_period_invalid"
  | "payment_reference_conflict"
  | "entitlement_boundary_mismatch"
  | "compensation_activation_not_explicitly_linked_to_payment"
  | "compensation_interval_mismatch"
  | "compensation_state_mismatch"
  | "multiple_compensation_events";

export interface LegacyRenewalSettlementInput {
  billingOwnerUserId: number;
  localSubscriptionId: number;
  identityId: number;
  reference: string;
  subscriptionCode: string;
  customerCode: string;
  planCode: string;
}

export interface StructuredLegacyRenewalCompensationEvent {
  /** Populated from billing_events.id when durable evidence is loaded. */
  billingEventId: number | null;
  schemaVersion: 1;
  eventType: "admin_verified_renewal_entitlement_compensation";
  source: "server_verified_admin_recovery";
  reason: "verified_renewal_entitlement_compensation";
  adminUserId: number;
  billingOwnerUserId: number;
  localSubscriptionId: number;
  identityId: number;
  paymentReference: string;
  providerTransactionId: string;
  subscriptionCode: string;
  customerCode: string;
  planCode: string;
  paidAt: string;
  previousNextBillingDate: string;
  previousEntitlementExpiresAt: string;
  grantedPeriodStart: string;
  grantedPeriodEnd: string;
  resultingNextBillingDate: string;
  resultingEntitlementExpiresAt: string;
  providerMutation: "none";
  recordedAt: string;
}

export interface LegacyRenewalSettlementSnapshot {
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
  providerSubscription: {
    valid: boolean;
    subscriptionCode: string | null;
    customerCode: string | null;
    planCode: string | null;
    status: string;
    renewalPeriodStart: string | null;
    renewalPeriodEnd: string | null;
  } | null;
  structuredCompensationEvents: StructuredLegacyRenewalCompensationEvent[];
  legacyActivationEvents: Array<{
    eventId: number;
    createdAt: string;
    adminUserId: number | null;
    reason: string | null;
  }>;
  existingPayment: {
    userId: number;
    subscriptionId: number;
    reference: string;
    outcome: LegacyRenewalSettlementAppliedOutcome;
  } | null;
}

export interface LegacyRenewalSettlementPreview {
  current: {
    nextBillingDate: string | null;
    entitlementExpiresAt: string | null;
    totalPaid: number | null;
    lastPaymentDate: string | null;
    paystackReference: string | null;
  };
  proposed: {
    nextBillingDate: string | null;
    entitlementExpiresAt: string | null;
    totalPaid: number | null;
    lastPaymentDate: string | null;
    paystackReference: string | null;
  };
  executionPermitted: boolean;
  compensationEventId: number | null;
}

export type LegacyRenewalSettlementAssessment =
  | {
      outcome: "payment_and_entitlement_applied";
      preview: LegacyRenewalSettlementPreview;
    }
  | {
      outcome: "payment_applied_entitlement_already_granted";
      preview: LegacyRenewalSettlementPreview;
    }
  | {
      outcome: "already_applied";
      preview: LegacyRenewalSettlementPreview;
    }
  | {
      outcome: "manual_review_required";
      reason: LegacyRenewalSettlementReviewReason;
      preview: LegacyRenewalSettlementPreview;
    };

export type LegacyRenewalSettlementExecutionResult =
  | LegacyRenewalSettlementAssessment
  | { outcome: "preview_changed"; preview: LegacyRenewalSettlementPreview };

export function legacyRenewalSettlementFingerprint(
  input: LegacyRenewalSettlementInput,
  assessment: LegacyRenewalSettlementAssessment,
): string {
  return createHash("sha256").update(JSON.stringify({ input, assessment })).digest("hex");
}

export interface LegacyRenewalSettlementAuditEvent {
  eventType: "admin_legacy_renewal_settled";
  outcome: LegacyRenewalSettlementAppliedOutcome;
  adminUserId: number;
  billingOwnerUserId: number;
  localSubscriptionId: number;
  identityId: number;
  paymentReference: string;
  subscriptionCode: string;
  customerCode: string;
  planCode: string;
  compensationEventId: number | null;
  providerMutation: "none";
}

export interface LegacyRenewalSettlementRepository {
  loadSnapshot(input: LegacyRenewalSettlementInput): Promise<LegacyRenewalSettlementSnapshot>;
  runAtomicallyWithBillingOwnerLock<T>(
    billingOwnerUserId: number,
    callback: () => Promise<T>,
  ): Promise<T>;
  claimPaymentReference(
    input: LegacyRenewalSettlementInput,
    classification: LegacyRenewalSettlementAppliedOutcome,
  ): Promise<"claimed" | "already_applied" | "conflict">;
  applyPaymentAndEntitlement(
    input: LegacyRenewalSettlementInput,
    assessment: Extract<LegacyRenewalSettlementAssessment, { outcome: "payment_and_entitlement_applied" }>,
  ): Promise<void>;
  applyPaymentForPreviouslyGrantedEntitlement(
    input: LegacyRenewalSettlementInput,
    assessment: Extract<LegacyRenewalSettlementAssessment, { outcome: "payment_applied_entitlement_already_granted" }>,
  ): Promise<void>;
  recordAuditEvent(event: LegacyRenewalSettlementAuditEvent): Promise<void>;
}

function isIsoDate(value: string | null | undefined): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function sameInstant(left: string | null | undefined, right: string | null | undefined): boolean {
  return isIsoDate(left) && isIsoDate(right) && Date.parse(left) === Date.parse(right);
}

function validInput(input: LegacyRenewalSettlementInput): boolean {
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

export function buildStructuredCompensationEvent(input: {
  adminUserId: number;
  input: LegacyRenewalSettlementInput;
  providerTransactionId: string;
  paidAt: string;
  previousNextBillingDate: string;
  previousEntitlementExpiresAt: string;
  grantedPeriodStart: string;
  grantedPeriodEnd: string;
  resultingNextBillingDate: string;
  resultingEntitlementExpiresAt: string;
  recordedAt: string;
}): StructuredLegacyRenewalCompensationEvent {
  return {
    billingEventId: null,
    schemaVersion: 1,
    eventType: "admin_verified_renewal_entitlement_compensation",
    source: "server_verified_admin_recovery",
    reason: "verified_renewal_entitlement_compensation",
    adminUserId: input.adminUserId,
    billingOwnerUserId: input.input.billingOwnerUserId,
    localSubscriptionId: input.input.localSubscriptionId,
    identityId: input.input.identityId,
    paymentReference: input.input.reference,
    providerTransactionId: input.providerTransactionId,
    subscriptionCode: input.input.subscriptionCode,
    customerCode: input.input.customerCode,
    planCode: input.input.planCode,
    paidAt: input.paidAt,
    previousNextBillingDate: input.previousNextBillingDate,
    previousEntitlementExpiresAt: input.previousEntitlementExpiresAt,
    grantedPeriodStart: input.grantedPeriodStart,
    grantedPeriodEnd: input.grantedPeriodEnd,
    resultingNextBillingDate: input.resultingNextBillingDate,
    resultingEntitlementExpiresAt: input.resultingEntitlementExpiresAt,
    providerMutation: "none",
    recordedAt: input.recordedAt,
  };
}

function previewFor(
  snapshot: LegacyRenewalSettlementSnapshot,
  outcome: LegacyRenewalSettlementAppliedOutcome | "manual_review_required" | "already_applied",
  compensationEvent: StructuredLegacyRenewalCompensationEvent | null = null,
): LegacyRenewalSettlementPreview {
  const current = {
    nextBillingDate: snapshot.localSubscription?.nextBillingDate ?? null,
    entitlementExpiresAt: snapshot.entitlement.expiresAt,
    totalPaid: snapshot.localSubscription?.totalPaid ?? null,
    lastPaymentDate: snapshot.localSubscription?.lastPaymentDate ?? null,
    paystackReference: snapshot.localSubscription?.paystackReference ?? null,
  };
  const payment = snapshot.providerPayment;
  const proposedLastPaymentDate = payment
    && (!current.lastPaymentDate || Date.parse(payment.paidAt) > Date.parse(current.lastPaymentDate))
    ? payment.paidAt
    : current.lastPaymentDate;
  const proposedReference = proposedLastPaymentDate === payment?.paidAt
    ? payment.reference
    : current.paystackReference;
  const appliesEntitlement = outcome === "payment_and_entitlement_applied";
  const appliesPayment = appliesEntitlement
    || outcome === "payment_applied_entitlement_already_granted";
  return {
    current,
    proposed: {
      nextBillingDate: appliesEntitlement
        ? snapshot.providerSubscription?.renewalPeriodEnd ?? current.nextBillingDate
        : current.nextBillingDate,
      entitlementExpiresAt: appliesEntitlement
        ? snapshot.providerSubscription?.renewalPeriodEnd ?? current.entitlementExpiresAt
        : current.entitlementExpiresAt,
      totalPaid: appliesPayment && current.totalPaid !== null && payment
        ? current.totalPaid + payment.amount
        : current.totalPaid,
      lastPaymentDate: appliesPayment ? proposedLastPaymentDate : current.lastPaymentDate,
      paystackReference: appliesPayment ? proposedReference : current.paystackReference,
    },
    executionPermitted: outcome === "payment_and_entitlement_applied"
      || outcome === "payment_applied_entitlement_already_granted",
    compensationEventId: compensationEvent?.billingEventId ?? null,
  };
}

export function classifyLegacyRenewalSettlement(
  input: LegacyRenewalSettlementInput,
  snapshot: LegacyRenewalSettlementSnapshot,
): LegacyRenewalSettlementAssessment {
  const review = (
    reason: LegacyRenewalSettlementReviewReason,
  ): LegacyRenewalSettlementAssessment => ({
    outcome: "manual_review_required",
    reason,
    preview: previewFor(snapshot, "manual_review_required"),
  });

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
  if (!['active', 'paused'].includes(subscription.status)) {
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
    || payment.amount <= 0 || !isIsoDate(payment.paidAt) || !payment.providerTransactionId) {
    return review("provider_payment_invalid");
  }
  if (payment.reference !== input.reference) return review("provider_reference_mismatch");
  if (payment.customerCode !== input.customerCode) return review("provider_customer_mismatch");
  if (payment.amount !== subscription.planAmount) return review("provider_amount_mismatch");
  if (payment.currency.toUpperCase() !== subscription.planCurrency.toUpperCase()) {
    return review("provider_currency_mismatch");
  }
  if (payment.subscriptionCode && payment.subscriptionCode !== input.subscriptionCode) {
    return review("provider_subscription_conflict");
  }
  if (payment.planCode && payment.planCode !== input.planCode) {
    return review("provider_plan_conflict");
  }

  const providerSubscription = snapshot.providerSubscription;
  if (!providerSubscription || !providerSubscription.valid
    || !['active', 'non-renewing'].includes(providerSubscription.status)) {
    return review("provider_subscription_invalid");
  }
  if (providerSubscription.subscriptionCode !== input.subscriptionCode
    || providerSubscription.customerCode !== input.customerCode
    || providerSubscription.planCode !== input.planCode) {
    return review("provider_relationship_mismatch");
  }
  if (!isIsoDate(providerSubscription.renewalPeriodStart)
    || !isIsoDate(providerSubscription.renewalPeriodEnd)
    || Date.parse(providerSubscription.renewalPeriodStart) >= Date.parse(providerSubscription.renewalPeriodEnd)) {
    return review("provider_period_invalid");
  }

  if (snapshot.existingPayment) {
    if (snapshot.existingPayment.userId === input.billingOwnerUserId
      && snapshot.existingPayment.subscriptionId === input.localSubscriptionId
      && snapshot.existingPayment.reference === input.reference) {
      return { outcome: "already_applied", preview: previewFor(snapshot, "already_applied") };
    }
    return review("payment_reference_conflict");
  }

  const compensationCandidates = snapshot.structuredCompensationEvents.filter(
    (event) => event.paymentReference === input.reference,
  );
  if (compensationCandidates.length > 1) {
    return review("multiple_compensation_events");
  }
  const compensation = compensationCandidates[0] ?? null;
  if (compensation) {
    const exactIdentity = Number.isInteger(compensation.billingEventId)
      && compensation.billingEventId! > 0
      && compensation.schemaVersion === 1
      && compensation.eventType === "admin_verified_renewal_entitlement_compensation"
      && compensation.source === "server_verified_admin_recovery"
      && compensation.reason === "verified_renewal_entitlement_compensation"
      && compensation.providerMutation === "none"
      && compensation.billingOwnerUserId === input.billingOwnerUserId
      && compensation.localSubscriptionId === input.localSubscriptionId
      && compensation.identityId === input.identityId
      && compensation.paymentReference === input.reference
      && compensation.providerTransactionId === payment.providerTransactionId
      && compensation.subscriptionCode === input.subscriptionCode
      && compensation.customerCode === input.customerCode
      && compensation.planCode === input.planCode
      && sameInstant(compensation.paidAt, payment.paidAt);
    if (!exactIdentity
      || !sameInstant(compensation.previousNextBillingDate, providerSubscription.renewalPeriodStart)
      || !sameInstant(compensation.previousEntitlementExpiresAt, providerSubscription.renewalPeriodStart)
      || !sameInstant(compensation.grantedPeriodStart, providerSubscription.renewalPeriodStart)
      || !sameInstant(compensation.grantedPeriodEnd, providerSubscription.renewalPeriodEnd)
      || !sameInstant(compensation.resultingNextBillingDate, providerSubscription.renewalPeriodEnd)
      || !sameInstant(compensation.resultingEntitlementExpiresAt, providerSubscription.renewalPeriodEnd)) {
      return review("compensation_interval_mismatch");
    }
    if (!sameInstant(subscription.nextBillingDate, compensation.resultingNextBillingDate)
      || !sameInstant(snapshot.entitlement.expiresAt, compensation.resultingEntitlementExpiresAt)) {
      return review("compensation_state_mismatch");
    }
    return {
      outcome: "payment_applied_entitlement_already_granted",
      preview: previewFor(snapshot, "payment_applied_entitlement_already_granted", compensation),
    };
  }

  const currentAtPreRenewalBoundary = sameInstant(
    subscription.nextBillingDate,
    providerSubscription.renewalPeriodStart,
  ) && sameInstant(snapshot.entitlement.expiresAt, providerSubscription.renewalPeriodStart);
  if (currentAtPreRenewalBoundary) {
    return {
      outcome: "payment_and_entitlement_applied",
      preview: previewFor(snapshot, "payment_and_entitlement_applied"),
    };
  }
  if (snapshot.legacyActivationEvents.length > 0) {
    return review("compensation_activation_not_explicitly_linked_to_payment");
  }
  return review("entitlement_boundary_mismatch");
}

export function createLegacyRenewalSettlementService(
  repository: LegacyRenewalSettlementRepository,
) {
  return {
    async preview(input: LegacyRenewalSettlementInput): Promise<LegacyRenewalSettlementAssessment> {
      return classifyLegacyRenewalSettlement(input, await repository.loadSnapshot(input));
    },

    async execute(
      input: LegacyRenewalSettlementInput,
      adminUserId: number,
      previewFingerprint?: string,
    ): Promise<LegacyRenewalSettlementExecutionResult> {
      return repository.runAtomicallyWithBillingOwnerLock(input.billingOwnerUserId, async () => {
        const assessment = classifyLegacyRenewalSettlement(input, await repository.loadSnapshot(input));
        if (previewFingerprint
          && legacyRenewalSettlementFingerprint(input, assessment) !== previewFingerprint) {
          return { outcome: "preview_changed", preview: assessment.preview };
        }
        if (assessment.outcome === "manual_review_required"
          || assessment.outcome === "already_applied") {
          return assessment;
        }

        const claim = await repository.claimPaymentReference(input, assessment.outcome);
        if (claim === "already_applied") {
          return { outcome: "already_applied", preview: assessment.preview };
        }
        if (claim === "conflict") {
          return {
            outcome: "manual_review_required",
            reason: "payment_reference_conflict",
            preview: { ...assessment.preview, executionPermitted: false },
          };
        }

        if (assessment.outcome === "payment_and_entitlement_applied") {
          await repository.applyPaymentAndEntitlement(input, assessment);
        } else {
          await repository.applyPaymentForPreviouslyGrantedEntitlement(input, assessment);
        }
        await repository.recordAuditEvent({
          eventType: "admin_legacy_renewal_settled",
          outcome: assessment.outcome,
          adminUserId,
          billingOwnerUserId: input.billingOwnerUserId,
          localSubscriptionId: input.localSubscriptionId,
          identityId: input.identityId,
          paymentReference: input.reference,
          subscriptionCode: input.subscriptionCode,
          customerCode: input.customerCode,
          planCode: input.planCode,
          compensationEventId: assessment.preview.compensationEventId,
          providerMutation: "none",
        });
        return assessment;
      });
    },
  };
}
