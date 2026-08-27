import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Clear All Data billing isolation", () => {
  it("does not cancel billing or alter subscription/Paystack identity records", () => {
    const routes = readFileSync(join(__dirname, "routes.ts"), "utf8");
    const start = routes.indexOf('app.delete("/api/account/clear-data"');
    const end = routes.indexOf("// Get user preferences", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const handler = routes.slice(start, end);

    expect(handler).not.toMatch(/cancelSubscription|requestPaystackCancellation/);
    expect(handler).not.toMatch(/userSubscriptions|paystackSubscriptionIdentities|paystackCancellationAttempts/);
  });
});
