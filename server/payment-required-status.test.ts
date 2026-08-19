import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./storage", () => ({
  storage: {
    getUserSubscription: vi.fn(),
    getSubscriptionPlan: vi.fn(),
  },
}));

import { storage } from "./storage";
import { getSubscriptionStatus } from "./subscription-middleware";

const mockStorage = storage as unknown as {
  getUserSubscription: ReturnType<typeof vi.fn>;
  getSubscriptionPlan: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  mockStorage.getSubscriptionPlan.mockResolvedValue({ id: 2, maxSeats: 1 });
});

describe("payment-required subscription status", () => {
  it("preserves access while an overdue active renewal is unresolved", async () => {
    const dueDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    mockStorage.getUserSubscription.mockResolvedValue({
      status: "active",
      planId: 2,
      nextBillingDate: dueDate,
      paystackReference: "paystack_ref",
    });

    const result = await getSubscriptionStatus(268);
    expect(result).toMatchObject({
      hasActiveSubscription: true,
      subscriptionType: "premium",
      paymentRecoveryRecommended: true,
      recoveryPath: "/subscription",
      subscriptionPlatform: "paystack",
    });
    expect(result.paymentRequired).toBeUndefined();
  });

  it("reports a paused renewal as payment required", async () => {
    mockStorage.getUserSubscription.mockResolvedValue({
      status: "paused",
      planId: 2,
      nextBillingDate: new Date("2026-08-02T00:00:00.000Z"),
      paystackReference: "paystack_ref",
    });

    const result = await getSubscriptionStatus(268);
    expect(result.paymentRequired).toBe(true);
    expect(result.hasActiveSubscription).toBe(false);
    expect(result.recoveryPath).toBe("/subscription");
  });
});