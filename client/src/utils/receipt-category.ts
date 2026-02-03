export function getReceiptCategoryLabel(category: string, notes?: string | null): string {
  const customMatch = notes?.match(/\[Custom Category: (.*?)\]/i);
  const customLabel = customMatch?.[1]?.trim();

  if (customLabel) {
    return customLabel;
  }

  return category ? category.replace(/_/g, " ") : "other";
}

