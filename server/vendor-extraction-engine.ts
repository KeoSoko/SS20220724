import * as cheerio from "cheerio";
import { log } from "./vite";

export interface HtmlExtractionResult {
  storeName: string;
  total: string;
  date: string;
  currency: string;
  items: string[];
  orderId?: string;
  confidence: number;
  fieldsMatched: string[];
}

interface VendorConfig {
  name: string;
  totalLabels: string[];
  dateLabels: string[];
  orderIdLabels: string[];
  storeNameLabels: string[];
  itemSelectors: string[];
  currencySymbols: string[];
  customExtractor?: (($: cheerio.CheerioAPI, subject: string) => Partial<HtmlExtractionResult>) | null;
}

const VENDOR_CONFIGS: Record<string, VendorConfig> = {
  "Pick n Pay": {
    name: "Pick n Pay",
    totalLabels: ["total", "amount due", "amount paid", "balance due", "total due", "total amount"],
    dateLabels: ["date", "transaction date", "receipt date", "purchase date"],
    orderIdLabels: ["receipt no", "receipt number", "transaction", "reference", "slip no"],
    storeNameLabels: ["store", "branch", "location"],
    itemSelectors: [],
    currencySymbols: ["R", "ZAR"],
    customExtractor($: cheerio.CheerioAPI, subject: string) {
      const result: Partial<HtmlExtractionResult> = {};
      const subjectMatch = subject.match(/pick\s*n\s*pay.*?(?:digital\s*receipt\s*-?\s*)(.+?)(?:\s*-\s*(\d{2}\.\d{2}\.\d{4}))?$/i);
      if (subjectMatch) {
        if (subjectMatch[1]) {
          const branchPart = subjectMatch[1].replace(/\s*-\s*\d{2}\.\d{2}\.\d{4}.*$/, "").trim();
          if (branchPart && branchPart.length > 2) {
            result.storeName = `Pick n Pay ${branchPart}`;
          }
        }
        if (subjectMatch[2]) {
          const [dd, mm, yyyy] = subjectMatch[2].split(".");
          result.date = `${yyyy}-${mm}-${dd}`;
        }
      }
      const dateFromSubject = subject.match(/(\d{2})\.(\d{2})\.(\d{4})/);
      if (!result.date && dateFromSubject) {
        result.date = `${dateFromSubject[3]}-${dateFromSubject[2]}-${dateFromSubject[1]}`;
      }
      return result;
    },
  },
  "Takealot": {
    name: "Takealot",
    totalLabels: ["total", "order total", "amount paid", "total paid", "grand total"],
    dateLabels: ["order date", "date", "placed on", "ordered on"],
    orderIdLabels: ["order number", "order no", "order id", "order #", "order"],
    storeNameLabels: [],
    itemSelectors: [],
    currencySymbols: ["R", "ZAR"],
    customExtractor: null,
  },
  "Amazon": {
    name: "Amazon",
    totalLabels: ["grand total", "order total", "total", "amount charged", "total for this order"],
    dateLabels: ["order date", "date", "placed on", "ordered on"],
    orderIdLabels: ["order #", "order number", "order id", "order no"],
    storeNameLabels: [],
    itemSelectors: [],
    currencySymbols: ["R", "ZAR", "$", "USD", "£", "GBP", "€", "EUR"],
    customExtractor: null,
  },
  "Checkers": {
    name: "Checkers",
    totalLabels: ["total", "amount due", "amount paid", "balance due", "total due", "total amount", "order total"],
    dateLabels: ["date", "order date", "delivery date"],
    orderIdLabels: ["order number", "order no", "reference", "order #", "order id"],
    storeNameLabels: ["store", "branch"],
    itemSelectors: [],
    currencySymbols: ["R", "ZAR"],
    customExtractor: null,
  },
  "Uber Eats": {
    name: "Uber Eats",
    totalLabels: ["total", "amount charged", "you paid", "order total"],
    dateLabels: ["date", "order date", "delivered on"],
    orderIdLabels: ["order #", "order number", "order id"],
    storeNameLabels: ["restaurant", "ordered from", "your order from"],
    itemSelectors: [],
    currencySymbols: ["R", "ZAR"],
    customExtractor($: cheerio.CheerioAPI, subject: string) {
      const result: Partial<HtmlExtractionResult> = {};
      const storeMatch = subject.match(/(?:your\s+)?(?:order\s+(?:from|at|with)\s+)(.+?)(?:\s+is|\s+has|\s*$)/i)
        || subject.match(/uber\s*eats.*?(?:from\s+)(.+?)$/i);
      if (storeMatch && storeMatch[1]) {
        result.storeName = storeMatch[1].trim();
      }
      return result;
    },
  },
};

