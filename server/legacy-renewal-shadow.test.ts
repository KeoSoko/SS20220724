import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildLegacyRenewalShadowObservation } from "./legacy-renewal-shadow";
import type { LegacyRenewalSettlementAssessment, LegacyRenewalSettlementInput } from "./legacy-paystack-renewal-settlement";

const input: LegacyRenewalSettlementInput = {
  billingOwnerUserId: 376,
  localSubscriptionId: 346,
  identityId: 17,
  reference: "verified_reference",
  subscriptionCode: "SUB_exact",
  customerCode: "CUS_exact",
  planCode: "PLN_exact",
};

const preview = {
  current: { nextBillingDate: "2026-08-27T00:00:00.000Z", entitlementExpiresAt: "2026-08-27T00:00:00.000Z", totalPaid: 4_900, lastPaymentDate: null, paystackReference: null },
  proposed: { nextBillingDate: "2026-09-27T00:00:00.000Z", entitlementExpiresAt: "2026-09-27T00:00:00.000Z", totalPaid: 9_800, lastPaymentDate: "2026-08-27T00:00:00.000Z", paystackReference: "verified_reference" },
  executionPermitted: true,
  compensationEventId: null,
};

describe("automatic legacy renewal shadow mode", () => {
  it("records a ready classification without applying any mutation", () => {
    const assessment: LegacyRenewalSettlementAssessment = { outcome: "payment_and_entitlement_applied", preview };
    expect(buildLegacyRenewalShadowObservation(input, assessment)).toMatchObject({
      mode: "shadow",
      classification: "payment_and_entitlement_applied",
      executionPermittedByClassifier: true,
      paymentMutation: "none",
      entitlementMutation: "none",
      identityMutation: "none",
      providerMutation: "none",
    });
  });

  it("preserves a fail-closed classifier reason", () => {
    const assessment: LegacyRenewalSettlementAssessment = { outcome: "manual_review_required", reason: "trusted_identity_mismatch", preview: { ...preview, executionPermitted: false } };
    expect(buildLegacyRenewalShadowObservation(input, assessment)).toMatchObject({
      classification: "manual_review_required",
      reason: "trusted_identity_mismatch",
      executionPermittedByClassifier: false,
      paymentMutation: "none",
      entitlementMutation: "none",
      providerMutation: "none",
    });
  });

  it("executes only the strict ready classification behind the release gate", () => {
    const source = readFileSync(new URL("./billing-service.ts", import.meta.url), "utf8");
    const start = source.indexOf("async reconcilePaystackSubscriptionForUser");
    const end = source.indexOf("\n  /**", start);
    const reconciliation = source.slice(start, end);
    expect(reconciliation).toContain("previewLegacyPaystackRenewalSettlement(shadowInput)");
    expect(reconciliation).toContain("recordLegacyRenewalShadowObservationOnce");
    expect(reconciliation).toContain("isAutomaticLegacyRenewalSettlementEnabled()");
    expect(reconciliation).toContain('assessment.outcome === "payment_and_entitlement_applied"');
    expect(reconciliation).toContain("assessment.preview.executionPermitted");
    expect(reconciliation).toContain("legacyRenewalSettlementFingerprint(shadowInput, assessment)");
    expect(reconciliation).toContain(".execute(shadowInput, null, fingerprint)");
    expect(reconciliation).not.toContain("processPaystackSubscription(");
    expect(reconciliation).not.toContain("recoverPaystackRenewalRelationship(");
    expect(reconciliation).not.toContain("renewal_reconciled_paid");
  });

  it("requires an explicit production release flag", () => {
    const source = readFileSync(new URL("./billing-service.ts", import.meta.url), "utf8");
    const replit = readFileSync(new URL("../.replit", import.meta.url), "utf8");
    expect(source).toContain('PAYSTACK_AUTOMATIC_LEGACY_RENEWAL_SETTLEMENT_ENABLED === "true"');
    expect(replit).toContain('PAYSTACK_AUTOMATIC_LEGACY_RENEWAL_SETTLEMENT_ENABLED = "true"');
  });

  it("serializes duplicate observations with billing-owner lock 36", () => {
    const source = readFileSync(new URL("./billing-service.ts", import.meta.url), "utf8");
    const start = source.indexOf("private async recordLegacyRenewalShadowObservationOnce");
    const end = source.indexOf("\n  async reconcilePaystackSubscriptionForUser", start);
    const recorder = source.slice(start, end);
    expect(recorder).toContain("pg_advisory_xact_lock(${userId}, 36)");
    expect(recorder).toContain("eventData}->>'paymentReference'");
    expect(recorder).toContain("if (!existingObservation)");
  });
});
