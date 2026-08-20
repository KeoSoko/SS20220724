import { describe, expect, it } from "vitest";
import {
  advanceBillingDate,
  checkPaystackTransactionOwnership,
  classifyPaystackInvoice,
  extractPaystackRenewalEvidence,
  extractPaystackTransactionReference,
  getMostRecentPaystackInvoice,
  isViablePaystackSubscriptionCandidate,
  paystackInvoiceFailureTransactionId,
  selectPaystackSubscriptionIdentityCandidate,
  subscriptionIdentityMatches,
  validateActivePaystackRenewalRelationship,
} from "./paystack-renewal";

describe("Paystack renewal classification", () => {
  const now = new Date("2026-08-19T10:00:00.000Z");

  it("classifies a paid invoice and extracts the verified transaction reference", () => {
    const result = classifyPaystackInvoice({
      invoice_code: "INV_paid",
      paid: true,
      transaction: { reference: "renewal_ref", status: "success" },
      subscription: { subscription_code: "SUB_current" },
    }, "2026-08-01T00:00:00.000Z", now);

    expect(result).toMatchObject({
      state: "paid",
      invoiceCode: "INV_paid",
      subscriptionCode: "SUB_current",
      transactionReference: "renewal_ref",
    });
  });

  it("classifies Paystack's transaction-shaped subscription invoice response", () => {
    const result = classifyPaystackInvoice({
      status: "success",
      reference: "renewal_ref_from_fetch",
      paid_at: "2026-08-02T06:36:43.000Z",
      metadata: { invoice_action: "update", subscription_type: "recurring" },
      subscription: { subscription_code: "SUB_current" },
    }, "2026-08-02T06:36:43.000Z", now);

    expect(result).toMatchObject({
      state: "paid",
      transactionReference: "renewal_ref_from_fetch",
      subscriptionCode: "SUB_current",
    });
  });

  it("never treats client-controlled recurring metadata as provider evidence", () => {
    expect(extractPaystackRenewalEvidence({
      status: "success",
      reference: "forged_initial_ref",
      customer: { customer_code: "CUS_attacker" },
      metadata: {
        invoice_action: "update",
        subscription_type: "recurring",
        subscription_code: "SUB_forged",
      },
    })).toBeNull();
  });

  it("extracts a provider subscription, customer, invoice, and transaction relationship", () => {
    expect(extractPaystackRenewalEvidence({
      invoice_code: "INV_authoritative",
      transaction: { reference: "renewal_ref", status: "success" },
      subscription: { subscription_code: "SUB_current" },
      customer: { customer_code: "CUS_current" },
      metadata: { invoice_action: "forged-value-is-ignored" },
    })).toEqual({
      invoiceCode: "INV_authoritative",
      transactionReference: "renewal_ref",
      subscriptionCode: "SUB_current",
      customerCode: "CUS_current",
    });
  });

  it("classifies an overdue unpaid invoice as payment required", () => {
    const result = classifyPaystackInvoice({
      invoice_code: "INV_unpaid",
      paid: 0,
      subscription: { subscription_code: "SUB_current" },
    }, "2026-08-02T00:00:00.000Z", now);

    expect(result.state).toBe("unpaid_due");
  });

  it("does not fail an invoice before its billing date", () => {
    const result = classifyPaystackInvoice({
      invoice_code: "INV_future",
      paid: false,
    }, "2026-09-02T00:00:00.000Z", now);

    expect(result.state).toBe("pending");
  });

  it("rejects an invoice from a stale Paystack subscription identity", () => {
    expect(subscriptionIdentityMatches("SUB_old", "SUB_current")).toBe("conflict");
    expect(subscriptionIdentityMatches("SUB_current", "SUB_current")).toBe("match");
    expect(subscriptionIdentityMatches(null, "SUB_current")).toBe("unknown");
  });

  it("uses the same success reference for charge.success and invoice.update duplicates", () => {
    expect(extractPaystackTransactionReference({ reference: "renewal_ref" }))
      .toBe(extractPaystackTransactionReference({
        transaction: { reference: "renewal_ref" },
      }));
  });

  it("uses a stable failure key for duplicate unpaid invoice events", () => {
    expect(paystackInvoiceFailureTransactionId("INV_duplicate"))
      .toBe("paystack-invoice:INV_duplicate");
    expect(paystackInvoiceFailureTransactionId("INV_duplicate"))
      .toBe(paystackInvoiceFailureTransactionId("INV_duplicate"));
  });

  it("does not allow an unknown SUB_* to establish itself from a successful charge", () => {
    expect(validateActivePaystackRenewalRelationship(
      "SUB_unknown",
      "CUS_current",
      null,
    )).toEqual({ valid: false, reason: "unknown_subscription_identity" });
  });

  it("accepts only the exact active subscription and customer relationship", () => {
    const identity = {
      subscriptionCode: "SUB_current",
      customerCode: "CUS_current",
      status: "active",
    };
    expect(validateActivePaystackRenewalRelationship(
      "SUB_current",
      "CUS_current",
      identity,
    )).toEqual({ valid: true });
    expect(validateActivePaystackRenewalRelationship(
      "SUB_stale",
      "CUS_current",
      identity,
    )).toEqual({ valid: false, reason: "stale_subscription_identity" });
    expect(validateActivePaystackRenewalRelationship(
      "SUB_current",
      "CUS_other",
      identity,
    )).toEqual({ valid: false, reason: "subscription_customer_mismatch" });
  });
});

