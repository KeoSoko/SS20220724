import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  createPaystackCancellationCoordinator,
  type CancellationAttemptRecord,
} from "./paystack-cancellation";

function createLifecycleHarness(initialStatus: CancellationAttemptRecord["status"] = "requested") {
  let attempt: CancellationAttemptRecord = {
    id: 1,
    billingOwnerUserId: 7,
    subscriptionCode: "SUB_current",
    status: initialStatus,
    requestedAt: new Date("2026-08-27T14:00:00.000Z"),
    providerConfirmedAt: initialStatus === "requested" ? null : new Date("2026-08-27T14:01:00.000Z"),
    updatedAt: new Date("2026-08-27T14:00:00.000Z"),
  };
  let lockTail = Promise.resolve();
  let mutationSequence = 0;
  const transitionMutation = vi.fn(async (input: any) => {
    mutationSequence += 1;
    attempt = {
      ...attempt,
      ...input,
      updatedAt: new Date(`2026-08-27T14:0${mutationSequence}:00.000Z`),
    };
    return { ...attempt };
  });
  const recordCancellationEvent = vi.fn(async () => undefined);
  const sendCancellationNotification = vi.fn(async () => undefined);
  const applyEntitlementEffect = vi.fn(async () => undefined);

  const coordinator = createPaystackCancellationCoordinator({
    withBillingOwnerLock: async (_userId, fn) => {
      const predecessor = lockTail;
      let release!: () => void;
      lockTail = new Promise<void>((resolve) => { release = resolve; });
      await predecessor;
      try {
        return await fn();
      } finally {
        release();
      }
    },
    getSubscription: vi.fn(async () => null),
    getPlan: vi.fn(async () => null),
    getActiveIdentities: vi.fn(async () => [{
      userId: 7,
      subscriptionCode: "SUB_current",
      customerCode: "CUS_current",
      planCode: "PLN_current",
      status: "active",
    }]),
    getOpenAttempt: vi.fn(async () => ({ ...attempt })),
    getAttemptBySubscriptionCode: vi.fn(async (code) => code === attempt.subscriptionCode ? { ...attempt } : null),
    saveAttempt: transitionMutation,
    markCancellationRequested: vi.fn(async () => undefined),
  });

  async function deliver(
    event: "subscription.not_renew" | "subscription.disable",
    subscriptionCode = "SUB_current",
    customerCode = "CUS_current",
  ) {
    // The real route verifies the signature and exact identity before this
    // coordinator call, and acknowledges a valid delivery with HTTP 200.
    const confirmation = await coordinator.confirmLifecycle({
      subscriptionCode,
      customerCode,
      event,
    });
    if (confirmation.outcome === "confirmed" && confirmation.transition === "applied") {
      await applyEntitlementEffect(event);
      await recordCancellationEvent(event);
      await sendCancellationNotification(event);
    }
    return { httpStatus: 200, confirmation };
  }

  return {
    deliver,
    transitionMutation,
    recordCancellationEvent,
    sendCancellationNotification,
    applyEntitlementEffect,
    currentAttempt: () => ({ ...attempt }),
  };
}

