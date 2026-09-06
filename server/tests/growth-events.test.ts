import test from "node:test";
import assert from "node:assert/strict";
import {
  buildActivationResponse,
  isClientGrowthEventName,
  isGrowthEventName,
  receiptMilestoneNames,
  recordGrowthEventWithQuery,
} from "../growth-event-service";

test("growth event allowlist rejects arbitrary names", () => {
  assert.equal(isGrowthEventName("first_receipt_saved"), true);
  assert.equal(isGrowthEventName("billing_event"), false);
  assert.equal(isGrowthEventName("anything_else"), false);
});

test("client event allowlist rejects forged server-owned milestones", () => {
  assert.equal(isClientGrowthEventName("activation_journey_dismissed"), true);
  assert.equal(isClientGrowthEventName("spending_summary_viewed"), true);
  assert.equal(isClientGrowthEventName("categories_reviewed"), false);
  assert.equal(isClientGrowthEventName("business_hub_viewed"), false);
  assert.equal(isClientGrowthEventName("first_receipt_saved"), false);
  assert.equal(isClientGrowthEventName("business_profile_completed"), false);
  assert.equal(isClientGrowthEventName("first_report_created"), false);
  assert.equal(isClientGrowthEventName("first_quote_or_invoice_created"), false);
  assert.equal(isClientGrowthEventName("subscription_started"), false);
});

test("receipt milestone hook candidates include historical thresholds", () => {
  assert.deepEqual(receiptMilestoneNames(0), []);
  assert.deepEqual(receiptMilestoneNames(1), ["first_receipt_saved"]);
  assert.deepEqual(receiptMilestoneNames(3), ["first_receipt_saved", "third_receipt_saved"]);
  assert.deepEqual(receiptMilestoneNames(7), ["first_receipt_saved", "third_receipt_saved"]);
});

test("first-occurrence writes use database conflict idempotency without user data", async () => {
  const calls: Array<{ statement: string; values: unknown[] }> = [];
  const queryable = {
    query: async (statement: string, values: unknown[]) => {
      calls.push({ statement, values });
      return { rowCount: calls.length === 1 ? 1 : 0 };
    },
  };

  assert.equal(await recordGrowthEventWithQuery(queryable, 42, "signup_completed"), true);
  assert.equal(await recordGrowthEventWithQuery(queryable, 42, "signup_completed"), false);
  assert.equal(calls.length, 2);
  assert.match(calls[0].statement, /ON CONFLICT \(user_id, event_name\) DO NOTHING/);
});

test("activation response includes real receipt history and permanent dismissal", () => {
  const dismissedAt = new Date("2026-01-02T03:04:05.000Z");
  const activation = buildActivationResponse(
    [{ event_name: "activation_journey_dismissed", occurred_at: dismissedAt }],
    {
      receipt_count: "3",
      first_receipt_at: new Date("2026-01-01T00:00:00.000Z"),
      third_receipt_at: new Date("2026-01-03T00:00:00.000Z"),
    },
    { created_at: new Date("2025-12-31T00:00:00.000Z") },
    undefined,
    undefined,
    undefined,
  );
  assert.equal(activation.receiptCount, 3);
  assert.equal(activation.dismissed, true);
  assert.equal(activation.timestamps.activation_journey_dismissed, dismissedAt.toISOString());
  assert.equal(activation.timestamps.first_receipt_saved, "2026-01-01T00:00:00.000Z");
  assert.equal(activation.timestamps.third_receipt_saved, "2026-01-03T00:00:00.000Z");
});