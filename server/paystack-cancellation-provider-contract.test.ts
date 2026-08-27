import { describe, expect, it } from "vitest";
import { classifyPaystackDisableWithReadback } from "./paystack-cancellation-provider-contract";

const expected = {
  expectedSubscriptionCode: "SUB_disposable",
  expectedCustomerCode: "CUS_disposable",
  expectedPlanCode: "PLN_disposable",
};

function readback(status: string) {
  return {
    httpStatus: 200,
    domain: "test",
    subscriptionCode: expected.expectedSubscriptionCode,
    customerCode: expected.expectedCustomerCode,
    planCode: expected.expectedPlanCode,
    status,
  };
}

describe("observed Paystack cancellation provider contract", () => {
  it("accepts a verified exact non-renewing read after the first 200 disable", () => {
    expect(classifyPaystackDisableWithReadback({
      ...expected,
      disableHttpStatus: 200,
      readback: readback("non-renewing"),
    })).toEqual({ outcome: "provider_non_renewing", reason: "verified_provider_read" });
  });

  it("converges a repeated 404 disable when the exact read is already non-renewing", () => {
    expect(classifyPaystackDisableWithReadback({
      ...expected,
      disableHttpStatus: 404,
      readback: readback("non-renewing"),
    })).toEqual({ outcome: "provider_non_renewing", reason: "verified_provider_read" });
  });

  it("classifies an invalid-token 404 as non-mutation only after active readback", () => {
    expect(classifyPaystackDisableWithReadback({
      ...expected,
      disableHttpStatus: 404,
      readback: readback("active"),
    })).toEqual({ outcome: "definite_non_mutation", reason: "verified_still_renewable" });
  });

  it.each([
    ["missing readback", { ...readback("active"), httpStatus: 404 }, "provider_read_unavailable"],
    ["non-test domain", { ...readback("active"), domain: "live" }, "provider_domain_not_test"],
    ["wrong subscription", { ...readback("active"), subscriptionCode: "SUB_other" }, "provider_identity_mismatch"],
    ["wrong customer", { ...readback("active"), customerCode: "CUS_other" }, "provider_identity_mismatch"],
    ["wrong plan", { ...readback("active"), planCode: "PLN_other" }, "provider_identity_mismatch"],
    ["unexpected state", readback("complete"), "provider_state_ambiguous"],
  ])("fails closed for %s", (_label, providerRead, reason) => {
    expect(classifyPaystackDisableWithReadback({
      ...expected,
      disableHttpStatus: 404,
      readback: providerRead,
    })).toEqual({ outcome: "manual_review_required", reason });
  });
});
