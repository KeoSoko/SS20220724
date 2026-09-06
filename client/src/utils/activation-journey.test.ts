import { describe, expect, it } from "vitest";
import { getActivationAction, getActivationStage } from "./activation-journey";

describe("activation journey stage gating", () => {
  it("keeps a new account on the first-slip action", () => {
    expect(getActivationStage({ receiptCount: 0, timestamps: {} })).toBe(1);
    expect(getActivationAction({ receiptCount: 0, timestamps: {} })).toMatchObject({ label: "Save first slip", href: "/upload" });
  });

  it("requires three slips and reviewed categories before stage two", () => {
    const threeSlips = { receiptCount: 3, timestamps: {} };
    expect(getActivationStage(threeSlips)).toBe(1);
    expect(getActivationAction(threeSlips)).toMatchObject({ label: "Review a receipt category", href: "/receipts" });
    expect(getActivationAction({ ...threeSlips, timestamps: { categories_reviewed: "2025-01-01" } })).toMatchObject({ label: "View spending summary" });
  });

  it("progresses through reporting and hides after all business milestones", () => {
    const stageTwo = { receiptCount: 3, timestamps: { categories_reviewed: "a", spending_summary_viewed: "b" } };
    expect(getActivationAction(stageTwo)).toMatchObject({ label: "Create or export report" });
    const complete = { receiptCount: 3, timestamps: { ...stageTwo.timestamps, first_report_created: "c", business_hub_viewed: "d", business_profile_completed: "e", first_quote_or_invoice_created: "f" } };
    expect(getActivationStage(complete)).toBeNull();
    expect(getActivationAction(complete)).toBeNull();
  });

  it("keeps navigation actions free of client-owned milestone events", () => {
    const readyForSummary = { receiptCount: 3, timestamps: { categories_reviewed: "a" } };
    expect(getActivationAction(readyForSummary)).toMatchObject({
      label: "View spending summary",
    });
    expect(getActivationAction(readyForSummary)).not.toHaveProperty("event");
    expect(getActivationAction({ receiptCount: 3, timestamps: { categories_reviewed: "a", spending_summary_viewed: "b" } })).toMatchObject({
      label: "Create or export report",
    });
  });
});