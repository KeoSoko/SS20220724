export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const getMinLevel = (): LogLevel => {
  const configured = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
  if (configured && configured in LOG_LEVEL_WEIGHT) {
    return configured;
  }

  return process.env.NODE_ENV === "production" ? "info" : "debug";
};

const SENSITIVE_KEYS = new Set([
  "email",
  "to",
  "from",
  "token",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "password",
  "apikey",
  "api_key",
  "secret",
  "rawtext",
  "rawhtml",
  "ocrtext",
  "ocrcontent",
  "content",
  "body",
  "billingreference",
  "billingref",
  "paymentreference",
  "transactionreference",
  "reference",
]);

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const TOKEN_REGEX = /\b(bearer\s+)?[a-z0-9_-]{20,}\.[a-z0-9_-]{10,}(?:\.[a-z0-9_-]{10,})?\b/gi;
const BILLING_REF_REGEX = /\b(?:paystack|billing|transaction|payment)[-_ ]?(?:ref|reference)?[:= ]?[A-Z0-9_-]{6,}\b/gi;

function redactString(value: string): string {
  return value
    .replace(EMAIL_REGEX, "[REDACTED_EMAIL]")
    .replace(TOKEN_REGEX, "[REDACTED_TOKEN]")
    .replace(BILLING_REF_REGEX, "[REDACTED_BILLING_REF]");
}

function redactValue(value: unknown, keyHint = ""): unknown {
  if (value == null) return value;

  const normalizedKey = keyHint.toLowerCase().replace(/[^a-z]/g, "");
  if (SENSITIVE_KEYS.has(normalizedKey)) {
    return `[REDACTED_${normalizedKey || "FIELD"}]`;
  }

  if (typeof value === "string") {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [k, v]) => {
      acc[k] = redactValue(v, k);
      return acc;
    }, {});
  }

  return value;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_WEIGHT[level] >= LOG_LEVEL_WEIGHT[getMinLevel()];
}

function write(level: LogLevel, source: string, message: string, meta: unknown[]) {
  if (!shouldLog(level)) return;

  const ts = new Date().toISOString();
  const sanitized = [redactString(message), ...meta.map((entry) => redactValue(entry))];
  const prefix = `${ts} [${source}] [${level.toUpperCase()}]`;

  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(prefix, ...sanitized);
}

export function createServerLogger(source: string) {
  return {
    debug: (message: string, ...meta: unknown[]) => write("debug", source, message, meta),
    info: (message: string, ...meta: unknown[]) => write("info", source, message, meta),
    warn: (message: string, ...meta: unknown[]) => write("warn", source, message, meta),
    error: (message: string, ...meta: unknown[]) => write("error", source, message, meta),
  };
}

export function log(message: string, source = "server", level: LogLevel = "info") {
  write(level, source, message, []);
}
