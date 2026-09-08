import { describe, expect, it } from "vitest";
import { isValidExportBlobPath } from "./export-blob-path";

describe("background export blob paths", () => {
  it("accepts legacy and attempt-scoped server-generated PDF and CSV paths", () => {
    expect(isValidExportBlobPath("exports/42/123e4567-e89b-12d3-a456-426614174000.pdf")).toBe(true);
    expect(isValidExportBlobPath("exports/42/123e4567-e89b-12d3-a456-426614174000-2.csv")).toBe(true);
  });

  it("rejects traversal, other roots, words and unsupported extensions", () => {
    expect(isValidExportBlobPath("exports/42/../../secret.pdf")).toBe(false);
    expect(isValidExportBlobPath("receipt-images/42/file.pdf")).toBe(false);
    expect(isValidExportBlobPath("exports/42/job-attempt-2.pdf")).toBe(false);
    expect(isValidExportBlobPath("exports/42/123e4567.zip")).toBe(false);
  });
});