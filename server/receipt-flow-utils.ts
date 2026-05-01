export type ReceiptSource = "scan" | "gallery" | "email" | "manual";

export function resolveReceiptSource(source: unknown): ReceiptSource {
  if (source === "manual" || source === "gallery" || source === "email") {
    return source;
  }
  return "scan";
}

export function resolveInitialCategorySource(source: ReceiptSource): "ai" | "user" | "rule" {
  return source === "manual" ? "user" : "ai";
}

export function shouldRunAiCategorization(source: ReceiptSource): boolean {
  return source !== "manual";
}
