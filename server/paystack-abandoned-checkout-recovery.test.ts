import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isDefinitivePaystackNonPaymentStatus } from "./paystack-checkout-status";

const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const billing = readFileSync(new URL("./billing-service.ts", import.meta.url), "utf8");

describe("Paystack abandoned checkout recovery", () => {
  it("recognizes only terminal non-payment statuses", () => {
    expect(isDefinitivePaystackNonPaymentStatus("abandoned")).toBe(true);
    expect(isDefinitivePaystackNonPaymentStatus("FAILED")).toBe(true);
    expect(isDefinitivePaystackNonPaymentStatus("pending")).toBe(false);
    expect(isDefinitivePaystackNonPaymentStatus("processing")).toBe(false);
    expect(isDefinitivePaystackNonPaymentStatus("success")).toBe(false);
    expect(isDefinitivePaystackNonPaymentStatus(undefined)).toBe(false);
  });

  it("preserves the exact provider status returned by verification", () => {
    expect(billing).toContain('providerStatus: typeof response.data?.status === "string"');
    expect(billing).toContain('response.data.status.trim().toLowerCase()');
  });

  it("closes only a still-pending exact attempt under the attempt lock", () => {
    const start = billing.indexOf("async closePaystackCheckoutAttemptAfterDefinitiveNonPayment");
    const end = billing.indexOf("async ensurePaystackAccessCode", start);
    const method = billing.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(method).toContain("isDefinitivePaystackNonPaymentStatus(providerStatus)");
    expect(method).toContain("pg_advisory_xact_lock(${snapshot.billingOwnerUserId}, 41)");
    expect(method).toContain('.for("update")');
    expect(method).toContain('eq(paystackCheckoutAttempts.status, "pending")');
    expect(method).toContain('status: "failed"');
    expect(method).toContain('eventType: "paystack_checkout_definitive_non_payment"');
  });

  it("creates a fresh server-owned checkout only after definitive non-payment", () => {
    const start = routes.indexOf('app.post("/api/billing/paystack/checkout"');
    const end = routes.indexOf('app.post("/api/billing/paystack/subscription"', start);
    const route = routes.slice(start, end);
    const classifier = route.indexOf("isDefinitivePaystackNonPaymentStatus(verification.providerStatus)");
    const close = route.indexOf("closePaystackCheckoutAttemptAfterDefinitiveNonPayment", classifier);
    const recreate = route.indexOf("createOrReusePaystackCheckoutAttempt(checkoutAttemptInput)", close);
    expect(classifier).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(classifier);
    expect(recreate).toBeGreaterThan(close);
    expect(route).toContain('code: "checkout_verification_pending"');
  });
});
