export function getReceiptCategoryLabel(category: string, reportLabel?: string | null): string {
  if (reportLabel?.trim()) {
    return reportLabel.trim();
  }
  return category ? category.replace(/_/g, " ") : "other";
}
