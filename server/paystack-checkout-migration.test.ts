import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Paystack checkout migration safety", () => {
  const migration = readFileSync(
    new URL("../migrations/0003_add_paystack_checkout_attempts.sql", import.meta.url),
    "utf8",
  );
  const journal = readFileSync(
    new URL("../migrations/meta/_journal.json", import.meta.url),
    "utf8",
  );

  it("enforces one pending attempt per billing owner at the database layer", () => {
    expect(migration).toMatch(/CREATE UNIQUE INDEX[\s\S]*billing_owner_user_id[\s\S]*WHERE "status" = 'pending'/i);
  });

  it("keeps references globally unique and preserves completed history", () => {
    expect(migration).toMatch(/paystack_reference" text NOT NULL UNIQUE/i);
    expect(migration).not.toMatch(/ON DELETE CASCADE/);
    expect(migration).toMatch(/completed_at/);
  });

  it("is additive and does not mutate existing subscriptions or payments", () => {
    expect(migration).not.toMatch(/^\s*(UPDATE\s+"?(user_subscriptions|payment_transactions)"?|DELETE FROM|ALTER TABLE\s+"?(user_subscriptions|payment_transactions)"?)/im);
  });

  it("registers identity, checkout, recurring-readiness, and access-code migrations in order", () => {
    const parsed = JSON.parse(journal);
    expect(parsed.entries.slice(-4).map((entry: any) => entry.tag)).toEqual([
      "0002_add_paystack_subscription_identities",
      "0003_add_paystack_checkout_attempts",
      "0004_add_paystack_recurring_readiness",
      "0005_add_paystack_access_code",
    ]);
  });
});