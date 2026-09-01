import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Paystack server-initialized browser handoff", () => {
  const component = readFileSync(
    new URL("../client/src/components/paystack-billing.tsx", import.meta.url),
    "utf8",
  );

  it("resumes the exact server-issued access code instead of creating a frontend transaction", () => {
    expect(component).toContain("paystackPop.resumeTransaction(checkout.accessCode, {");
    expect(component).not.toContain("paystackPop.checkout({");
    expect(component).not.toContain("key: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY");
    expect(component).not.toMatch(/resumeTransaction\(\s*checkout\.accessCode\s*,\s*\{[^}]*\b(amount|email|plan|channels|reference)\s*:/s);
  });

  it("keeps completion callbacks around the resumed transaction", () => {
    expect(component).toContain("onSuccess: (transaction: any) =>");
    expect(component).toContain("onCancel: () =>");
    expect(component).toContain("onError: (error: any) =>");
    expect(component).toContain("onPaymentSuccess?.(transaction.reference)");
  });
});
