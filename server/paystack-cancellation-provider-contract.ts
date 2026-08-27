export type PaystackCancellationReadback = {
  httpStatus: number;
  domain?: string | null;
  subscriptionCode?: string | null;
  customerCode?: string | null;
  planCode?: string | null;
  status?: string | null;
};

export type PaystackDisableClassification =
  | { outcome: "provider_non_renewing"; reason: "verified_provider_read" }
  | { outcome: "definite_non_mutation"; reason: "verified_still_renewable" }
  | { outcome: "manual_review_required"; reason: string };

/**
 * Encodes the Phase 4 test-mode contract without performing a provider call.
 * A disable response is never authoritative by itself. The exact subscription,
 * customer, plan and test domain must all be re-verified from Paystack.
 */
export function classifyPaystackDisableWithReadback(input: {
  expectedSubscriptionCode: string;
  expectedCustomerCode: string;
  expectedPlanCode: string;
  disableHttpStatus: number;
  readback: PaystackCancellationReadback;
}): PaystackDisableClassification {
  const { readback } = input;
  if (readback.httpStatus !== 200) {
    return { outcome: "manual_review_required", reason: "provider_read_unavailable" };
  }
  if (readback.domain !== "test") {
    return { outcome: "manual_review_required", reason: "provider_domain_not_test" };
  }
  if (
    readback.subscriptionCode !== input.expectedSubscriptionCode
    || readback.customerCode !== input.expectedCustomerCode
    || readback.planCode !== input.expectedPlanCode
  ) {
    return { outcome: "manual_review_required", reason: "provider_identity_mismatch" };
  }
  if (readback.status === "non-renewing") {
    return { outcome: "provider_non_renewing", reason: "verified_provider_read" };
  }
  if (readback.status === "active" && input.disableHttpStatus >= 400) {
    return { outcome: "definite_non_mutation", reason: "verified_still_renewable" };
  }
  return { outcome: "manual_review_required", reason: "provider_state_ambiguous" };
}
