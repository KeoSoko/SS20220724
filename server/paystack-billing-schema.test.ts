import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const state = vi.hoisted(() => ({
  row: {} as Record<string, unknown>,
  throwOnQuery: false,
  queries: [] as unknown[],
}));

vi.mock("./db", () => ({
  db: {
    execute: vi.fn(async (query: unknown) => {
      state.queries.push(query);
      if (state.throwOnQuery) throw new Error("catalog unavailable");
      return { rows: [state.row] };
    }),
  },
}));

vi.mock("./vite", () => ({ log: vi.fn() }));

import {
  getPaystackBillingSchemaReadiness,
  resetPaystackBillingSchemaReadinessForTests,
} from "./paystack-billing-schema";

const readyRow = () => ({
  subscription_identities_table: true,
  checkout_attempts_table: true,
  subscription_code_unique: true,
  checkout_reference_unique: true,
  one_pending_checkout_per_owner: true,
});

beforeEach(() => {
  vi.useRealTimers();
  state.row = readyRow();
  state.throwOnQuery = false;
  state.queries.length = 0;
  resetPaystackBillingSchemaReadinessForTests();
});

describe("Paystack billing schema readiness", () => {
  it("fails closed when either required table or integrity guarantee is missing", async () => {
    state.row = {
      ...readyRow(),
      checkout_attempts_table: false,
      checkout_reference_unique: false,
      one_pending_checkout_per_owner: false,
    };

    const readiness = await getPaystackBillingSchemaReadiness();

    expect(readiness).toMatchObject({
      ready: false,
      missing: [
        "checkout_attempts_table",
        "checkout_reference_unique",
        "one_pending_checkout_per_owner",
      ],
    });
    expect(state.queries).toHaveLength(1);
  });

  it("recovers after the schema becomes ready instead of caching unavailability forever", async () => {
    state.row = {
      ...readyRow(),
      subscription_identities_table: false,
    };
    expect((await getPaystackBillingSchemaReadiness()).ready).toBe(false);

    state.row = readyRow();
    const recovered = await getPaystackBillingSchemaReadiness({ forceRefresh: true });

    expect(recovered).toMatchObject({ ready: true, missing: [] });
    expect(state.queries).toHaveLength(2);
  });

  it("refreshes unavailable readiness from the short-lived cache without a restart", async () => {
    vi.useFakeTimers();
    state.row = {
      ...readyRow(),
      subscription_identities_table: false,
    };
    expect((await getPaystackBillingSchemaReadiness()).ready).toBe(false);

    state.row = readyRow();
    vi.advanceTimersByTime(2_001);

    expect((await getPaystackBillingSchemaReadiness()).ready).toBe(true);
    expect(state.queries).toHaveLength(2);
  });

  it("fails closed when the catalog cannot be read", async () => {
    state.throwOnQuery = true;

    const readiness = await getPaystackBillingSchemaReadiness();

    expect(readiness.ready).toBe(false);
    expect(readiness.missing).toContain("subscription_identities_table");
    expect(readiness.missing).toContain("one_pending_checkout_per_owner");
  });

  it("uses only catalog reads and removes all startup DDL", () => {
    const readinessSource = readFileSync(
      new URL("./paystack-billing-schema.ts", import.meta.url),
      "utf8",
    );
    const seederSource = readFileSync(
      new URL("./subscription-plans-seeder.ts", import.meta.url),
      "utf8",
    );

    expect(readinessSource).toContain("pg_index");
    expect(readinessSource).toContain("to_regclass");
    expect(readinessSource).not.toMatch(/\b(CREATE|ALTER|DROP|INSERT|UPDATE|DELETE)\s+(TABLE|INDEX|INTO|FROM)/i);
    expect(seederSource).toContain("getPaystackBillingSchemaReadiness");
    expect(seederSource).not.toContain("ensurePaystackSubscriptionIdentitySchema");
    expect(seederSource).not.toMatch(/CREATE\s+(TABLE|INDEX)/i);
  });
});