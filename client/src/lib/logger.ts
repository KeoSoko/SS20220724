type ClientLogLevel = "debug" | "info" | "warn" | "error";

const WEIGHT: Record<ClientLogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const envLevel = (): ClientLogLevel => {
  const configured = (import.meta.env.VITE_LOG_LEVEL || "").toLowerCase() as ClientLogLevel;
  if (configured in WEIGHT) return configured;
  return import.meta.env.PROD ? "info" : "debug";
};

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const TOKEN_REGEX = /\b(bearer\s+)?[a-z0-9_-]{20,}\.[a-z0-9_-]{10,}(?:\.[a-z0-9_-]{10,})?\b/gi;

const redact = (value: unknown): unknown => {
  if (typeof value === "string") {
    return value.replace(EMAIL_REGEX, "[REDACTED_EMAIL]").replace(TOKEN_REGEX, "[REDACTED_TOKEN]");
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [k, v]) => {
      const kNorm = k.toLowerCase();
      if (["email", "token", "authorization", "rawtext", "rawhtml", "ocr", "reference"].some((s) => kNorm.includes(s))) {
        acc[k] = `[REDACTED_${k.toUpperCase()}]`;
      } else {
        acc[k] = redact(v);
      }
      return acc;
    }, {});
  }
  return value;
};

export function createClientLogger(scope: string) {
  const write = (level: ClientLogLevel, message: string, ...meta: unknown[]) => {
    if (WEIGHT[level] < WEIGHT[envLevel()]) return;
    const method = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    method(`[${scope}] [${level.toUpperCase()}] ${redact(message)}`, ...meta.map(redact));
  };

  return {
    debug: (message: string, ...meta: unknown[]) => write("debug", message, ...meta),
    info: (message: string, ...meta: unknown[]) => write("info", message, ...meta),
    warn: (message: string, ...meta: unknown[]) => write("warn", message, ...meta),
    error: (message: string, ...meta: unknown[]) => write("error", message, ...meta),
  };
}
