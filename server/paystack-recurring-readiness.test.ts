import { describe, expect, it } from "vitest";
import {
  extractPaystackAuthorizationEvidence,
  hasExactPaystackRecurringRelationship,
} from "./paystack-renewal";

function transaction(channel: string, reusable: boolean | undefined, subscriptionCode = "SUB_monthly") {
  return {
    id: 1042,
    reference: "paystack_ref",
    status: "success",
    channel,
    customer: { customer_code: "CUS_owner" },
    plan: { plan_code: "PLN_monthly" },
    subscription: { subscription_code: subscriptionCode },
    authorization: reusable === undefined
      ? undefined
      : {
          authorization_code: "AUTH_verified",
          channel,
          signature: "SIG_verified",
          reusable,
        },
  };
}

describe("Paystack recurring readiness", () => {
  it("keeps Apple Pay successful but not ready when Paystack marks authorization non-reusable", () => {
    const evidence = extractPaystackAuthorizationEvidence(transaction("apple_pay", false));

    expect(evidence.transactionChannel).toBe("apple_pay");
    expect(evidence.authorizationReusable).toBe(false);
    expect(evidence.recurringReadiness).toBe("not_ready");
    expect(hasExactPaystackRecurringRelationship(
      evidence,
      "CUS_owner",
      "PLN_monthly",
      "SUB_monthly",
    )).toBe(false);
  });

  it("keeps a successful payment unknown when authorization evidence is absent", () => {
    const evidence = extractPaystackAuthorizationEvidence(transaction("apple_pay", undefined));

    expect(evidence.recurringReadiness).toBe("unknown");
    expect(evidence.authorizationReusable).toBeNull();
  });

  it("accepts Apple Pay only when its exact provider relationship is reusable", () => {
    const evidence = extractPaystackAuthorizationEvidence(
      transaction("apple_pay", true),
      new Date(),
      { authorizationBoundToSubscription: true },
    );

    expect(hasExactPaystackRecurringRelationship(
      evidence,
      "CUS_owner",
      "PLN_monthly",
      "SUB_monthly",
    )).toBe(true);
  });

  it("applies the same non-ready result to Card when reusable is false", () => {
    const evidence = extractPaystackAuthorizationEvidence(transaction("card", false));

    expect(evidence.recurringReadiness).toBe("not_ready");
    expect(hasExactPaystackRecurringRelationship(
      evidence,
      "CUS_owner",
      "PLN_monthly",
      "SUB_monthly",
    )).toBe(false);
  });

  it("rejects reusable authorization when it belongs to a different subscription", () => {
    const data = transaction("apple_pay", true);
    data.authorization = {
      authorization_code: "AUTH_verified",
      channel: "apple_pay",
      signature: "SIG_verified",
      reusable: true,
      subscription_code: "SUB_other",
    };
    const evidence = extractPaystackAuthorizationEvidence(data);

    expect(evidence.recurringReadiness).toBe("not_ready");
    expect(hasExactPaystackRecurringRelationship(
      evidence,
      "CUS_owner",
      "PLN_monthly",
      "SUB_monthly",
    )).toBe(false);
  });

  it("does not treat reusable authorization as ready without proof it belongs to the subscription", () => {
    const evidence = extractPaystackAuthorizationEvidence(transaction("apple_pay", true));

    expect(evidence.recurringReadiness).toBe("unknown");
    expect(hasExactPaystackRecurringRelationship(
      evidence,
      "CUS_owner",
      "PLN_monthly",
      "SUB_monthly",
    )).toBe(false);
  });
});