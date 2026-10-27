import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = readFileSync(new URL("../client/src/components/admin-catchup-panel.tsx", import.meta.url), "utf8");
describe("admin catch-up panel contract", () => {
  it("uses normal authenticated API requests and separate preview/execute actions", () => {
    expect(source).toContain('apiRequest("POST"');
    expect(source).toContain("paystack-catchup/preview");
    expect(source).toContain("paystack-catchup/execute");
    expect(source).toContain("confirmationToken: approved.confirmationToken, confirmed: true");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("PAYSTACK_SECRET_KEY");
  });
  it("locks concurrent submissions, consumes confirmation and expires stale previews", () => {
    expect(source).toContain("lock.current = true");
    expect(source).toContain("Date.now() >= expiresAt");
    expect(source).toContain("setPreview(null); // Consume confirmation");
    expect(source).toContain("clearPreview(); setUserId");
    expect(source).toContain("clearPreview(); setSubscriptionId");
    expect(source).toContain("clearPreview(); setInvoiceCode");
    expect(source).not.toContain("useMutation");
  });
  it("distinguishes verification-only from charging and uncertain results from success", () => {
    expect(source).toContain('"Confirm verification only"');
    expect(source).toContain('"Confirm R49 charge"');
    expect(source).toContain('result.outcome === "payment_and_access_applied"');
    expect(source).toContain("A charge may have occurred");
    expect(source).toContain("Do not retry the charge");
  });
});
