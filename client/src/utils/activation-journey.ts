export type ActivationTimestamps = Record<string, string | null | undefined>;

export type ActivationSnapshot = {
  receiptCount: number;
  timestamps: ActivationTimestamps;
};

export type ActivationStage = 1 | 2 | 3;

export type ActivationAction = {
  stage: ActivationStage;
  label: string;
  href: string;
};

const has = (timestamps: ActivationTimestamps, name: string) => Boolean(timestamps[name]);

export function getActivationStage(snapshot: ActivationSnapshot): ActivationStage | null {
  const { receiptCount, timestamps } = snapshot;
  const stageOneComplete = receiptCount >= 3 && has(timestamps, "categories_reviewed");
  if (!stageOneComplete) return 1;

  const stageTwoComplete =
    has(timestamps, "spending_summary_viewed") &&
    (has(timestamps, "first_report_created") || has(timestamps, "first_report_exported"));
  if (!stageTwoComplete) return 2;

  const stageThreeComplete =
    has(timestamps, "business_hub_viewed") &&
    has(timestamps, "business_profile_completed") &&
    has(timestamps, "first_quote_or_invoice_created");
  return stageThreeComplete ? null : 3;
}

export function getActivationAction(snapshot: ActivationSnapshot): ActivationAction | null {
  const stage = getActivationStage(snapshot);
  if (!stage) return null;
  const { receiptCount, timestamps } = snapshot;

  if (stage === 1) {
    if (receiptCount === 0) return { stage, label: "Save first slip", href: "/upload" };
    if (receiptCount < 3) return { stage, label: "Save 3 slips", href: "/upload" };
    return { stage, label: "Review a receipt category", href: "/receipts" };
  }
  if (stage === 2) {
    if (!has(timestamps, "spending_summary_viewed")) {
      return { stage, label: "View spending summary", href: "/analytics" };
    }
    return { stage, label: "Create or export report", href: "/exports" };
  }
  if (!has(timestamps, "business_hub_viewed")) {
    return { stage, label: "Explore Business Hub", href: "/business-hub" };
  }
  if (!has(timestamps, "business_profile_completed")) {
    return { stage, label: "Complete business details", href: "/business-profile" };
  }
  return { stage, label: "Create quote or invoice", href: "/quotations/new" };
}