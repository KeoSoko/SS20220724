const STORAGE_KEY = "ss_attribution_v1";
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const UTM_FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
const CLICK_FIELDS = ["gclid", "fbclid", "ttclid"] as const;
const MAX_VALUE_LENGTH = 160;

type SafeTouch = Partial<Record<(typeof UTM_FIELDS)[number] | (typeof CLICK_FIELDS)[number], string>> & {
  referrerHost?: string;
  landingPath: string;
};

type StoredAttribution = {
  visitorId: string;
  createdAt: number;
  touch: SafeTouch;
};

const isPrivacyOptOutEnabled = () => {
  const privacyNavigator = navigator as Navigator & { globalPrivacyControl?: boolean };
  const privacyWindow = window as Window & { doNotTrack?: string };
  return privacyNavigator.globalPrivacyControl === true
    || navigator.doNotTrack === "1"
    || privacyWindow.doNotTrack === "1";
};

const bounded = (value: string | null) => {
  if (!value) return undefined;
  const clean = value.trim().replace(/[\u0000-\u001f\u007f<>"'`\\]/g, "");
  return clean ? clean.slice(0, MAX_VALUE_LENGTH) : undefined;
};

export function buildSafeAttributionTouch(
  location: Pick<Location, "search" | "pathname" | "hostname"> = window.location,
  referrer = document.referrer,
): SafeTouch {
  const params = new URLSearchParams(location.search);
  const touch: SafeTouch = { landingPath: location.pathname.slice(0, 512) || "/" };
  for (const key of [...UTM_FIELDS, ...CLICK_FIELDS]) {
    const value = bounded(params.get(key));
    if (value) touch[key] = value;
  }
  if (referrer) {
    try {
      const host = new URL(referrer).hostname.toLowerCase().slice(0, 253);
      if (host && host !== location.hostname.toLowerCase()) touch.referrerHost = host;
    } catch {
      // Invalid referrers are ignored rather than persisted.
    }
  }
  return touch;
}

function createVisitorId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readOrCreateAttribution(): StoredAttribution | null {
  if (isPrivacyOptOutEnabled()) {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as StoredAttribution | null;
    if (parsed?.visitorId && Number.isFinite(parsed.createdAt) && Date.now() - parsed.createdAt < RETENTION_MS) {
      return { ...parsed, touch: buildSafeAttributionTouch() };
    }
  } catch {
    // Corrupt first-party state is replaced below.
  }
  const created = { visitorId: createVisitorId(), createdAt: Date.now(), touch: buildSafeAttributionTouch() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(created));
  return created;
}

async function postAttribution(record: StoredAttribution | null): Promise<string | null> {
  if (!record) return null;
  try {
    const response = await fetch("/api/attribution/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attributionVisitorId: record.visitorId, touch: record.touch }),
      credentials: "same-origin",
      keepalive: true,
    });
    return response.ok ? record.visitorId : null;
  } catch {
    return null;
  }
}

let capturePromise: Promise<string | null> | null = null;

export function initializeAttributionCapture() {
  const record = readOrCreateAttribution();
  capturePromise = postAttribution(record);
  return capturePromise;
}

export async function getAttributionVisitorIdForRegistration() {
  if (!capturePromise) initializeAttributionCapture();
  return capturePromise;
}