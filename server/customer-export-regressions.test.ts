import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const receiptsPage = readFileSync(new URL("../client/src/pages/receipts-page.tsx", import.meta.url), "utf8");
const exportsPage = readFileSync(new URL("../client/src/pages/exports-page.tsx", import.meta.url), "utf8");
const exportService = readFileSync(new URL("./export-service.ts", import.meta.url), "utf8");

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
});
