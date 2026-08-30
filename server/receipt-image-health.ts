export type ReceiptImageHealthReason =
  | "expired_legacy_url_without_blob_name"
  | "legacy_url_without_blob_name"
  | "local_upload_reference"
  | "invalid_embedded_image_data";

export type ReceiptImageHealthSeverity = "critical" | "high" | "medium";

export interface ReceiptImageHealthEvidence {
  blobName: string | null;
  blobUrl: string | null;
  imageDataPresent: boolean;
  imageDataPrefix: string | null;
}

export interface ReceiptImageHealthFinding {
  reason: ReceiptImageHealthReason;
  severity: ReceiptImageHealthSeverity;
  explanation: string;
  recommendedAction: string;
}

function legacyUrlExpiry(blobUrl: string): Date | null {
  try {
    const expiry = new URL(blobUrl).searchParams.get("se");
    if (!expiry) return null;
    const parsed = new Date(expiry);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

export function classifyReceiptImageHealth(
  evidence: ReceiptImageHealthEvidence,
  now = new Date(),
): ReceiptImageHealthFinding | null {
  if (evidence.blobName?.trim()) {
    // blobName is the durable identity. A stored SAS URL may expire safely because
    // customer reads and exports generate a fresh URL from this value.
    return null;
  }

  if (evidence.imageDataPresent) {
    const prefix = evidence.imageDataPrefix?.trim().toLowerCase() ?? "";
    if (prefix.startsWith("data:image/") || prefix.startsWith("data:application/pdf")) {
      return null;
    }
    return {
      reason: "invalid_embedded_image_data",
      severity: "high",
      explanation: "The receipt has embedded image data, but it is not a supported image or PDF data URL.",
      recommendedAction: "Inspect the receipt and ask the customer to replace the attachment if it cannot be opened.",
    };
  }

  const blobUrl = evidence.blobUrl?.trim();
  if (!blobUrl) return null;

  if (blobUrl.startsWith("/uploads/")) {
    return {
      reason: "local_upload_reference",
      severity: "medium",
      explanation: "The receipt points to deployment-local storage instead of a durable Azure blob identity.",
      recommendedAction: "Verify the image is still available, then migrate it through a separately reviewed repair flow.",
    };
  }

  const expiry = legacyUrlExpiry(blobUrl);
  if (expiry && expiry.getTime() <= now.getTime()) {
    return {
      reason: "expired_legacy_url_without_blob_name",
      severity: "critical",
      explanation: "The only stored image reference is an expired provider URL and no durable blob name is available.",
      recommendedAction: "Confirm the original blob identity from durable evidence or request a replacement image; do not guess it.",
    };
  }

  return {
    reason: "legacy_url_without_blob_name",
    severity: "high",
    explanation: "The receipt relies on a provider URL without a durable blob name, so future access cannot be renewed safely.",
    recommendedAction: "Verify and record the exact blob identity through a separately reviewed repair flow.",
  };
}
