import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const billing = readFileSync(new URL("./billing-service.ts", import.meta.url), "utf8");
const replit = readFileSync(new URL("../.replit", import.meta.url), "utf8");
const start = billing.indexOf("async retireVerifiedSupersededSubscription");
const end = billing.indexOf("private manualLegacyPaystackAccountingService", start);
const method = billing.slice(start, end);

describe("automatic superseded Paystack retirement", () => {
  it("is release-gated and enabled explicitly for production", () => {
    expect(billing).toContain('PAYSTACK_AUTOMATIC_SUPERSEDED_RETIREMENT_ENABLED === "true"');
    expect(replit).toContain('PAYSTACK_AUTOMATIC_SUPERSEDED_RETIREMENT_ENABLED = "true"');
  });

  it("requires exact retired-old and ready-active-new local identities", () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(method).toContain('oldIdentity.status !== "retired"');
    expect(method).toContain('newIdentity.status !== "active" || newIdentity.recurringReadiness !== "ready"');
    expect(method).toContain('oldIdentity.customerCode !== customerCode || newIdentity.customerCode !== customerCode');
    expect(method).toContain('oldIdentity.planCode !== oldPlan || newIdentity.planCode !== newPlan');
  });

  it("persists a provider-call claim before the one exact disable", () => {
    expect(method).toContain('status: "provider_call_started"');
    expect(method).toContain('await this.paystack.subscription.disable({ code: claim.oldCode, token: oldProvider.emailToken })');
    expect(method.match(/subscription\.disable\s*\(/g)).toHaveLength(1);
    expect(method).not.toMatch(/emailToken.*(eventData|failureDetail|log)/);
  });

  it("requires exact provider reads before and after mutation and fails closed", () => {
    expect(method).toContain('const [oldProvider, newProvider] = await Promise.all');
    expect(method).toContain('newProvider.status === "active"');
    expect(method).toContain('readback.status === "non-renewing"');
    expect(method).toContain('return finish(false, "provider_result_unknown", "attempted")');
  });

  it("isolates retirement failure from successful payment settlement", () => {
    const call = billing.indexOf('await this.retireVerifiedSupersededSubscription(userId, effectiveSubscriptionCode)');
    const successfulReturn = billing.indexOf('return result.subscription;', call);
    expect(call).toBeGreaterThan(-1);
    expect(successfulReturn).toBeGreaterThan(call);
  });
});
