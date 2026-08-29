import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classifySupersededPaystackSubscription } from "./paystack-superseded-subscription";

const oldIdentity = { userId: 359, subscriptionCode: "SUB_old", customerCode: "CUS_ansfin", planCode: "PLN_49" };
const newIdentity = { userId: 359, subscriptionCode: "SUB_team", customerCode: "CUS_ansfin", planCode: "PLN_245" };

describe("superseded Paystack subscription review", () => {
  it("flags an exact same-owner/customer plan transition without provider mutation", () => {
    expect(classifySupersededPaystackSubscription(359, oldIdentity, newIdentity)).toEqual({
      schemaVersion: 1,
      reason: "trusted_subscription_replaced_by_different_plan",
      billingOwnerUserId: 359,
      customerCode: "CUS_ansfin",
      supersededSubscriptionCode: "SUB_old",
      supersededPlanCode: "PLN_49",
      authoritativeSubscriptionCode: "SUB_team",
      authoritativePlanCode: "PLN_245",
      recommendedAction: "verify_then_disable_superseded_subscription",
      providerMutation: "none",
    });
  });

  it.each([
    ["wrong owner", { ...oldIdentity, userId: 1 }, newIdentity],
    ["wrong customer", oldIdentity, { ...newIdentity, customerCode: "CUS_other" }],
    ["same subscription", oldIdentity, { ...newIdentity, subscriptionCode: "SUB_old" }],
    ["same plan", oldIdentity, { ...newIdentity, planCode: "PLN_49" }],
    ["missing old plan", { ...oldIdentity, planCode: null }, newIdentity],
  ])("fails closed for %s", (_label, previous, authoritative) => {
    expect(classifySupersededPaystackSubscription(359, previous, authoritative)).toBeNull();
  });

  it("wires detection only to the existing supersede transition and performs no Paystack mutation", () => {
    const source = readFileSync(new URL("./billing-service.ts", import.meta.url), "utf8");
    const start = source.indexOf("private async recordPaystackSubscriptionIdentityInTransaction");
    const end = source.indexOf("\n  async recordPaystackSubscriptionIdentity", start);
    const identityWriter = source.slice(start, end);
    expect(identityWriter).toContain("classifySupersededPaystackSubscription");
    expect(identityWriter).toContain("paystack_superseded_subscription_review_required");
    expect(identityWriter).toContain("if (!existingReview)");
    expect(identityWriter).not.toMatch(/subscription\.(disable|create|enable)|transaction\.charge/);
  });
});
