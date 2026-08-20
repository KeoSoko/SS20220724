export interface ManualPaystackIdentityRepairInput {
  billingOwnerUserId: number;
  subscriptionCode: string;
  customerCode: string;
  planCode: string;
}

export interface ManualPaystackIdentityRepairSnapshot {
  billingOwner: { id: number; isCanonicalBillingOwner: boolean } | null;
  localSubscription: {
    id: number;
    userId: number;
    status: string;
    paystackCustomerCode: string | null;
    planCode: string | null;
    subscriptionStartDate: Date | null;
    nextBillingDate: Date | null;
  } | null;
  activeIdentities: Array<{
    userId: number;
    subscriptionCode: string;
    customerCode: string | null;
    planCode: string | null;
    status: string;
    recurringReadiness: string;
  }>;
  identityForSubscriptionCode: {
    userId: number;
    subscriptionCode: string;
    customerCode: string | null;
    planCode: string | null;
    status: string;
    recurringReadiness: string;
  } | null;
  pendingCheckoutCount: number;
}

export type ManualPaystackIdentityRepairReason =
  | "invalid_manual_identity_input"
  | "billing_owner_missing"
  | "not_effective_billing_owner"
  | "local_subscription_missing"
  | "local_subscription_owner_mismatch"
  | "local_plan_missing"
  | "local_plan_code_mismatch"
  | "local_customer_code_mismatch"
  | "conflicting_active_local_identity"
  | "subscription_code_owned_by_another_user"
  | "existing_subscription_identity_conflict"
  | "pending_checkout_conflict";

export interface ManualPaystackIdentityRepairValidation {
  billingOwnerExists: boolean;
  billingOwnerIsCanonical: boolean;
  localSubscriptionExists: boolean;
  localSubscriptionBelongsToBillingOwner: boolean;
  localPlanMatches: boolean;
  storedCustomerMatches: boolean;
  noConflictingActiveIdentity: boolean;
  subscriptionCodeAvailable: boolean;
  noPendingCheckout: boolean;
}

export interface ManualPaystackIdentityRepairPreview {
  outcome: "preview";
  validation: ManualPaystackIdentityRepairValidation;
  currentState: {
    localSubscriptionId: number | null;
    localSubscriptionStatus: string | null;
    localSubscriptionStartDate: Date | null;
    localNextBillingDate: Date | null;
    activeIdentityCodes: string[];
    pendingCheckoutCount: number;
  };
  proposedIdentity: {
    userId: number;
    subscriptionCode: string;
    customerCode: string;
    planCode: string;
    status: "active";
    recurringReadiness: "unknown";
  };
  fieldsThatWouldChange: readonly ["paystack_subscription_identities", "billing_events"];
  fieldsThatRemainUnchanged: readonly [
    "user_subscriptions",
    "user_subscriptions.status",
    "user_subscriptions.subscription_start_date",
    "user_subscriptions.next_billing_date",
    "payment_transactions",
    "entitlements",
    "paystack_checkout_attempts",
  ];
}

export type ManualPaystackIdentityRepairAssessment =
  | { outcome: "valid"; preview: ManualPaystackIdentityRepairPreview }
  | { outcome: "already_reconciled"; preview: ManualPaystackIdentityRepairPreview }
  | {
      outcome: "manual_review_required";
      reason: ManualPaystackIdentityRepairReason;
      validation: ManualPaystackIdentityRepairValidation;
      preview: ManualPaystackIdentityRepairPreview;
    };

export interface ManualPaystackIdentityRepairRepository {
  loadSnapshot(
    input: ManualPaystackIdentityRepairInput,
  ): Promise<ManualPaystackIdentityRepairSnapshot>;
  runWithBillingOwnerLock<T>(
    billingOwnerUserId: number,
    callback: () => Promise<T>,
  ): Promise<T>;
  insertCanonicalIdentity(input: ManualPaystackIdentityRepairInput): Promise<void>;
  recordAuditEvent(
    input: ManualPaystackIdentityRepairInput,
    adminUserId: number,
    localSubscriptionId: number,
  ): Promise<void>;
}

export type ManualPaystackIdentityRepairExecution =
  | { outcome: "repaired"; preview: ManualPaystackIdentityRepairPreview }
  | { outcome: "already_reconciled"; preview: ManualPaystackIdentityRepairPreview }
  | {
      outcome: "manual_review_required";
      reason: ManualPaystackIdentityRepairReason;
      validation: ManualPaystackIdentityRepairValidation;
      preview: ManualPaystackIdentityRepairPreview;
    };

function hasExpectedFormat(input: ManualPaystackIdentityRepairInput): boolean {
  return Number.isInteger(input.billingOwnerUserId)
    && input.billingOwnerUserId > 0
    && /^SUB_[A-Za-z0-9_-]+$/.test(input.subscriptionCode)
    && /^CUS_[A-Za-z0-9_-]+$/.test(input.customerCode)
    && /^PLN_[A-Za-z0-9_-]+$/.test(input.planCode);
}

function currentState(snapshot: ManualPaystackIdentityRepairSnapshot) {
  return {
    localSubscriptionId: snapshot.localSubscription?.id ?? null,
    localSubscriptionStatus: snapshot.localSubscription?.status ?? null,
    localSubscriptionStartDate: snapshot.localSubscription?.subscriptionStartDate ?? null,
    localNextBillingDate: snapshot.localSubscription?.nextBillingDate ?? null,
    activeIdentityCodes: snapshot.activeIdentities.map((identity) => identity.subscriptionCode),
    pendingCheckoutCount: snapshot.pendingCheckoutCount,
  };
}

