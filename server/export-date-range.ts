const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;

export type ReceiptExportDateRange = {
  startDate?: Date;
  endDateExclusive?: Date;
};

function parseJohannesburgCalendarDate(value: string, nextDay: boolean): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid export date: ${value}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const validationDate = new Date(Date.UTC(year, month - 1, day));
  if (
    validationDate.getUTCFullYear() !== year
    || validationDate.getUTCMonth() !== month - 1
    || validationDate.getUTCDate() !== day
  ) {
    throw new Error(`Invalid export date: ${value}`);
  }

  const dayOffset = nextDay ? 1 : 0;
  return new Date(Date.UTC(year, month - 1, day + dayOffset) - SAST_OFFSET_MS);
}

/**
 * Converts date-only customer selections to stable Johannesburg/SAST bounds.
 * The end is the exclusive start of the following local calendar day.
 */
export function normalizeReceiptExportDateRange(
  startDate?: string,
  endDate?: string,
): ReceiptExportDateRange {
  const normalized = {
    startDate: startDate ? parseJohannesburgCalendarDate(startDate, false) : undefined,
    endDateExclusive: endDate ? parseJohannesburgCalendarDate(endDate, true) : undefined,
  };
  if (
    normalized.startDate
    && normalized.endDateExclusive
    && normalized.startDate >= normalized.endDateExclusive
  ) {
    throw new Error("Invalid export date range: start date is after end date");
  }
  return normalized;
}

export function isReceiptWithinExportDateRange(
  receiptDate: Date,
  range: ReceiptExportDateRange,
): boolean {
  if (range.startDate && receiptDate < range.startDate) return false;
  if (range.endDateExclusive && receiptDate >= range.endDateExclusive) return false;
  return true;
}
