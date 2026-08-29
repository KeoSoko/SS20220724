export interface TrustedPaystackIdentityForSupersession {
  userId: number;
  subscriptionCode: string;
  customerCode: string | null;
  planCode: string | null;
}

export interface SupersededPaystackSubscriptionReview {
  schemaVersion: 1;
  reason: "trusted_subscription_replaced_by_different_plan";
  billingOwnerUserId: number;
  customerCode: string;
  supersededSubscriptionCode: string;
  supersededPlanCode: string;
  authoritativeSubscriptionCode: string;
  authoritativePlanCode: string;
  recommendedAction: "verify_then_disable_superseded_subscription";
  providerMutation: "none";
}

export function classifySupersededPaystackSubscription(
  billingOwnerUserId: number,
  previous: TrustedPaystackIdentityForSupersession | null,
  authoritative: TrustedPaystackIdentityForSupersession,
): SupersededPaystackSubscriptionReview | null {
  if (!previous
    || previous.userId !== billingOwnerUserId
    || authoritative.userId !== billingOwnerUserId
    || previous.subscriptionCode === authoritative.subscriptionCode
    || !previous.customerCode
    || previous.customerCode !== authoritative.customerCode
    || !previous.planCode
    || !authoritative.planCode
    || previous.planCode === authoritative.planCode) {
    return null;
  }
  return {
    schemaVersion: 1,
    reason: "trusted_subscription_replaced_by_different_plan",
    billingOwnerUserId,
    customerCode: authoritative.customerCode,
    supersededSubscriptionCode: previous.subscriptionCode,
    supersededPlanCode: previous.planCode,
    authoritativeSubscriptionCode: authoritative.subscriptionCode,
    authoritativePlanCode: authoritative.planCode,
    recommendedAction: "verify_then_disable_superseded_subscription",
    providerMutation: "none",
  };
}
