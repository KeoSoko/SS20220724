import { log } from "./vite";

export interface VendorDetectionResult {
  vendor: string | null;
  confidence: number;
}

interface VendorPattern {
  name: string;
  senderDomains: RegExp[];
  subjectPatterns: RegExp[];
  bodyPhrases: string[];
}

const VENDOR_PATTERNS: VendorPattern[] = [
  {
    name: "Uber Eats",
    senderDomains: [/uber\.com$/i, /ubereats\.com$/i],
    subjectPatterns: [/uber\s*eats/i, /your.*order.*uber/i],
    bodyPhrases: ["uber eats", "uber technologies", "ubereats"],
  },
  {
    name: "Amazon",
    senderDomains: [/amazon\.(com|co\.za|co\.uk|de|fr)$/i],
    subjectPatterns: [/amazon.*order/i, /your amazon/i, /amazon.*delivery/i],
    bodyPhrases: ["amazon.com", "amazon.co.za", "amazon order"],
  },
  {
    name: "Pick n Pay",
    senderDomains: [/pnp\.co\.za$/i, /picknpay\.co\.za$/i],
    subjectPatterns: [/pick\s*n\s*pay/i, /pnp/i],
    bodyPhrases: ["pick n pay", "picknpay", "pnp"],
  },
  {
    name: "Takealot",
    senderDomains: [/takealot\.com$/i],
    subjectPatterns: [/takealot/i, /takealot.*order/i],
    bodyPhrases: ["takealot.com", "takealot"],
  },
  {
    name: "Checkers",
    senderDomains: [/checkers\.co\.za$/i, /shoprite\.co\.za$/i],
    subjectPatterns: [/checkers/i, /checkers sixty60/i],
    bodyPhrases: ["checkers", "checkers sixty60", "shoprite checkers"],
  },
];

function extractSenderDomain(from: string): string {
  const emailMatch = from.match(/<([^>]+)>/) || from.match(/[\w.+-]+@[\w.-]+/);
  const email = emailMatch ? emailMatch[1] || emailMatch[0] : from;
  const parts = email.split("@");
  return parts.length > 1 ? parts[1].toLowerCase() : "";
}

export function detectVendor(params: {
  subject?: string;
  from?: string;
  rawHtml?: string;
  rawText?: string;
}): VendorDetectionResult {
  const { subject = "", from = "", rawText = "", rawHtml = "" } = params;
  const senderDomain = extractSenderDomain(from);
  const subjectLower = subject.toLowerCase();
  const bodyLower = (rawText || rawHtml || "").toLowerCase().substring(0, 5000);

  for (const vendor of VENDOR_PATTERNS) {
    let score = 0;

    for (const domainPattern of vendor.senderDomains) {
      if (domainPattern.test(senderDomain)) {
        score += 0.5;
        break;
      }
    }

    for (const subjectPattern of vendor.subjectPatterns) {
      if (subjectPattern.test(subjectLower)) {
        score += 0.3;
        break;
      }
    }

    for (const phrase of vendor.bodyPhrases) {
      if (bodyLower.includes(phrase.toLowerCase())) {
        score += 0.2;
        break;
      }
    }

    if (score >= 0.5) {
      const confidence = Math.min(score, 1.0);
      log(`[VENDOR_DETECTED] vendor="${vendor.name}" confidence=${confidence} domain="${senderDomain}" subject="${subject.substring(0, 60)}"`, "inbound-email");
      return { vendor: vendor.name, confidence };
    }
  }

  log(`[VENDOR_DETECTED] vendor=null domain="${senderDomain}" subject="${subject.substring(0, 60)}"`, "inbound-email");
  return { vendor: null, confidence: 0 };
}
