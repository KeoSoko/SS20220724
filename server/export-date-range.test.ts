import { describe, expect, it } from "vitest";
import {
  isReceiptWithinExportDateRange,
  normalizeReceiptExportDateRange,
} from "./export-date-range";

describe("receipt export date ranges in Johannesburg business time", () => {
  const range = normalizeReceiptExportDateRange("2026-08-01", "2026-08-31");

  it("normalizes selected dates to SAST midnight with an exclusive next-day end", () => {
    expect(range.startDate?.toISOString()).toBe("2026-07-31T22:00:00.000Z");
    expect(range.endDateExclusive?.toISOString()).toBe("2026-08-31T22:00:00.000Z");
  });

  it.each([
    ["beginning of end date", "2026-08-30T22:00:00.000Z"],
    ["midday of end date", "2026-08-31T10:00:00.000Z"],
    ["end of end date", "2026-08-31T21:59:59.999Z"],
  ])("includes the %s", (_label, instant) => {
    expect(isReceiptWithinExportDateRange(new Date(instant), range)).toBe(true);
  });

  it("excludes the first instant of the next Johannesburg day", () => {
    expect(isReceiptWithinExportDateRange(
      new Date("2026-08-31T22:00:00.000Z"),
      range,
    )).toBe(false);
  });

  it("does not move the Johannesburg start boundary back into the selected range", () => {
    expect(isReceiptWithinExportDateRange(
      new Date("2026-07-31T21:59:59.999Z"),
      range,
    )).toBe(false);
    expect(isReceiptWithinExportDateRange(
      new Date("2026-07-31T22:00:00.000Z"),
      range,
    )).toBe(true);
  });

  it("rejects invalid calendar dates instead of silently shifting them", () => {
    expect(() => normalizeReceiptExportDateRange("2026-08-32", "2026-08-31"))
      .toThrow("Invalid export date");
  });
});