function normalizeCurrency(raw: string): string | null {
  let cleaned = raw
    .replace(/\s+/g, "")
    .replace(/[^\d,.R$£€-]/g, "")
    .replace(/^[R$£€]+/, "")
    .trim();

  if (!cleaned) return null;

  const commaDecimal = cleaned.match(/^(\d{1,3}(?:\.\d{3})*),(\d{2})$/);
  if (commaDecimal) {
    cleaned = commaDecimal[1].replace(/\./g, "") + "." + commaDecimal[2];
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }

  const match = cleaned.match(/(\d+\.?\d*)/);
  if (!match) return null;

  const num = parseFloat(match[1]);
  if (isNaN(num) || num <= 0) return null;

  return num.toFixed(2);
}

function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim();

  const iso = trimmed.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];

  const dotFormat = trimmed.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (dotFormat) return `${dotFormat[3]}-${dotFormat[2]}-${dotFormat[1]}`;

  const monthMap: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    january: "01", february: "02", march: "03", april: "04", june: "06",
    july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
  };

  const namedMonth = trimmed.match(/(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})/i);
  if (namedMonth) {
    const month = monthMap[namedMonth[2].toLowerCase()];
    if (month) return `${namedMonth[3]}-${month}-${namedMonth[1].padStart(2, "0")}`;
  }

  const namedMonthFirst = trimmed.match(/(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (namedMonthFirst) {
    const month = monthMap[namedMonthFirst[1].toLowerCase()];
    if (month) return `${namedMonthFirst[3]}-${month}-${namedMonthFirst[2].padStart(2, "0")}`;
  }

  const slashDash = trimmed.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (slashDash) {
    return `${slashDash[3]}-${slashDash[2].padStart(2, "0")}-${slashDash[1].padStart(2, "0")}`;
  }

  return null;
}

function findValueInAdjacentCells($: cheerio.CheerioAPI, labels: string[]): string | null {
  const lowerLabels = labels.map(l => l.toLowerCase());

  const allCells = $("td, th").toArray();
  for (const cell of allCells) {
    const cellText = $(cell).text().replace(/\s+/g, " ").trim().toLowerCase();

    for (const label of lowerLabels) {
      if (cellText.includes(label) && cellText.length < label.length + 30) {
        const nextTd = $(cell).next("td, th");
        if (nextTd.length) {
          const val = nextTd.text().trim();
          if (val) return val;
        }

        const $row = $(cell).closest("tr");
        const cells = $row.find("td, th").toArray();
        const cellIndex = cells.indexOf(cell);
        if (cellIndex >= 0 && cellIndex < cells.length - 1) {
          const val = $(cells[cellIndex + 1]).text().trim();
          if (val) return val;
        }

        const nextRow = $row.next("tr");
        if (nextRow.length) {
          const nextCells = nextRow.find("td, th").toArray();
          if (nextCells.length === 1) {
            const val = $(nextCells[0]).text().trim();
            if (val) return val;
          }
        }
      }
    }
  }

  const allElements = $("span, div, p, strong, b, dt, dd, li").toArray();
  for (const el of allElements) {
    const elText = $(el).text().replace(/\s+/g, " ").trim().toLowerCase();

    for (const label of lowerLabels) {
      if (elText.includes(label) && elText.length < label.length + 30) {
        const next = $(el).next();
        if (next.length) {
          const val = next.text().trim();
          if (val) return val;
        }

        const parent = $(el).parent();
        const siblings = parent.children().toArray();
        const idx = siblings.indexOf(el);
        if (idx >= 0 && idx < siblings.length - 1) {
          const val = $(siblings[idx + 1]).text().trim();
          if (val) return val;
        }
      }
    }
  }

  return null;
}

function findValueByColon($: cheerio.CheerioAPI, labels: string[]): string | null {
  const lowerLabels = labels.map(l => l.toLowerCase());
  const bodyText = $("body").text();
  for (const label of lowerLabels) {
    const patterns = [
      new RegExp(`${label}\\s*[:;]\\s*(.+?)(?:\\n|$)`, "i"),
      new RegExp(`${label}\\s+(.+?)(?:\\n|$)`, "i"),
    ];
    for (const pattern of patterns) {
      const match = bodyText.match(pattern);
      if (match && match[1]) {
        const val = match[1].trim().substring(0, 100);
        if (val) return val;
      }
    }
  }
  return null;
}

function findAmountInHtml($: cheerio.CheerioAPI, labels: string[], currencySymbols: string[]): string | null {
  const adjacentValue = findValueInAdjacentCells($, labels);
  if (adjacentValue) {
    const amount = normalizeCurrency(adjacentValue);
    if (amount) return amount;
  }

  const lowerLabels = labels.map(l => l.toLowerCase());
  const allElements = $("td, th, span, div, p, strong, b, dt, dd, li").toArray();
  for (const el of allElements) {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    const lower = text.toLowerCase();

    for (const label of lowerLabels) {
      if (lower.includes(label)) {
        const amountMatch = text.match(/[R$£€]?\s*[\d,]+\.\d{2}/);
        if (amountMatch) {
          const amount = normalizeCurrency(amountMatch[0]);
          if (amount) return amount;
        }
        const zarMatch = text.match(/ZAR\s*[\d,]+\.\d{2}/i);
        if (zarMatch) {
          const amount = normalizeCurrency(zarMatch[0]);
          if (amount) return amount;
        }
      }
    }
  }

  const colonValue = findValueByColon($, labels);
  if (colonValue) {
    const amount = normalizeCurrency(colonValue);
    if (amount) return amount;
  }

  return null;
}

function findDateInHtml($: cheerio.CheerioAPI, labels: string[], subject: string): string | null {
  const adjacentValue = findValueInAdjacentCells($, labels);
  if (adjacentValue) {
    const date = normalizeDate(adjacentValue);
    if (date) return date;
  }

  const colonValue = findValueByColon($, labels);
  if (colonValue) {
    const date = normalizeDate(colonValue);
    if (date) return date;
  }

  const subjectDate = normalizeDate(subject);
  if (subjectDate) return subjectDate;

  const bodyText = $("body").text();
  const datePatterns = [
    /(\d{4}-\d{2}-\d{2})/,
    /(\d{2}\.\d{2}\.\d{4})/,
    /(\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4})/i,
    /((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4})/i,
  ];
  for (const pattern of datePatterns) {
    const match = bodyText.match(pattern);
    if (match) {
      const date = normalizeDate(match[1]);
      if (date) return date;
    }
  }

  return null;
}

