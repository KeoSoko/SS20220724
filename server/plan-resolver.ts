import type { SubscriptionPlan } from "@shared/schema";

export type PlanResolutionSource =
  | "transaction_plan_code"
  | "metadata_plan_code"
  | "metadata_plan_id";

export interface PlanResolution {
  plan: SubscriptionPlan;
  source: PlanResolutionSource;
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
