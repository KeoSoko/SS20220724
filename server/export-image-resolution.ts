export type ExportImageFailure =
  | "missing_identity"
  | "missing_object"
  | "archived"
  | "rehydrating"
  | "timeout"
  | "temporarily_unavailable"
  | "unsupported_document"
  | "inaccessible"
  | "decode_failed";

export type AzureReceiptRetrievalStatus =
  | "missing"
  | "archived"
  | "rehydrating"
  | "inaccessible"
  | "timeout"
  | "temporarily_unavailable";

export function resolveLegacyReceiptBlobName(
  blobUrl: string,
  accountName: string,
  containerName = "receipt-images",
): string | null {
  try {
    const url = new URL(blobUrl);
    if (url.protocol !== "https:" || !accountName) return null;
    if (url.hostname.toLowerCase() !== `${accountName}.blob.core.windows.net`.toLowerCase()) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.shift() !== containerName || parts.length === 0) return null;
    return parts.map(part => decodeURIComponent(part)).join("/");
  } catch {
    return null;
  }
}

export function mapAzureRetrievalFailure(status: AzureReceiptRetrievalStatus): ExportImageFailure {
  switch (status) {
    case "missing": return "missing_object";
    case "archived": return "archived";
    case "rehydrating": return "rehydrating";
    case "inaccessible": return "inaccessible";
    case "timeout":
      return "timeout";
    case "temporarily_unavailable":
      return "temporarily_unavailable";
  }
}

export function supportedImageContentType(blobName: string, storedContentType?: string): string | null {
  if (storedContentType?.toLowerCase().startsWith("image/")) return storedContentType;
  const extension = blobName.split("?")[0].toLowerCase().split(".").pop();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return null;
}