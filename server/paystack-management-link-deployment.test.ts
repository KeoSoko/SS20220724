import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const replitConfig = readFileSync(new URL("../.replit", import.meta.url), "utf8");

describe("Paystack management-link deployment", () => {
  it("enables the guarded management link in production", () => {
    expect(replitConfig).toContain(
      'PAYSTACK_SUBSCRIPTION_MANAGEMENT_LINK_ENABLED = "true"',
    );
  });
});
