import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("billing operations dashboard", () => {
  it("is admin-only and read-only", () => {
    const source = readFileSync(new URL("./admin-routes.ts", import.meta.url), "utf8");
    const start = source.indexOf('app.get("/api/admin/command-center/billing-operations"');
    const end = source.indexOf("// ========================================", start);
    const route = source.slice(start, end);
    expect(route).toContain("requireAdmin");
    expect(route).toContain("capabilities: { readOnly: true, settlement: false, cancellation: false");
    expect(route).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    expect(route).not.toMatch(/subscription\.(disable|create|enable)|transaction\.charge/);
    expect(route).toContain("if (account.isAdmin) continue");
    expect(route).toContain("if (event.userIsAdmin) continue");
    expect(route).toContain("resolvedReferences.has");
    expect(route).toContain("resolvedSubscriptionAt.get");
    expect(route).toContain('"renewal_reconciliation_unresolved"');
    expect(route).toContain("activeAccountByUserId.get");
    expect(route).toContain("planName: currentAccount?.planName ?? null");
    expect(route).toContain('"paystack_missing_customer_identity_reconciled"');
    expect(route).toContain('queue: "review", severity: "medium", title: "Billing date overdue; payment status is not yet verified"');
    expect(route).toContain('data.classification === "payment_and_entitlement_applied"');
    expect(route).not.toContain('queue: "urgent", severity: "critical", title: "Paid access boundary is overdue"');
  });

  it("shows the dedicated admin page and keeps identity repair individually confirmed", () => {
    const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
    const page = readFileSync(new URL("../client/src/pages/billing-operations.tsx", import.meta.url), "utf8");
    expect(app).toContain('path="/command-center/billing"');
    expect(app.indexOf('path="/command-center/billing"')).toBeLessThan(app.indexOf('path="/command-center"'));
    expect(page).toContain("Queue discovery is read-only");
    expect(page).toContain("View technical details");
    expect(page).toContain("Inspect Paystack");
    expect(page).toContain("Confirm identity repair");
    expect(page).toContain("paystack-subscription-candidates");
    expect(page).toContain("paystack-subscription-resolution");
    expect(page).toContain("confirmed: true");
    expect(page).toContain("candidates.length === 1");
    expect(page).toContain('selected.status === "active"');
    expect(page).toContain("Multiple plausible subscriptions were found");
    expect(page).not.toContain("paystack-manual-identity-repair/execute");
    expect(page).not.toMatch(/subscription\.(disable|create|enable)|transaction\.charge/);
  });
});