describe("Paystack subscription identity recovery", () => {
  const candidate = (code: string, status: string) => ({
    subscription_code: code,
    status,
    customer: { customer_code: "CUS_current" },
    plan: { plan_code: "PLN_monthly" },
  });

  it("refuses to guess between an active and an attention subscription", () => {
    expect(selectPaystackSubscriptionIdentityCandidate([
      candidate("SUB_old", "attention"),
      candidate("SUB_current", "active"),
    ], "CUS_current", "PLN_monthly")).toBeNull();
  });

  it("refuses to guess between multiple attention subscriptions", () => {
    expect(selectPaystackSubscriptionIdentityCandidate([
      candidate("SUB_first", "attention"),
      candidate("SUB_second", "attention"),
    ], "CUS_current", "PLN_monthly")).toBeNull();
  });

  it("ignores terminal identities when one viable candidate remains", () => {
    expect(selectPaystackSubscriptionIdentityCandidate([
      candidate("SUB_old", "complete"),
      candidate("SUB_current", "attention"),
    ], "CUS_current", "PLN_monthly")?.subscription_code).toBe("SUB_current");
  });

  it("keeps only the expected customer and plan as support-resolvable candidates", () => {
    expect(isViablePaystackSubscriptionCandidate(
      candidate("SUB_current", "attention"),
      "CUS_current",
      "PLN_monthly",
    )).toBe(true);
    expect(isViablePaystackSubscriptionCandidate({
      ...candidate("SUB_other_customer", "attention"),
      customer: { customer_code: "CUS_other" },
    }, "CUS_current", "PLN_monthly")).toBe(false);
    expect(isViablePaystackSubscriptionCandidate({
      ...candidate("SUB_other_plan", "attention"),
      plan: { plan_code: "PLN_yearly" },
    }, "CUS_current", "PLN_monthly")).toBe(false);
    expect(isViablePaystackSubscriptionCandidate(
      candidate("SUB_finished", "complete"),
      "CUS_current",
      "PLN_monthly",
    )).toBe(false);
  });

  it("surfaces the latest provider invoice for support review", () => {
    expect(getMostRecentPaystackInvoice({
      invoices_history: [
        { invoice_code: "INV_old", created_at: "2026-07-01T00:00:00.000Z" },
        { invoice_code: "INV_new", created_at: "2026-08-01T00:00:00.000Z" },
      ],
      most_recent_invoice: { invoice_code: "INV_current", created_at: "2026-08-03T00:00:00.000Z" },
    })).toMatchObject({ invoice_code: "INV_current" });
  });
});

describe("renewal billing dates", () => {
  it("advances from the prior entitlement boundary instead of webhook arrival", () => {
    expect(advanceBillingDate(
      new Date("2026-07-02T06:36:43.000Z"),
      "monthly",
    ).toISOString()).toBe("2026-08-02T06:36:43.000Z");
  });

  it("clamps month-end renewals instead of skipping a month", () => {
    expect(advanceBillingDate(
      new Date("2025-01-31T12:00:00.000Z"),
      "monthly",
    ).toISOString()).toBe("2025-02-28T12:00:00.000Z");
  });

  it("clamps leap-day yearly renewals", () => {
    expect(advanceBillingDate(
      new Date("2024-02-29T12:00:00.000Z"),
      "yearly",
    ).toISOString()).toBe("2025-02-28T12:00:00.000Z");
  });
});

describe("Paystack transaction ownership", () => {
  const expected = {
    userId: 268,
    email: "customer@example.com",
    customerCode: "CUS_current",
  };

  it("accepts renewal charges without metadata when the verified email matches", () => {
    expect(checkPaystackTransactionOwnership({
      metadata: null,
      customer: { email: "CUSTOMER@example.com", customer_code: "CUS_current" },
    }, expected)).toEqual({ valid: true, reason: "ownership_confirmed" });
  });

  it("rejects a valid Paystack reference owned by another customer", () => {
    expect(checkPaystackTransactionOwnership({
      metadata: { user_id: 999 },
      customer: { email: "other@example.com", customer_code: "CUS_other" },
    }, expected)).toEqual({ valid: false, reason: "metadata_user_mismatch" });
  });
});