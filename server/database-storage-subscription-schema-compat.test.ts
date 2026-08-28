import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("generic subscription read production-schema compatibility", () => {
  const source = readFileSync(
    new URL("./database-storage.ts", import.meta.url),
    "utf8",
  );
  const method = source.slice(
    source.indexOf("async getUserSubscription(userId: number)"),
    source.indexOf("async createUserSubscription", source.indexOf("async getUserSubscription(userId: number)")),
  );

  it("uses an explicit projection instead of selecting every modeled column", () => {
    expect(method).toContain(".select({");
    expect(method).not.toContain(".select()\n");
  });

  it("does not read the production-missing cancellation_requested_at column", () => {
    expect(method).not.toContain("userSubscriptions.cancellationRequestedAt");
    expect(method).toContain('sql<Date | null>`NULL`');
  });

  it("preserves the subscription shape required by access and billing flows", () => {
    for (const field of [
      "id", "userId", "planId", "status", "trialStartDate", "trialEndDate",
      "subscriptionStartDate", "nextBillingDate", "cancelledAt",
      "paystackReference", "paystackCustomerCode", "authorizationCode",
      "totalPaid", "lastPaymentDate", "createdAt", "updatedAt",
    ]) {
      expect(method).toContain(`${field}: userSubscriptions.${field}`);
    }
  });
});
