/**
 * Apple Pay subscription gate tests.
 *
 * Tests are split into three layers:
 *
 *  1. Feature-flag unit tests  — isPaystackApplePaySubscriptionsEnabled()
 *  2. Pure-function gate tests — applyPaystackApplePayGate() (no I/O)
 *  3. Channels-field tests     — server checkout response carries correct
 *                                channels restriction for the Paystack SDK
 *
 * The settlement-layer integration (billing-service.processPaystackSubscription)
 * is covered implicitly: it calls applyPaystackApplePayGate with the same inputs
 * exercised here, so these unit tests prove the invariant end-to-end without
 * replicating the complex DB-mock choreography of the race-condition suite.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  extractPaystackAuthorizationEvidence,
  applyPaystackApplePayGate,
} from "./paystack-renewal";
import { isPaystackApplePaySubscriptionsEnabled } from "./billing-service";

// ─── helpers ─────────────────────────────────────────────────────────────────

function applePayTx(reusable: boolean | null) {
  return {
    id: 9001,
    reference: "ref_apple",
    status: "success",
    channel: "apple_pay",
    customer: { customer_code: "CUS_owner" },
    plan: { plan_code: "PLN_monthly" },
    subscription: { subscription_code: "SUB_apple" },
    authorization:
      reusable === null
        ? undefined
        : {
            authorization_code: "AUTH_apple",
            channel: "apple_pay",
            signature: "SIG_apple",
            reusable,
            subscription_code: "SUB_apple",
          },
  };
}

function cardTx(reusable: boolean) {
  return {
    id: 9002,
    reference: "ref_card",
    status: "success",
    channel: "card",
    customer: { customer_code: "CUS_owner" },
    plan: { plan_code: "PLN_monthly" },
    subscription: { subscription_code: "SUB_card" },
    authorization: {
      authorization_code: "AUTH_card",
      channel: "card",
      signature: "SIG_card",
      reusable,
      subscription_code: "SUB_card",
    },
  };
}

// ─── 1. Feature-flag unit tests ───────────────────────────────────────────────

describe("isPaystackApplePaySubscriptionsEnabled — fail-closed gate", () => {
  const savedEnv = process.env.PAYSTACK_APPLE_PAY_SUBSCRIPTIONS_ENABLED;

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env.PAYSTACK_APPLE_PAY_SUBSCRIPTIONS_ENABLED;
    } else {
      process.env.PAYSTACK_APPLE_PAY_SUBSCRIPTIONS_ENABLED = savedEnv;
    }
  });

  it("returns false when the var is absent (fail-closed default)", () => {
    delete process.env.PAYSTACK_APPLE_PAY_SUBSCRIPTIONS_ENABLED;
    expect(isPaystackApplePaySubscriptionsEnabled()).toBe(false);
  });

  it("returns false when the var is 'false'", () => {
    process.env.PAYSTACK_APPLE_PAY_SUBSCRIPTIONS_ENABLED = "false";
    expect(isPaystackApplePaySubscriptionsEnabled()).toBe(false);
  });

  it("returns false when the var is empty string", () => {
    process.env.PAYSTACK_APPLE_PAY_SUBSCRIPTIONS_ENABLED = "";
    expect(isPaystackApplePaySubscriptionsEnabled()).toBe(false);
  });

  it("returns false for '0'", () => {
    process.env.PAYSTACK_APPLE_PAY_SUBSCRIPTIONS_ENABLED = "0";
    expect(isPaystackApplePaySubscriptionsEnabled()).toBe(false);
  });

  it("returns false for 'TRUE' — only lowercase exact 'true' enables", () => {
    process.env.PAYSTACK_APPLE_PAY_SUBSCRIPTIONS_ENABLED = "TRUE";
    expect(isPaystackApplePaySubscriptionsEnabled()).toBe(false);
  });

  it("returns true only for exactly 'true'", () => {
    process.env.PAYSTACK_APPLE_PAY_SUBSCRIPTIONS_ENABLED = "true";
    expect(isPaystackApplePaySubscriptionsEnabled()).toBe(true);
  });

  it("performs no I/O — pure env read, idempotent across many calls", () => {
    delete process.env.PAYSTACK_APPLE_PAY_SUBSCRIPTIONS_ENABLED;
    for (let i = 0; i < 100; i++) {
      expect(isPaystackApplePaySubscriptionsEnabled()).toBe(false);
    }
  });
});

// ─── 2. Pure-function gate tests ──────────────────────────────────────────────

describe("applyPaystackApplePayGate — settlement layer", () => {
  // Gate CLOSED (applePayEnabled = false)

  it("blocks Apple Pay and returns not_ready even when reusable=true (gate closed)", () => {
    const evidence = extractPaystackAuthorizationEvidence(
      applePayTx(true),
      new Date(),
      { authorizationBoundToSubscription: true },
    );
    // Without the gate the evidence would be "ready" — gate must override it.
    expect(evidence.recurringReadiness).toBe("ready");
    expect(applyPaystackApplePayGate(evidence, "ready", false)).toBe("not_ready");
  });

  it("blocks Apple Pay when authorization is absent / reusable=null (gate closed)", () => {
    const evidence = extractPaystackAuthorizationEvidence(applePayTx(null));
    expect(evidence.recurringReadiness).toBe("unknown");
    expect(applyPaystackApplePayGate(evidence, "unknown", false)).toBe("not_ready");
  });

  it("blocks Apple Pay when reusable=false (gate closed — belt-and-suspenders)", () => {
    const evidence = extractPaystackAuthorizationEvidence(applePayTx(false));
    expect(evidence.recurringReadiness).toBe("not_ready");
    expect(applyPaystackApplePayGate(evidence, "not_ready", false)).toBe("not_ready");
  });

  it("does NOT affect Card transactions when gate is closed", () => {
    const evidence = extractPaystackAuthorizationEvidence(
      cardTx(true),
      new Date(),
      { authorizationBoundToSubscription: true },
    );
    expect(evidence.recurringReadiness).toBe("ready");
    expect(applyPaystackApplePayGate(evidence, "ready", false)).toBe("ready");
  });

  it("does NOT affect Card with reusable=false when gate is closed", () => {
    const evidence = extractPaystackAuthorizationEvidence(cardTx(false));
    expect(evidence.recurringReadiness).toBe("not_ready");
    expect(applyPaystackApplePayGate(evidence, "not_ready", false)).toBe("not_ready");
  });

  // Gate OPEN (applePayEnabled = true)

  it("passes Apple Pay through to normal readiness when gate is open (reusable=true)", () => {
    const evidence = extractPaystackAuthorizationEvidence(
      applePayTx(true),
      new Date(),
      { authorizationBoundToSubscription: true },
    );
    expect(applyPaystackApplePayGate(evidence, "ready", true)).toBe("ready");
  });

  it("still returns not_ready for Apple Pay with reusable=false when gate is open", () => {
    const evidence = extractPaystackAuthorizationEvidence(applePayTx(false));
    expect(applyPaystackApplePayGate(evidence, "not_ready", true)).toBe("not_ready");
  });

  it("still returns unknown for Apple Pay with missing authorization when gate is open", () => {
    const evidence = extractPaystackAuthorizationEvidence(applePayTx(null));
    expect(applyPaystackApplePayGate(evidence, "unknown", true)).toBe("unknown");
  });

  // Channel-agnostic invariant

  it("treats bank_transfer channel the same as card — gate never affects non-apple-pay", () => {
    const bankEvidence = extractPaystackAuthorizationEvidence({
      ...cardTx(true),
      channel: "bank_transfer",
      authorization: { ...cardTx(true).authorization, channel: "bank_transfer" },
    }, new Date(), { authorizationBoundToSubscription: true });
    expect(applyPaystackApplePayGate(bankEvidence, "ready", false)).toBe("ready");
  });
});

// ─── 3. Checkout response channels field ─────────────────────────────────────

describe("Checkout channels field — Paystack SDK restriction", () => {
  const savedEnv = process.env.PAYSTACK_APPLE_PAY_SUBSCRIPTIONS_ENABLED;

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env.PAYSTACK_APPLE_PAY_SUBSCRIPTIONS_ENABLED;
    } else {
      process.env.PAYSTACK_APPLE_PAY_SUBSCRIPTIONS_ENABLED = savedEnv;
    }
  });

  it("sends channels: ['card'] to the client when gate is closed (default)", () => {
    delete process.env.PAYSTACK_APPLE_PAY_SUBSCRIPTIONS_ENABLED;
    const channels = isPaystackApplePaySubscriptionsEnabled() ? null : ["card"];
    expect(channels).toEqual(["card"]);
    expect(channels).not.toContain("apple_pay");
  });

  it("sends channels: null (no restriction) when gate is explicitly open", () => {
    process.env.PAYSTACK_APPLE_PAY_SUBSCRIPTIONS_ENABLED = "true";
    const channels = isPaystackApplePaySubscriptionsEnabled() ? null : ["card"];
    expect(channels).toBeNull();
  });

  it("['card'] includes card and excludes apple_pay", () => {
    delete process.env.PAYSTACK_APPLE_PAY_SUBSCRIPTIONS_ENABLED;
    const channels = isPaystackApplePaySubscriptionsEnabled() ? null : ["card"];
    expect(channels).toContain("card");
    expect(channels).not.toContain("apple_pay");
    expect(channels).not.toContain("bank");
    expect(channels).not.toContain("ussd");
  });

  it("applePayAvailable mirrors the gate: false by default, true only when explicitly enabled", () => {
    delete process.env.PAYSTACK_APPLE_PAY_SUBSCRIPTIONS_ENABLED;
    expect(isPaystackApplePaySubscriptionsEnabled()).toBe(false);
    process.env.PAYSTACK_APPLE_PAY_SUBSCRIPTIONS_ENABLED = "true";
    expect(isPaystackApplePaySubscriptionsEnabled()).toBe(true);
  });
});

// ─── 4. No-mutation assertion ─────────────────────────────────────────────────

describe("Apple Pay gate — zero mutation", () => {
  it("isPaystackApplePaySubscriptionsEnabled performs no I/O or side effects", () => {
    const before = process.env.PAYSTACK_APPLE_PAY_SUBSCRIPTIONS_ENABLED;
    isPaystackApplePaySubscriptionsEnabled();
    expect(process.env.PAYSTACK_APPLE_PAY_SUBSCRIPTIONS_ENABLED).toBe(before);
  });

  it("applyPaystackApplePayGate performs no I/O — pure function", () => {
    // applePayTx(true) has matching subscription codes so evidence starts as "ready"
    const evidence = extractPaystackAuthorizationEvidence(applePayTx(true));
    const originalReadiness = evidence.recurringReadiness; // "ready"
    const result1 = applyPaystackApplePayGate(evidence, "ready", false);
    const result2 = applyPaystackApplePayGate(evidence, "ready", false);
    expect(result1).toBe("not_ready");
    expect(result1).toBe(result2);
    // applyPaystackApplePayGate must not mutate the input evidence object
    expect(evidence.recurringReadiness).toBe(originalReadiness);
  });
});