describe("Paystack cancellation lifecycle webhook idempotency", () => {
  it("applies the first valid subscription.not_renew and its side effects once", async () => {
    const harness = createLifecycleHarness();

    const result = await harness.deliver("subscription.not_renew");

    expect(result.httpStatus).toBe(200);
    expect(result.confirmation).toMatchObject({ outcome: "confirmed", transition: "applied" });
    expect(harness.transitionMutation).toHaveBeenCalledTimes(1);
    expect(harness.applyEntitlementEffect).toHaveBeenCalledTimes(1);
    expect(harness.recordCancellationEvent).toHaveBeenCalledTimes(1);
    expect(harness.sendCancellationNotification).toHaveBeenCalledTimes(1);
  });

  it("acknowledges an exact duplicate subscription.not_renew without repeating any effect", async () => {
    const harness = createLifecycleHarness();
    await harness.deliver("subscription.not_renew");

    const duplicate = await harness.deliver("subscription.not_renew");

    expect(duplicate.httpStatus).toBe(200);
    expect(duplicate.confirmation).toMatchObject({ outcome: "confirmed", transition: "already_applied" });
    expect(harness.transitionMutation).toHaveBeenCalledTimes(1);
    expect(harness.applyEntitlementEffect).toHaveBeenCalledTimes(1);
    expect(harness.recordCancellationEvent).toHaveBeenCalledTimes(1);
    expect(harness.sendCancellationNotification).toHaveBeenCalledTimes(1);
  });

  it("allows only one side-effect winner for concurrent duplicate deliveries", async () => {
    const harness = createLifecycleHarness();

    const results = await Promise.all([
      harness.deliver("subscription.not_renew"),
      harness.deliver("subscription.not_renew"),
    ]);

    expect(results.map((result) => result.confirmation.transition).sort()).toEqual([
      "already_applied",
      "applied",
    ]);
    expect(harness.transitionMutation).toHaveBeenCalledTimes(1);
    expect(harness.applyEntitlementEffect).toHaveBeenCalledTimes(1);
    expect(harness.recordCancellationEvent).toHaveBeenCalledTimes(1);
    expect(harness.sendCancellationNotification).toHaveBeenCalledTimes(1);
  });

  it("makes a duplicate subscription.disable a no-op", async () => {
    const harness = createLifecycleHarness();
    const first = await harness.deliver("subscription.disable");
    const duplicate = await harness.deliver("subscription.disable");

    expect(first.confirmation).toMatchObject({ transition: "applied" });
    expect(duplicate.confirmation).toMatchObject({ transition: "already_applied" });
    expect(harness.transitionMutation).toHaveBeenCalledTimes(1);
    expect(harness.recordCancellationEvent).toHaveBeenCalledTimes(1);
    expect(harness.sendCancellationNotification).toHaveBeenCalledTimes(1);
  });

  it("allows subscription.disable to advance a prior subscription.not_renew", async () => {
    const harness = createLifecycleHarness();
    const notRenew = await harness.deliver("subscription.not_renew");
    const disabled = await harness.deliver("subscription.disable");

    expect(notRenew.confirmation).toMatchObject({ transition: "applied" });
    expect(disabled.confirmation).toMatchObject({ transition: "applied" });
    expect(harness.currentAttempt().status).toBe("provider_disabled");
    expect(harness.transitionMutation).toHaveBeenCalledTimes(2);
    expect(harness.recordCancellationEvent).toHaveBeenCalledTimes(2);
    expect(harness.sendCancellationNotification).toHaveBeenCalledTimes(2);
  });

  it("rejects a wrong subscription without confirmation or side effects", async () => {
    const harness = createLifecycleHarness();

    const result = await harness.deliver("subscription.not_renew", "SUB_wrong");

    expect(result.confirmation.outcome).toBe("rejected");
    expect(harness.transitionMutation).not.toHaveBeenCalled();
    expect(harness.recordCancellationEvent).not.toHaveBeenCalled();
    expect(harness.sendCancellationNotification).not.toHaveBeenCalled();
  });

  it("rejects a wrong customer without confirmation or side effects", async () => {
    const harness = createLifecycleHarness();

    const result = await harness.deliver("subscription.not_renew", "SUB_current", "CUS_wrong");

    expect(result.confirmation.outcome).toBe("rejected");
    expect(harness.transitionMutation).not.toHaveBeenCalled();
    expect(harness.recordCancellationEvent).not.toHaveBeenCalled();
    expect(harness.sendCancellationNotification).not.toHaveBeenCalled();
  });

  it("leaves the existing cancellation record byte-for-byte unchanged on a duplicate", async () => {
    const harness = createLifecycleHarness("provider_non_renewing");
    const before = harness.currentAttempt();

    const duplicate = await harness.deliver("subscription.not_renew");

    expect(duplicate.confirmation).toMatchObject({ transition: "already_applied" });
    expect(harness.currentAttempt()).toEqual(before);
    expect(harness.transitionMutation).not.toHaveBeenCalled();
  });

  it("keeps signature validation and exact identity checks before the 200 acknowledgement", () => {
    const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
    const webhook = routes.slice(
      routes.indexOf('app.post("/api/billing/paystack/webhook"'),
      routes.indexOf('app.post("/api/billing/verify-subscription"'),
    );
    const signatureCheck = webhook.indexOf("if (!signatureIsValid)");
    const acknowledgement = webhook.indexOf("res.status(200).json({ status: 'success' })");
    const dispatch = webhook.indexOf("await dispatchPaystackWebhookEvent(event, data)");

    expect(signatureCheck).toBeGreaterThanOrEqual(0);
    expect(signatureCheck).toBeLessThan(acknowledgement);
    expect(acknowledgement).toBeLessThan(dispatch);
  });

  it.each([
    ["handlePaystackSubscriptionNotRenew", "handlePaystackPaymentFailed"],
    ["handlePaystackSubscriptionDisable", "handlePaystackSubscriptionNotRenew"],
  ])("gates %s downstream side effects on a newly applied transition", (start, end) => {
    const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
    const handler = routes.slice(routes.indexOf(`async function ${start}`), routes.indexOf(`async function ${end}`));

    expect(handler).toContain('confirmation.transition !== "applied"');
    expect(handler.indexOf('confirmation.transition !== "applied"')).toBeLessThan(
      Math.min(
        ...["markSubscriptionNotRenewing", "cancelSubscription", "recordBillingEvent", "sendEmail"]
          .map((needle) => handler.indexOf(needle))
          .filter((index) => index >= 0),
      ),
    );
  });
});
