import { describe, expect, it, vi } from "vitest";

vi.mock("./storage", () => ({
  storage: {
    getUserSubscription: vi.fn(async () => {
      throw new Error('column "cancellation_requested_at" does not exist');
    }),
  },
}));
vi.mock("./billing-owner", () => ({
  resolveBillingOwner: vi.fn(async (userId: number) => ({
    state: "resolved",
    relationship: "individual",
    canManageBilling: true,
    billingOwnerUserId: userId,
  })),
}));

import { BillingSubscriptionReadError } from "./billing-errors";
import {
  getEffectiveSubscriptionStatus,
  getSubscriptionStatus,
} from "./subscription-middleware";

describe("subscription access when billing storage is unavailable", () => {
  it("does not turn a database/schema failure into an unsubscribed customer", async () => {
    await expect(getSubscriptionStatus(376)).rejects.toBeInstanceOf(
      BillingSubscriptionReadError,
    );
    await expect(getEffectiveSubscriptionStatus(376)).rejects.toBeInstanceOf(
      BillingSubscriptionReadError,
    );
  });
});
