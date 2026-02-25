export function resolveCategory(
  category?: string | null,
  reportLabel?: string | null
): string {
  if (reportLabel?.trim()) return reportLabel.trim();
  return category || "other";
}
