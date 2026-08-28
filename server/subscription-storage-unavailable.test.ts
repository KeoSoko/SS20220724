import { describe, expect, it, vi } from "vitest";

vi.mock("./storage", () => ({
  storage: {
    getUserSubscription: vi.fn(async () => {
      throw new Error('column "cancellation_requested_at" does not exist');
    }),
  },
}));
vi.mock("./vite", () => ({ log: vi.fn() }));
vi.mock("./email-service", () => ({ emailService: null }));
vi.mock("./db", () => ({ db: {} }));
vi.mock("./paystack-billing-schema", () => ({
  getPaystackBillingSchemaReadiness: vi.fn(),
  requirePaystackBillingSchema: vi.fn(),
}));

import { BillingSubscriptionReadError } from "./billing-errors";
import { BillingService } from "./billing-service";

describe("subscription storage availability", () => {
  it("does not misclassify a schema/read failure as no subscription", async () => {
    const service = new BillingService();

    await expect(service.getUserSubscription(376)).rejects.toBeInstanceOf(
      BillingSubscriptionReadError,
    );
  });
});
