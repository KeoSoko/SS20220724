export function normalizeMerchantName(name: string): string {
  if (!name) return "";

  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/via .*$/i, "")
    .replace(/,.*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
