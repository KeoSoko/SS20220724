import { log } from "./vite";

export interface DeterministicExtractionResult {
  storeName: string;
  total: string;
  date: string;
  currency: string;
  items: string[];
  orderId?: string;
  confidence: number;
}

function findCurrencyAmount(text: string, label: string): string | null {
  const patterns = [
    new RegExp(`${label}[:\\s]*[R$]?\\s*([\\d,]+\\.\\d{2})`, "i"),
    new RegExp(`${label}[:\\s]*ZAR\\s*([\\d,]+\\.\\d{2})`, "i"),
    new RegExp(`${label}[:\\s]*R\\s*([\\d,]+\\.\\d{2})`, "i"),
    new RegExp(`${label}[:\\s]*\\$\\s*([\\d,]+\\.\\d{2})`, "i"),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].replace(/,/g, "");
    }
  }
  return null;
}

function findDate(text: string): string | null {
  const patterns = [
    /(\d{4}-\d{2}-\d{2})/,
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})/i,
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
  ];

  const monthMap: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      if (match[0].includes("-") && match[0].length === 10) {
        return match[0];
      }
      if (match[2] && monthMap[match[2].toLowerCase().substring(0, 3)]) {
        const month = monthMap[match[2].toLowerCase().substring(0, 3)];
        const day = match[1].padStart(2, "0");
        return `${match[3]}-${month}-${day}`;
      }
      if (match[3] && match[3].length === 4) {
        return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
      }
    }
  }
  return null;
}

