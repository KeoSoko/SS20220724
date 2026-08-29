import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const receiptsPage = readFileSync(new URL("../client/src/pages/receipts-page.tsx", import.meta.url), "utf8");
const exportsPage = readFileSync(new URL("../client/src/pages/exports-page.tsx", import.meta.url), "utf8");
const exportService = readFileSync(new URL("./export-service.ts", import.meta.url), "utf8");
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");

describe("customer export discoverability", () => {
  it("provides an active receipts-page action that carries applicable filter context to Excel reports", () => {
    expect(receiptsPage).toContain('data-testid="button-export-receipts"');
    expect(receiptsPage).toContain("Export to Excel / Reports");
    expect(receiptsPage).toContain("focus: 'csv'");
    expect(receiptsPage).toContain("...(dateFrom && { startDate: dateFrom })");
    expect(receiptsPage).toContain("...(dateTo && { endDate: dateTo })");
    expect(receiptsPage).toContain("setLocation(`/exports?${params.toString()}`)");
    expect(receiptsPage).not.toContain("from '@/components/export-menu'");
  });

  it("keeps Excel / CSV and its plain-language download action immediately visible", () => {
    expect(exportsPage).toContain("Excel / CSV");
    expect(exportsPage).toContain("Download for Excel (CSV)");
    expect(exportsPage).not.toContain("showDateRangeExport");
    expect(exportsPage).not.toContain("setShowDateRangeExport");
    expect(exportsPage).not.toContain("from '@/components/export-menu'");
  });
});

describe("image-heavy PDF reliability contract", () => {
  it("keeps bounded parallel image fetching and placeholder degradation", () => {
    expect(exportService).toContain("const IMAGE_BATCH_SIZE = 10");
    expect(exportService).toContain("const IMAGE_PHASE_BUDGET_MS = 20000");
    expect(exportService).toContain("await Promise.all(batch.map");
    expect(exportService).toContain("fetchAzureImageWithTimeout(r.blobName as string, 5000)");
    expect(exportService).toContain("Receipt image could not be loaded");
    expect(exportService).toContain("Receipt image not available");
  });

  it("uses the bounded image fetch helper for single-receipt PDFs too", () => {
    expect(exportService).toContain("fetchAzureImageWithTimeout(blobNameStr, 5000)");
    expect(exportService).not.toContain("const response = await fetch(imageUrl);");
  });

  it("returns machine-readable partial export diagnostics without failing the download", () => {
    expect(exportService).toContain("imagesUnavailable");
    expect(routes).toContain("X-Export-Receipt-Count");
    expect(routes).toContain("X-Export-Images-Unavailable");
    expect(exportsPage).toContain("Some receipt images were unavailable");
  });

  it("logs both successful and failed PDF export outcomes", () => {
    expect(exportService).toContain('outcome: "success"');
    expect(exportService).toContain('outcome: "failed"');
    expect(exportService).toContain('stage: "EXPORT_RECEIPTS_COMPLETED"');
  });
});
