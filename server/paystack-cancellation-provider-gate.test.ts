import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Phase 3 Paystack cancellation provider gate", () => {
  it("keeps ordinary customer cancellation free of a direct provider mutation", () => {
    const billing = readFileSync(join(__dirname, "billing-service.ts"), "utf8");
    const routes = readFileSync(join(__dirname, "routes.ts"), "utf8");
    const start = billing.indexOf("async requestPaystackCancellation");
    const end = billing.indexOf("async confirmPaystackCancellationLifecycle", start);
    expect(billing.slice(start, end)).not.toMatch(/subscription\.disable\s*\(/);
    expect(routes).not.toMatch(/api\.paystack\.co\/subscription\/disable/);
    expect(routes).toContain("requestPaystackCancellation");
  });

  it("keeps provider validation read-only", () => {
    const source = readFileSync(join(__dirname, "billing-service.ts"), "utf8");
    const start = source.indexOf("async fetchAndValidateCancellationTarget");
    const end = source.indexOf("/**", start + 10);
    const method = source.slice(start, end > start ? end : undefined);
    expect(method).toContain("subscription.get");
    expect(method).not.toMatch(/subscription\.(disable|enable|create)|transaction\.(charge|initialize)/);
    expect(method).not.toMatch(/emailToken.*(log|recordBillingEvent)/);
  });
});