function findOrderIdInHtml($: cheerio.CheerioAPI, labels: string[]): string | null {
  const adjacentValue = findValueInAdjacentCells($, labels);
  if (adjacentValue) {
    const cleaned = adjacentValue.replace(/\s+/g, "").substring(0, 50);
    if (cleaned && /[A-Z0-9-]{3,}/i.test(cleaned)) return cleaned;
  }

  const colonValue = findValueByColon($, labels);
  if (colonValue) {
    const cleaned = colonValue.replace(/\s+/g, "").substring(0, 50);
    if (cleaned && /[A-Z0-9-]{3,}/i.test(cleaned)) return cleaned;
  }

  return null;
}

function findStoreNameInHtml($: cheerio.CheerioAPI, labels: string[]): string | null {
  if (labels.length === 0) return null;

  const adjacentValue = findValueInAdjacentCells($, labels);
  if (adjacentValue && adjacentValue.length > 2 && adjacentValue.length < 100) {
    return adjacentValue;
  }

  const colonValue = findValueByColon($, labels);
  if (colonValue && colonValue.length > 2 && colonValue.length < 100) {
    return colonValue;
  }

  return null;
}

function calculateConfidence(fieldsMatched: string[]): number {
  let score = 0;
  if (fieldsMatched.includes("total")) score += 0.7;
  if (fieldsMatched.includes("date")) score += 0.1;
  if (fieldsMatched.includes("storeName")) score += 0.1;
  if (fieldsMatched.includes("orderId")) score += 0.05;
  if (fieldsMatched.includes("items")) score += 0.05;
  return Math.min(score, 1.0);
}

