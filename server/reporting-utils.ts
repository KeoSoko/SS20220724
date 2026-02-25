import { EXPENSE_CATEGORIES } from "@shared/schema";

export function getReportingCategory(
  category?: string | null,
  reportLabel?: string | null
): string {
  if (reportLabel?.trim()) {
    return reportLabel.trim();
  }
  return category || "other";
}

export function formatReportingCategory(category: string): string {
  if (EXPENSE_CATEGORIES.includes(category as (typeof EXPENSE_CATEGORIES)[number])) {
    return category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, " ");
  }
  return category;
}
