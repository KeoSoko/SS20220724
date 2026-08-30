import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adminRoutes = readFileSync(new URL("./admin-routes.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../client/src/pages/receipt-image-health.tsx", import.meta.url), "utf8");
const azureStorage = readFileSync(new URL("./azure-storage.ts", import.meta.url), "utf8");

describe("receipt image health admin queue contract", () => {
  it("is admin-protected and read-only", () => {
    expect(adminRoutes).toContain('app.get("/api/admin/command-center/receipt-image-health", requireAdmin');
    expect(adminRoutes).not.toContain('app.post("/api/admin/command-center/receipt-image-health"');
    expect(adminRoutes).toContain("providerObjectExistenceChecked: false");
  });

  it("does not load full embedded image payloads into the scanner response", () => {
    expect(adminRoutes).toContain("imageDataPrefix:");
    expect(adminRoutes).not.toContain("imageData: receipts.imageData");
  });

  it("counts the full attachment history and applies the limit only to risky candidates", () => {
    expect(adminRoutes).toContain("attachmentEvidencePredicate");
    expect(adminRoutes).toContain("riskyImageMetadataPredicate");
    expect(adminRoutes).toContain("totalAttachmentsResult");
    expect(adminRoutes).toContain("historyScope: \"entire_database\"");
    expect(adminRoutes).not.toContain(".orderBy(desc(receipts.createdAt))\n        .limit(scanLimit + 1)");
  });

  it("states the metadata-only limitation in the admin interface", () => {
    expect(page).toContain("Full-history metadata scan");
    expect(page).toContain("does not contact or change Azure storage");
  });

  it("keeps provider inspection bounded, admin-only and non-mutating", () => {
    expect(adminRoutes).toContain('app.get("/api/admin/command-center/receipt-image-health/provider-scan", requireAdmin');
    expect(adminRoutes).toContain("Math.min(Math.max(requestedLimit, 1), 50)");
    expect(adminRoutes).toContain("azureStorage.inspectFileMetadata");
    expect(adminRoutes).not.toContain("azureStorage.generateSasUrl(row.blobName");
    expect(azureStorage).toContain("blockBlobClient.getProperties({ abortSignal: controller.signal })");
    expect(azureStorage).not.toContain("inspectFileMetadata(blobName: string, timeoutMs = 5000): Promise<AzureBlobInspectionResult> {\n    await this.initialize()");
  });
});