export function extractUberEatsReceipt(text: string, subject: string): DeterministicExtractionResult | null {
  const total = findCurrencyAmount(text, "Total") || findCurrencyAmount(text, "Amount charged");
  if (!total || parseFloat(total) <= 0) {
    log(`[DETERMINISTIC_EXTRACTION_FAILED] Uber Eats: could not find total`, "inbound-email");
    return null;
  }

  const storeMatch = text.match(/(?:your order (?:from|at|with)\s+)([^\n|]+)/i)
    || text.match(/(?:order (?:from|at)\s+)([^\n|]+)/i)
    || text.match(/restaurant[:\s]+([^\n|]+)/i);
  const storeName = storeMatch ? storeMatch[1].trim().replace(/\s+/g, " ") : "Uber Eats";

  const date = findDate(text) || new Date().toISOString().substring(0, 10);

  const orderIdMatch = text.match(/order\s*(?:#|id|number)[:\s]*([A-Z0-9-]+)/i)
    || text.match(/#([A-F0-9]{4,})/i);
  const orderId = orderIdMatch ? orderIdMatch[1] : undefined;

  const items: string[] = [];
  const itemPatterns = [
    /(\d+)\s*x\s+(.+?)(?:\s+R?\s*[\d,.]+|$)/gim,
    /^(.+?)\s+R?\s*[\d,.]+\s*$/gm,
  ];
  for (const pattern of itemPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const item = (match[2] || match[1]).trim();
      if (item.length > 2 && item.length < 100 && !item.match(/^(total|subtotal|delivery|service|vat|discount)/i)) {
        items.push(item);
      }
      if (items.length >= 20) break;
    }
    if (items.length > 0) break;
  }

  log(`[DETERMINISTIC_EXTRACTION_SUCCESS] Uber Eats: store="${storeName}" total=${total} date=${date} items=${items.length}`, "inbound-email");
  return {
    storeName,
    total,
    date,
    currency: "ZAR",
    items,
    orderId,
    confidence: 0.9,
  };
}

export function extractTakealotReceipt(text: string, subject: string): DeterministicExtractionResult | null {
  const total = findCurrencyAmount(text, "Total") || findCurrencyAmount(text, "Order Total") || findCurrencyAmount(text, "Amount");
  if (!total || parseFloat(total) <= 0) {
    log(`[DETERMINISTIC_EXTRACTION_FAILED] Takealot: could not find total`, "inbound-email");
    return null;
  }

  const date = findDate(text) || new Date().toISOString().substring(0, 10);

  const orderIdMatch = text.match(/order\s*(?:#|number|id)[:\s]*(\d+)/i);
  const orderId = orderIdMatch ? orderIdMatch[1] : undefined;

  log(`[DETERMINISTIC_EXTRACTION_SUCCESS] Takealot: total=${total} date=${date}`, "inbound-email");
  return {
    storeName: "Takealot",
    total,
    date,
    currency: "ZAR",
    items: [],
    orderId,
    confidence: 0.9,
  };
}

export function extractPickNPayReceipt(text: string, subject: string): DeterministicExtractionResult | null {
  const total = findCurrencyAmount(text, "Total") || findCurrencyAmount(text, "Amount Due");
  if (!total || parseFloat(total) <= 0) {
    log(`[DETERMINISTIC_EXTRACTION_FAILED] Pick n Pay: could not find total`, "inbound-email");
    return null;
  }

  const date = findDate(text) || new Date().toISOString().substring(0, 10);

  log(`[DETERMINISTIC_EXTRACTION_SUCCESS] Pick n Pay: total=${total} date=${date}`, "inbound-email");
  return {
    storeName: "Pick n Pay",
    total,
    date,
    currency: "ZAR",
    items: [],
    confidence: 0.85,
  };
}

export function extractCheckersReceipt(text: string, subject: string): DeterministicExtractionResult | null {
  const total = findCurrencyAmount(text, "Total") || findCurrencyAmount(text, "Amount");
  if (!total || parseFloat(total) <= 0) {
    log(`[DETERMINISTIC_EXTRACTION_FAILED] Checkers: could not find total`, "inbound-email");
    return null;
  }

  const date = findDate(text) || new Date().toISOString().substring(0, 10);

  log(`[DETERMINISTIC_EXTRACTION_SUCCESS] Checkers: total=${total} date=${date}`, "inbound-email");
  return {
    storeName: "Checkers",
    total,
    date,
    currency: "ZAR",
    items: [],
    confidence: 0.85,
  };
}

export function extractAmazonReceipt(text: string, subject: string): DeterministicExtractionResult | null {
  const total = findCurrencyAmount(text, "Grand Total")
    || findCurrencyAmount(text, "Order Total")
    || findCurrencyAmount(text, "Total");
  if (!total || parseFloat(total) <= 0) {
    log(`[DETERMINISTIC_EXTRACTION_FAILED] Amazon: could not find total`, "inbound-email");
    return null;
  }

  const date = findDate(text) || new Date().toISOString().substring(0, 10);

  const orderIdMatch = text.match(/order\s*(?:#|number|id)[:\s]*(\d{3}-\d{7}-\d{7})/i)
    || text.match(/order\s*(?:#|number|id)[:\s]*([A-Z0-9-]+)/i);
  const orderId = orderIdMatch ? orderIdMatch[1] : undefined;

  log(`[DETERMINISTIC_EXTRACTION_SUCCESS] Amazon: total=${total} date=${date}`, "inbound-email");
  return {
    storeName: "Amazon",
    total,
    date,
    currency: "ZAR",
    items: [],
    orderId,
    confidence: 0.85,
  };
}

const VENDOR_EXTRACTORS: Record<string, (text: string, subject: string) => DeterministicExtractionResult | null> = {
  "Uber Eats": extractUberEatsReceipt,
  "Takealot": extractTakealotReceipt,
  "Pick n Pay": extractPickNPayReceipt,
  "Checkers": extractCheckersReceipt,
  "Amazon": extractAmazonReceipt,
};

export function deterministicExtract(vendor: string, text: string, subject: string): DeterministicExtractionResult | null {
  const extractor = VENDOR_EXTRACTORS[vendor];
  if (!extractor) {
    log(`[DETERMINISTIC_EXTRACTION_FAILED] No extractor for vendor="${vendor}"`, "inbound-email");
    return null;
  }
  return extractor(text, subject);
}
