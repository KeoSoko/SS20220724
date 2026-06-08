import { createWorker, type Worker, type RecognizeResult } from "tesseract.js";
import { log } from "./vite";

export interface OcrReceiptData {
  storeName: string;
  date: string;
  total: string;
  items: Array<{ name: string; price: string }>;
  confidenceScore: string;
}

const TOTAL_LABEL_PATTERN = /(?:grand\s+total|amount\s+due|balance\s+due|total\s+due|total|amount|paid)\s*[:\-]?\s*(?:ZAR|R|\$)?\s*([0-9][0-9\s,]*[.,][0-9]{2})/i;
const MONEY_PATTERN = /(?:ZAR|R|\$)?\s*([0-9][0-9\s,]*[.,][0-9]{2})/g;
const DATE_PATTERNS = [
  /(\d{4})[-/](\d{1,2})[-/](\d{1,2})/,
  /(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/,
  /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{2,4})/i,
];

const MONTH_MAP: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

function normalizeAmount(raw: string | undefined): string | null {
  if (!raw) return null;

  const cleaned = raw.replace(/\s/g, "").replace(/,/g, ".").replace(/[^0-9.-]/g, "");
  const value = parseFloat(cleaned);

  if (!Number.isFinite(value) || value < 0) {
    return null;
  }

  return value.toFixed(2);
}

function parseDate(text: string): string {
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;

    if (pattern === DATE_PATTERNS[0]) {
      const [, year, month, day] = match;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    if (match[2] && MONTH_MAP[match[2].toLowerCase().slice(0, 3)]) {
      const year = match[3].length === 2 ? `20${match[3]}` : match[3];
      const month = MONTH_MAP[match[2].toLowerCase().slice(0, 3)];
      return `${year}-${month}-${match[1].padStart(2, "0")}`;
    }

    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${month}-${day}`;
  }

  return new Date().toISOString().split("T")[0];
}

function parseStoreName(lines: string[]): string {
  const ignored = /^(tax invoice|receipt|invoice|vat|tel|phone|date|time|cashier|customer|merchant|www\.|https?:)/i;
  const candidate = lines.find((line) => line.length >= 3 && line.length <= 80 && !ignored.test(line));
  return candidate || "Unknown Store";
}

function parseTotal(text: string): string {
  const labelledTotal = text.match(TOTAL_LABEL_PATTERN);
  const labelledAmount = normalizeAmount(labelledTotal?.[1]);
  if (labelledAmount) return labelledAmount;

  const amounts = Array.from(text.matchAll(MONEY_PATTERN))
    .map((match) => normalizeAmount(match[1]))
    .filter((amount): amount is string => Boolean(amount))
    .map((amount) => parseFloat(amount));

  if (amounts.length === 0) return "0.00";
  return Math.max(...amounts).toFixed(2);
}

function parseItems(lines: string[], total: string): Array<{ name: string; price: string }> {
  const blocked = /(grand\s+total|amount\s+due|balance\s+due|total|subtotal|vat|tax|change|cash|card|paid|date|time|invoice|receipt)/i;
  const items: Array<{ name: string; price: string }> = [];

  for (const line of lines) {
    if (blocked.test(line)) continue;

    const matches = Array.from(line.matchAll(MONEY_PATTERN));
    if (matches.length === 0) continue;

    const lastMatch = matches[matches.length - 1];
    const price = normalizeAmount(lastMatch[1]);
    if (!price || parseFloat(price) <= 0) continue;

    const name = line
      .slice(0, lastMatch.index)
      .replace(/(?:ZAR|R|\$)?\s*[0-9][0-9\s,]*[.,][0-9]{2}/g, "")
      .replace(/[^a-z0-9 &'.\-/]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (name.length >= 2) {
      items.push({ name, price });
    }
  }

  if (items.length > 0) return items.slice(0, 50);
  return [{ name: "Receipt Total", price: total }];
}

function parseReceiptText(text: string): OcrReceiptData {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error("Receipt data not detected by fallback OCR");
  }

  const total = parseTotal(text);
  const items = parseItems(lines, total);

  return {
    storeName: parseStoreName(lines),
    date: parseDate(text),
    total,
    items,
    confidenceScore: total === "0.00" ? "0.35" : "0.55",
  };
}

export class LocalOcrFallback {
  async analyzeReceipt(imageData: string, timeoutMs?: number): Promise<OcrReceiptData> {
    let worker: Worker | null = null;

    try {
      log("Starting local Tesseract OCR fallback...", "ocr");
      worker = await createWorker("eng");
      await worker.setParameters({
        preserve_interword_spaces: "1",
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:/- Rr$ZARzar&'()",
      });

      // Race recognition against an internal timeout. When the timeout wins, control
      // leaves this try block and the `finally` runs worker.terminate(), which actually
      // stops the in-progress OCR rather than leaving it running in the background.
      const recognizePromise = worker.recognize(imageData);
      const result = (timeoutMs && timeoutMs > 0
        ? await Promise.race([
            recognizePromise,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Local OCR recognition timed out")), timeoutMs)
            ),
          ])
        : await recognizePromise) as RecognizeResult;
      const text = result.data.text?.trim() || "";
      const confidence = Number.isFinite(result.data.confidence) ? result.data.confidence : 0;

      if (!text) {
        throw new Error("Receipt data not detected by fallback OCR");
      }

      const parsed = parseReceiptText(text);
      parsed.confidenceScore = Math.max(parseFloat(parsed.confidenceScore), confidence / 100).toFixed(2);

      log(`Local OCR fallback succeeded: ${parsed.storeName} - ${parsed.total} (confidence ${parsed.confidenceScore})`, "ocr");
      return parsed;
    } finally {
      if (worker) {
        await worker.terminate();
      }
    }
  }
}

export const localOcrFallback = new LocalOcrFallback();
