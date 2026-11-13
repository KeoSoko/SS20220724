import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PaystackCardManagement } from "../client/src/components/paystack-card-management";
import type { PaystackCardManagementState } from "@shared/paystack-card-management";

function render(state: PaystackCardManagementState, busy = false) {
  return renderToStaticMarkup(createElement(PaystackCardManagement, {
    state, busy, fetching: false, open: vi.fn(), refresh: vi.fn(async () => undefined),
  }));
}

describe("discoverable payment card control", () => {
  it("renders one enabled owner action before any renewal is due", () => {
    const html = render("ready");
    expect(html.match(/Change payment card/g)).toHaveLength(1);
    expect(html).not.toContain('disabled=""');
    expect(html).toContain("This does not start another checkout");
  });

  it.each(["pending", "disabled", "review_required", "unavailable"] as const)(
    "keeps the %s action visible but disabled with support guidance", (state) => {
      const html = render(state);
      expect(html).toContain("Change payment card");
      expect(html).toContain('disabled=""');
      expect(html).toContain("Contact support");
      expect(html).toContain('aria-describedby="paystack-card-management-explanation"');
      expect(html).not.toMatch(/Renewal being checked|checking your renewal/i);
    },
  );

  it("offers an explicit status retry on a temporary read failure", () => {
    expect(render("unavailable")).toContain("Retry status");
  });

  it("disables an eligible action while its hosted-link request is in progress", () => {
    expect(render("ready", true)).toContain('disabled=""');
  });

  it("renders nothing when the server denies owner Paystack controls", () => {
    expect(render("hidden")).toBe("");
  });
});
