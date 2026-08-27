export type PaystackCancellationStatus =
  | "requested"
  | "provider_call_started"
  | "provider_confirmation_pending"
  | "provider_result_unknown"
  | "failed_retryable"
  | "manual_review_required"
  | "provider_non_renewing"
  | "provider_disabled"
  | "completed";

export interface CancellationAttemptRecord {
  id: number;
  billingOwnerUserId: number;
  subscriptionCode: string | null;
  status: PaystackCancellationStatus;
  requestedAt: Date;
  providerCallStartedAt?: Date | null;
  providerConfirmedAt?: Date | null;
  lastCheckedAt?: Date | null;
  attemptCount?: number;
  failureCode?: string | null;
  failureDetail?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

interface CancellationDependencies {
  withBillingOwnerLock<T>(billingOwnerUserId: number, fn: () => Promise<T>): Promise<T>;
  getSubscription(userId: number): Promise<any | null>;
  getPlan(planId: number): Promise<any | null>;
  getActiveIdentities(userId: number): Promise<any[]>;
  getOpenAttempt(userId: number): Promise<CancellationAttemptRecord | null>;
  getAttemptBySubscriptionCode(code: string): Promise<CancellationAttemptRecord | null>;
  saveAttempt(input: Partial<CancellationAttemptRecord> & Pick<CancellationAttemptRecord, "billingOwnerUserId" | "subscriptionCode" | "status" | "requestedAt">): Promise<CancellationAttemptRecord>;
  markCancellationRequested(userId: number, requestedAt: Date): Promise<void>;
}

const confirmedStates = new Set<PaystackCancellationStatus>([
  "provider_non_renewing", "provider_disabled", "completed",
]);

export function createPaystackCancellationCoordinator(deps: CancellationDependencies) {
  return {
    async requestCancellation(billingOwnerUserId: number) {
      return deps.withBillingOwnerLock(billingOwnerUserId, async () => {
        const existing = await deps.getOpenAttempt(billingOwnerUserId);
        if (existing) {
          return {
            outcome: existing.status === "manual_review_required" ? "manual_review_required" : "requested",
            attempt: existing,
          } as const;
        }
        const subscription = await deps.getSubscription(billingOwnerUserId);
        const plan = subscription ? await deps.getPlan(subscription.planId) : null;
        const identities = await deps.getActiveIdentities(billingOwnerUserId);
        const exact = identities.filter((identity) =>
          identity.status === "active"
          && identity.userId === billingOwnerUserId
          && !!identity.subscriptionCode
          && !!identity.customerCode
          && identity.customerCode === subscription?.paystackCustomerCode
          && identity.planCode === plan?.paystackPlanCode
        );
        const requestedAt = new Date();
        const safe = exact.length === 1 && identities.length === 1;
        const attempt = await deps.saveAttempt({
          billingOwnerUserId,
          subscriptionCode: safe ? exact[0].subscriptionCode : null,
          status: safe ? "requested" : "manual_review_required",
          requestedAt,
          failureCode: safe ? null : identities.length === 0 ? "missing_active_identity" : "ambiguous_active_identity",
        });
        await deps.markCancellationRequested(billingOwnerUserId, requestedAt);
        return { outcome: safe ? "requested" : "manual_review_required", attempt } as const;
      });
    },

    async confirmLifecycle(input: {
      subscriptionCode: string;
      customerCode: string;
      event: "subscription.not_renew" | "subscription.disable";
    }) {
      const attempt = await deps.getAttemptBySubscriptionCode(input.subscriptionCode);
      if (!attempt) return { outcome: "rejected", reason: "cancellation_attempt_missing" } as const;
      return deps.withBillingOwnerLock(attempt.billingOwnerUserId, async () => {
        const identities = await deps.getActiveIdentities(attempt.billingOwnerUserId);
        const identity = identities.find((candidate) => candidate.subscriptionCode === input.subscriptionCode);
        if (!identity || identity.customerCode !== input.customerCode) {
          return { outcome: "rejected", reason: "cancellation_identity_mismatch" } as const;
        }
        const targetStatus: PaystackCancellationStatus = input.event === "subscription.disable"
          ? "provider_disabled"
          : "provider_non_renewing";
        if (attempt.status === "provider_disabled" || (attempt.status === targetStatus && confirmedStates.has(attempt.status))) {
          return { outcome: "confirmed", attempt } as const;
        }
        const updated = await deps.saveAttempt({
          ...attempt,
          status: targetStatus,
          providerConfirmedAt: attempt.providerConfirmedAt ?? new Date(),
        });
        return { outcome: "confirmed", attempt: updated } as const;
      });
    },
  };
}

export function hasCancellationPaidAccess(
  subscription: { status: string; nextBillingDate: Date | string | null },
  attempt: Pick<CancellationAttemptRecord, "status"> | null,
  now = new Date(),
): boolean {
  if (!attempt || !confirmedStates.has(attempt.status)) return subscription.status === "active";
  return !!subscription.nextBillingDate && new Date(subscription.nextBillingDate).getTime() > now.getTime();
}
