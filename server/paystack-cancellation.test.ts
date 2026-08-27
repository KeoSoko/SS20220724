import { describe, expect, it, vi } from "vitest";
import {
  createPaystackCancellationCoordinator,
  hasCancellationPaidAccess,
  type CancellationAttemptRecord,
} from "./paystack-cancellation";

function harness(activeIdentities: any[] = [{
  userId: 7,
  subscriptionCode: "SUB_current",
  customerCode: "CUS_current",
  planCode: "PLN_current",
  status: "active",
}]) {
  let attempt: CancellationAttemptRecord | null = null;
  const saveAttempt = vi.fn(async (input: any) => {
    attempt = { id: attempt?.id ?? 1, ...input };
    return attempt;
  });
  const deps = {
    withBillingOwnerLock: async (_userId: number, fn: () => Promise<any>) => fn(),
    getSubscription: vi.fn(async () => ({ id: 3, userId: 7, planId: 2, status: "active", nextBillingDate: new Date("2030-02-01"), paystackCustomerCode: "CUS_current" })),
    getPlan: vi.fn(async () => ({ id: 2, paystackPlanCode: "PLN_current" })),
    getActiveIdentities: vi.fn(async () => activeIdentities),
    getOpenAttempt: vi.fn(async () => attempt),
    getAttemptBySubscriptionCode: vi.fn(async () => attempt),
    saveAttempt,
    markCancellationRequested: vi.fn(async () => undefined),
  };
  return { coordinator: createPaystackCancellationCoordinator(deps), deps, getAttempt: () => attempt };
}

describe("Paystack cancellation foundation", () => {
  it("creates and then reuses one open cancellation attempt", async () => {
    const { coordinator, deps } = harness();
    const first = await coordinator.requestCancellation(7);
    const second = await coordinator.requestCancellation(7);

    expect(first.outcome).toBe("requested");
    expect(second.attempt.id).toBe(first.attempt.id);
    expect(deps.saveAttempt).toHaveBeenCalledTimes(1);
    expect(deps.markCancellationRequested).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["zero", []],
    ["multiple", [
      { userId: 7, subscriptionCode: "SUB_old", customerCode: "CUS_current", planCode: "PLN_current", status: "active" },
      { userId: 7, subscriptionCode: "SUB_new", customerCode: "CUS_current", planCode: "PLN_current", status: "active" },
    ]],
  ])("requires manual review for %s active identities", async (_label, identities) => {
    const { coordinator } = harness(identities);
    const result = await coordinator.requestCancellation(7);
    expect(result.outcome).toBe("manual_review_required");
    expect(result.attempt.status).toBe("manual_review_required");
  });

  it("confirms only the exact subscription and customer and is idempotent", async () => {
    const { coordinator } = harness();
    await coordinator.requestCancellation(7);

    expect((await coordinator.confirmLifecycle({
      subscriptionCode: "SUB_wrong", customerCode: "CUS_current", event: "subscription.not_renew",
    })).outcome).toBe("rejected");
    expect((await coordinator.confirmLifecycle({
      subscriptionCode: "SUB_current", customerCode: "CUS_wrong", event: "subscription.not_renew",
    })).outcome).toBe("rejected");

    const confirmed = await coordinator.confirmLifecycle({
      subscriptionCode: "SUB_current", customerCode: "CUS_current", event: "subscription.not_renew",
    });
    const duplicate = await coordinator.confirmLifecycle({
      subscriptionCode: "SUB_current", customerCode: "CUS_current", event: "subscription.not_renew",
    });
    const disabled = await coordinator.confirmLifecycle({
      subscriptionCode: "SUB_current", customerCode: "CUS_current", event: "subscription.disable",
    });

    expect(confirmed.attempt?.status).toBe("provider_non_renewing");
    expect(duplicate.attempt?.status).toBe("provider_non_renewing");
    expect(disabled.attempt?.status).toBe("provider_disabled");
  });

  it("keeps paid access until nextBillingDate after provider confirmation", () => {
    const attempt = { status: "provider_non_renewing" } as CancellationAttemptRecord;
    expect(hasCancellationPaidAccess({ status: "active", nextBillingDate: new Date("2030-02-01") }, attempt, new Date("2030-01-01"))).toBe(true);
    expect(hasCancellationPaidAccess({ status: "active", nextBillingDate: new Date("2030-02-01") }, attempt, new Date("2030-02-01"))).toBe(false);
  });
});
