import { describe, expect, it } from "vitest";
import { classifyReceiptImageHealth } from "./receipt-image-health";

const now = new Date("2026-08-30T10:00:00.000Z");

describe("receipt image health metadata classifier", () => {
  it("trusts a durable blob name even when the cached SAS URL is expired", () => {
    expect(classifyReceiptImageHealth({
      blobName: "receipt_123.jpg",
      blobUrl: "https://example.test/receipt.jpg?se=2025-01-01T00%3A00%3A00Z",
      imageDataPresent: false,
      imageDataPrefix: null,
    }, now)).toBeNull();
  });

  it("flags an expired legacy URL without inventing a blob identity", () => {
    expect(classifyReceiptImageHealth({
      blobName: null,
      blobUrl: "https://example.test/receipt.jpg?se=2026-08-29T00%3A00%3A00Z",
      imageDataPresent: false,
      imageDataPrefix: null,
    }, now)?.reason).toBe("expired_legacy_url_without_blob_name");
  });

  it("flags renewable-risk legacy URLs that have no blob name", () => {
    expect(classifyReceiptImageHealth({
      blobName: null,
      blobUrl: "https://example.test/receipt.jpg?se=2027-08-30T00%3A00%3A00Z",
      imageDataPresent: false,
      imageDataPrefix: null,
    }, now)?.reason).toBe("legacy_url_without_blob_name");
  });

  it("flags deployment-local upload references", () => {
    expect(classifyReceiptImageHealth({
      blobName: null,
      blobUrl: "/uploads/receipt.jpg",
      imageDataPresent: false,
      imageDataPrefix: null,
    }, now)?.reason).toBe("local_upload_reference");
  });

  it("accepts supported embedded images and flags invalid embedded data", () => {
    expect(classifyReceiptImageHealth({ blobName: null, blobUrl: null, imageDataPresent: true, imageDataPrefix: "data:image/jpeg;base64," }, now)).toBeNull();
    expect(classifyReceiptImageHealth({ blobName: null, blobUrl: null, imageDataPresent: true, imageDataPrefix: "not-an-image" }, now)?.reason).toBe("invalid_embedded_image_data");
  });

  it("does not flag receipts that never claimed to have an attachment", () => {
    expect(classifyReceiptImageHealth({ blobName: null, blobUrl: null, imageDataPresent: false, imageDataPrefix: null }, now)).toBeNull();
  });
});
