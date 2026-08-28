import type {
  LegacyRenewalSettlementAssessment,
  LegacyRenewalSettlementInput,
} from "./legacy-paystack-renewal-settlement";

export interface LegacyRenewalShadowObservation {
  schemaVersion: 1;
  mode: "shadow";
  paymentReference: string;
  billingOwnerUserId: number;
  localSubscriptionId: number;
  identityId: number;
  subscriptionCode: string;
  customerCode: string;
  planCode: string;
  classification: LegacyRenewalSettlementAssessment["outcome"];
  reason: string | null;
  executionPermittedByClassifier: boolean;
  paymentMutation: "none";
  entitlementMutation: "none";
  identityMutation: "none";
  providerMutation: "none";
}

export function buildLegacyRenewalShadowObservation(
  input: LegacyRenewalSettlementInput,
  assessment: LegacyRenewalSettlementAssessment,
): LegacyRenewalShadowObservation {
  return {
    schemaVersion: 1,
    mode: "shadow",
    paymentReference: input.reference,
    billingOwnerUserId: input.billingOwnerUserId,
    localSubscriptionId: input.localSubscriptionId,
    identityId: input.identityId,
    subscriptionCode: input.subscriptionCode,
    customerCode: input.customerCode,
    planCode: input.planCode,
    classification: assessment.outcome,
    reason: assessment.outcome === "manual_review_required" ? assessment.reason : null,
    executionPermittedByClassifier: assessment.preview.executionPermitted,
    paymentMutation: "none",
    entitlementMutation: "none",
    identityMutation: "none",
    providerMutation: "none",
  };
}