function preview(
  input: ManualPaystackIdentityRepairInput,
  snapshot: ManualPaystackIdentityRepairSnapshot,
  validation: ManualPaystackIdentityRepairValidation,
): ManualPaystackIdentityRepairPreview {
  return {
    outcome: "preview",
    validation,
    currentState: currentState(snapshot),
    proposedIdentity: {
      userId: input.billingOwnerUserId,
      subscriptionCode: input.subscriptionCode,
      customerCode: input.customerCode,
      planCode: input.planCode,
      status: "active",
      recurringReadiness: "unknown",
    },
    fieldsThatWouldChange: ["paystack_subscription_identities", "billing_events"],
    fieldsThatRemainUnchanged: [
      "user_subscriptions",
      "user_subscriptions.status",
      "user_subscriptions.subscription_start_date",
      "user_subscriptions.next_billing_date",
      "payment_transactions",
      "entitlements",
      "paystack_checkout_attempts",
    ],
  };
}

export function assessManualPaystackIdentityRepair(
  input: ManualPaystackIdentityRepairInput,
  snapshot: ManualPaystackIdentityRepairSnapshot,
): ManualPaystackIdentityRepairAssessment {
  const localSubscription = snapshot.localSubscription;
  const activeIdentities = snapshot.activeIdentities;
  const codeIdentity = snapshot.identityForSubscriptionCode;
  const validation: ManualPaystackIdentityRepairValidation = {
    billingOwnerExists: Boolean(snapshot.billingOwner),
    billingOwnerIsCanonical: snapshot.billingOwner?.isCanonicalBillingOwner === true,
    localSubscriptionExists: Boolean(localSubscription),
    localSubscriptionBelongsToBillingOwner: localSubscription?.userId === input.billingOwnerUserId,
    localPlanMatches: localSubscription?.planCode === input.planCode,
    storedCustomerMatches: localSubscription?.paystackCustomerCode === input.customerCode,
    noConflictingActiveIdentity: activeIdentities.every(
      (identity) => identity.subscriptionCode === input.subscriptionCode,
    ),
    subscriptionCodeAvailable: !codeIdentity || codeIdentity.userId === input.billingOwnerUserId,
    noPendingCheckout: snapshot.pendingCheckoutCount === 0,
  };
  const blocked = (reason: ManualPaystackIdentityRepairReason): ManualPaystackIdentityRepairAssessment => ({
    outcome: "manual_review_required",
    reason,
    validation,
    preview: preview(input, snapshot, validation),
  });

  if (!hasExpectedFormat(input)) {
    return blocked("invalid_manual_identity_input");
  }
  if (!validation.billingOwnerExists) {
    return blocked("billing_owner_missing");
  }
  if (!validation.billingOwnerIsCanonical) {
    return blocked("not_effective_billing_owner");
  }
  if (!validation.localSubscriptionExists) {
    return blocked("local_subscription_missing");
  }
  if (!validation.localSubscriptionBelongsToBillingOwner) {
    return blocked("local_subscription_owner_mismatch");
  }
  if (!localSubscription?.planCode) {
    return blocked("local_plan_missing");
  }
  if (!validation.localPlanMatches) {
    return blocked("local_plan_code_mismatch");
  }
  if (!validation.storedCustomerMatches) {
    return blocked("local_customer_code_mismatch");
  }
  if (!validation.noPendingCheckout) {
    return blocked("pending_checkout_conflict");
  }
  if (codeIdentity && codeIdentity.userId !== input.billingOwnerUserId) {
    return blocked("subscription_code_owned_by_another_user");
  }
  if (activeIdentities.some((identity) => identity.subscriptionCode !== input.subscriptionCode)) {
    return blocked("conflicting_active_local_identity");
  }
  if (codeIdentity) {
    const isAlreadyReconciled = codeIdentity.status === "active"
      && codeIdentity.customerCode === input.customerCode
      && codeIdentity.planCode === input.planCode
      && codeIdentity.recurringReadiness === "unknown";
    if (isAlreadyReconciled) {
      return { outcome: "already_reconciled", preview: preview(input, snapshot, validation) };
    }
    return blocked("existing_subscription_identity_conflict");
  }

  return { outcome: "valid", preview: preview(input, snapshot, validation) };
}

export function createManualPaystackIdentityRepairService(
  repository: ManualPaystackIdentityRepairRepository,
) {
  return {
    async preview(input: ManualPaystackIdentityRepairInput): Promise<ManualPaystackIdentityRepairAssessment> {
      return assessManualPaystackIdentityRepair(input, await repository.loadSnapshot(input));
    },

    async execute(
      input: ManualPaystackIdentityRepairInput,
      adminUserId: number,
    ): Promise<ManualPaystackIdentityRepairExecution> {
      return repository.runWithBillingOwnerLock(input.billingOwnerUserId, async () => {
        const assessment = assessManualPaystackIdentityRepair(input, await repository.loadSnapshot(input));
        if (assessment.outcome === "manual_review_required") return assessment;
        if (assessment.outcome === "already_reconciled") return assessment;

        await repository.insertCanonicalIdentity(input);
        const localSubscriptionId = assessment.preview.currentState.localSubscriptionId;
        if (!localSubscriptionId) {
          return {
            outcome: "manual_review_required",
            reason: "local_subscription_missing",
            validation: assessment.preview.validation,
            preview: assessment.preview,
          };
        }
        await repository.recordAuditEvent(input, adminUserId, localSubscriptionId);
        return { outcome: "repaired", preview: assessment.preview };
      });
    },
  };
}