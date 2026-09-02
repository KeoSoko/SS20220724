import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./export-service.ts", import.meta.url), "utf8");

describe("receipt export architecture", () => {
  it("uses one receipt selection pipeline for CSV, PDF, and tax reports", () => {
    const selectorStart = source.indexOf("private async selectReceiptExportDataset");
    const selectorEnd = source.indexOf("private async getSimpleSlipsLogoCompressed", selectorStart);
    const selector = source.slice(selectorStart, selectorEnd);
    expect(selectorStart).toBeGreaterThan(-1);
    expect(selector).toContain("storage.getReceiptsByUser(userId, 10000)");
    expect(selector).toContain("isReceiptWithinExportDateRange(receipt.date, selection)");
    expect(selector).toContain("this.matchesCategoryFilter(receipt, selection.category)");
    expect(selector).toContain("selection.deductibleOnly");
    expect(selector).toContain("selection.taxYear");

    const uses = source.match(/this\.selectReceiptExportDataset\(/g) ?? [];
    expect(uses).toHaveLength(3);
  });
});
