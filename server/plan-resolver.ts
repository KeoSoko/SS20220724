import type { SubscriptionPlan } from "@shared/schema";

export type PlanResolutionSource =
  | "transaction_plan_code"
  | "metadata_plan_code"
  | "metadata_plan_id"
  | "existing_subscription_renewal";

export interface PlanResolution {
  plan: SubscriptionPlan;
  source: PlanResolutionSource;
}

/** Minimal shape of an existing subscription needed to inherit its plan on renewal. */
export interface ExistingSubscriptionForRenewal {
  status: string;
  planId: number;
}

/**
 * Deterministically resolve which subscription plan a Paystack transaction is for.
 *
 * Resolution order (NEVER by payment amount):
 *   1. The transaction's Paystack plan code (`data.plan.plan_code`) -> subscription_plans.paystackPlanCode
 *   2. The checkout metadata plan code (`data.metadata.plan_code`)  -> subscription_plans.paystackPlanCode
 *   3. The checkout metadata plan id   (`data.metadata.plan_id`)    -> subscription_plans.id
 *
 * Returns null when no plan can be resolved, so the caller can flag the
 * transaction for manual review instead of silently defaulting to a plan.
 */
export function resolvePlanForTransaction(
  transactionData: any,
  plans: SubscriptionPlan[],
): PlanResolution | null {
  if (!transactionData || !Array.isArray(plans)) return null;

  const txPlanCode = transactionData.plan?.plan_code;
  if (txPlanCode) {
    const plan = plans.find((p) => !!p.paystackPlanCode && p.paystackPlanCode === txPlanCode);
    if (plan) return { plan, source: "transaction_plan_code" };
  }

  const metaPlanCode = transactionData.metadata?.plan_code;
  if (metaPlanCode) {
    const plan = plans.find((p) => !!p.paystackPlanCode && p.paystackPlanCode === metaPlanCode);
    if (plan) return { plan, source: "metadata_plan_code" };
  }

  const metaPlanId = transactionData.metadata?.plan_id;
  if (metaPlanId !== undefined && metaPlanId !== null && `${metaPlanId}`.trim() !== "") {
    const idNum = Number(metaPlanId);
    if (!Number.isNaN(idNum)) {
      const plan = plans.find((p) => p.id === idNum);
      if (plan) return { plan, source: "metadata_plan_id" };
    }
  }

  return null;
}

/**
 * Resolve a plan for a charge, with a safe renewal fallback.
 *
 * First tries the deterministic payload-based resolution. If that fails (the
 * charge carried no plan code and no plan metadata — which Paystack can do for
 * some recurring renewal charges), AND the customer already has an ACTIVE or
 * payment-PAUSED subscription, inherit that subscription's CURRENT plan and
 * treat the charge as a renewal. Paused is included so a delayed success can
 * recover an exact-identity unpaid renewal.
 *
 * This NEVER guesses a plan by amount: it only reuses the exact plan the
 * customer is already on. Expired and cancelled accounts still resolve to null
 * so lifecycle policy is not guessed here.
 */
export function resolvePlanWithRenewalFallback(
  transactionData: any,
  plans: SubscriptionPlan[],
  existingSubscription: ExistingSubscriptionForRenewal | null | undefined,
): PlanResolution | null {
  const direct = resolvePlanForTransaction(transactionData, plans);
  if (direct) return direct;

  if (
    existingSubscription &&
    (existingSubscription.status === "active" || existingSubscription.status === "paused") &&
    Array.isArray(plans)
  ) {
    const plan = plans.find((p) => p.id === existingSubscription.planId);
    if (plan) return { plan, source: "existing_subscription_renewal" };
  }

  return null;
}