export function extractDeterministicFromHtml(
  vendor: string,
  rawHtml: string,
  subject: string
): HtmlExtractionResult | null {
  const config = VENDOR_CONFIGS[vendor];
  if (!config) {
    log(`[VENDOR_HTML_PARSE_FAILED] No HTML config for vendor="${vendor}"`, "inbound-email");
    return null;
  }

  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(rawHtml);
  } catch (err) {
    log(`[VENDOR_HTML_PARSE_FAILED] vendor="${vendor}" cheerio.load error: ${err}`, "inbound-email");
    return null;
  }

  const fieldsMatched: string[] = [];
  let storeName = config.name;
  let date: string | null = null;
  let orderId: string | undefined;

  if (config.customExtractor) {
    const custom = config.customExtractor($, subject);
    if (custom.storeName) {
      storeName = custom.storeName;
      fieldsMatched.push("storeName");
    }
    if (custom.date) {
      date = custom.date;
      fieldsMatched.push("date");
    }
    if (custom.orderId) {
      orderId = custom.orderId;
      fieldsMatched.push("orderId");
    }
    if (custom.total) {
      const total = normalizeCurrency(custom.total);
      if (total) {
        fieldsMatched.push("total");
        const confidence = calculateConfidence(fieldsMatched);
        log(`[VENDOR_HTML_PARSE_SUCCESS] vendor="${vendor}" total=${total} date=${date} store="${storeName}" confidence=${confidence} fields=[${fieldsMatched.join(",")}]`, "inbound-email");
        log(`[DETERMINISTIC_CONFIDENCE_SCORE] vendor="${vendor}" score=${confidence} fields=${fieldsMatched.length}`, "inbound-email");
        return { storeName, total, date: date || new Date().toISOString().substring(0, 10), currency: "ZAR", items: [], orderId, confidence, fieldsMatched };
      }
    }
  }

  const total = findAmountInHtml($, config.totalLabels, config.currencySymbols);
  if (!total) {
    log(`[VENDOR_HTML_PARSE_FAILED] vendor="${vendor}" could not find total in HTML. Labels tried: [${config.totalLabels.join(", ")}]`, "inbound-email");
    return null;
  }
  fieldsMatched.push("total");

  if (!date) {
    date = findDateInHtml($, config.dateLabels, subject);
    if (date) fieldsMatched.push("date");
  }

  if (!orderId) {
    orderId = findOrderIdInHtml($, config.orderIdLabels) || undefined;
    if (orderId) fieldsMatched.push("orderId");
  }

  if (!fieldsMatched.includes("storeName") && config.storeNameLabels.length > 0) {
    const foundStore = findStoreNameInHtml($, config.storeNameLabels);
    if (foundStore) {
      storeName = foundStore;
      fieldsMatched.push("storeName");
    }
  }

  const confidence = calculateConfidence(fieldsMatched);

  log(`[VENDOR_HTML_PARSE_SUCCESS] vendor="${vendor}" total=${total} date=${date} store="${storeName}" orderId=${orderId || "none"} confidence=${confidence} fields=[${fieldsMatched.join(",")}]`, "inbound-email");
  log(`[DETERMINISTIC_CONFIDENCE_SCORE] vendor="${vendor}" score=${confidence} fields=${fieldsMatched.length}`, "inbound-email");

  return {
    storeName,
    total,
    date: date || new Date().toISOString().substring(0, 10),
    currency: "ZAR",
    items: [],
    orderId,
    confidence,
    fieldsMatched,
  };
}

export function getSupportedVendors(): string[] {
  return Object.keys(VENDOR_CONFIGS);
}

export function isVendorSupported(vendor: string): boolean {
  return vendor in VENDOR_CONFIGS;
}
