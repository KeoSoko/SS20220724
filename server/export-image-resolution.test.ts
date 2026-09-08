import { describe, expect, it } from "vitest";
import {
  mapAzureRetrievalFailure,
  resolveLegacyReceiptBlobName,
  supportedImageContentType,
} from "./export-image-resolution";

describe("legacy receipt blob URL resolution", () => {
  it("recovers a durable identity from the configured account and container", () => {
    expect(resolveLegacyReceiptBlobName(
      "https://receipts.blob.core.windows.net/receipt-images/older%20folder/photo.jpg?expired=yes",
      "receipts",
    )).toBe("older folder/photo.jpg");
  });

  it("rejects external accounts, other containers, non-https URLs and malformed escapes", () => {
    expect(resolveLegacyReceiptBlobName("https://other.blob.core.windows.net/receipt-images/photo.jpg", "receipts")).toBeNull();
    expect(resolveLegacyReceiptBlobName("https://receipts.blob.core.windows.net/exports/photo.jpg", "receipts")).toBeNull();
    expect(resolveLegacyReceiptBlobName("http://receipts.blob.core.windows.net/receipt-images/photo.jpg", "receipts")).toBeNull();
    expect(resolveLegacyReceiptBlobName("https://receipts.blob.core.windows.net/receipt-images/%XX", "receipts")).toBeNull();
  });
});

describe("receipt export image classification", () => {
  it("distinguishes retryable, recovery, missing and inaccessible retrieval outcomes", () => {
    expect(mapAzureRetrievalFailure("timeout")).toBe("timeout");
    expect(mapAzureRetrievalFailure("temporarily_unavailable")).toBe("temporarily_unavailable");
    expect(mapAzureRetrievalFailure("archived")).toBe("archived");
    expect(mapAzureRetrievalFailure("rehydrating")).toBe("rehydrating");
    expect(mapAzureRetrievalFailure("missing")).toBe("missing_object");
    expect(mapAzureRetrievalFailure("inaccessible")).toBe("inaccessible");
  });

  it("supports image metadata and legacy image extensions while rejecting documents", () => {
    expect(supportedImageContentType("scan.bin", "image/png")).toBe("image/png");
    expect(supportedImageContentType("legacy/photo.JPG", "application/octet-stream")).toBe("image/jpeg");
    expect(supportedImageContentType("legacy/photo.webp")).toBe("image/webp");
    expect(supportedImageContentType("statement.pdf", "application/pdf")).toBeNull();
  });
});