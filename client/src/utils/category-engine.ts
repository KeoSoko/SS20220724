export function resolveCategory(
  category?: string | null,
  reportLabel?: string | null
): string {
  return reportLabel?.trim() || category || "other";
}

export function formatCategoryLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function normalizeCategory(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
