import { EXPENSE_CATEGORIES } from "@shared/schema";

const CUSTOM_CATEGORY_REGEX = /\[Custom Category: (.*?)\]/i;

export function getReportingCategory(category?: string | null, notes?: string | null): string {
  const customMatch = notes?.match(CUSTOM_CATEGORY_REGEX);
  if (customMatch?.[1]?.trim()) {
    return customMatch[1].trim();
  }

  return category || "other";
}

export function formatReportingCategory(category: string): string {
  if (EXPENSE_CATEGORIES.includes(category as (typeof EXPENSE_CATEGORIES)[number])) {
    return category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, " ");
  }

  return category;
}
