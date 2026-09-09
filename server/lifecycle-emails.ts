import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { resolvePublicAppOrigin } from "./public-app-origin.js";
/** Pure lifecycle policy and copy.  Database and mail are intentionally absent. */
export const LIFECYCLE_ROLLOUT_BASELINE = new Date("2026-09-09T00:00:00.000Z");
export const LIFECYCLE_MASTER_FLAG = "LIFECYCLE_EMAILS_ENABLED";
export const LIFECYCLE_CAMPAIGNS = [
  "welcome", "first-slip-encouragement", "core-activation",
  "verification-reminder", "spending-summary", "re-engagement",
] as const;
export type LifecycleCampaign = typeof LIFECYCLE_CAMPAIGNS[number];
export type LifecycleKind = "marketing" | "transactional";

export const CAMPAIGN_REGISTRY: Record<LifecycleCampaign, {
  version: number; kind: LifecycleKind; envFlag: string; templateEnv: string; managedExternally?: boolean;
  name: string; trigger: string; delay: string; definition: string; path: string;
}> = {
  welcome: { version: 1, kind: "transactional", envFlag: "LIFECYCLE_WELCOME_ENABLED", templateEnv: "LIFECYCLE_WELCOME_TEMPLATE_ID", managedExternally: true, name: "Welcome", trigger: "Existing verified-account welcome", delay: "Existing transactional path", definition: "Observed only. The established post-verification welcome remains the sole sender, preventing duplicate welcomes.", path: "/home" },
  "first-slip-encouragement": { version: 1, kind: "marketing", envFlag: "LIFECYCLE_FIRST_SLIP_ENABLED", templateEnv: "LIFECYCLE_FIRST_SLIP_TEMPLATE_ID", name: "First-slip encouragement", trigger: "No persisted receipts", delay: "24 hours after signup", definition: "One message for baseline-enrolled users who still have zero receipts after 24 hours.", path: "/receipts" },
  "core-activation": { version: 1, kind: "marketing", envFlag: "LIFECYCLE_CORE_ACTIVATION_ENABLED", templateEnv: "LIFECYCLE_CORE_ACTIVATION_TEMPLATE_ID", name: "Core activation congratulations", trigger: "Third persisted receipt", delay: "Next eligible daytime run", definition: "One congratulations message after the authoritative third persisted receipt.", path: "/receipts" },
  "verification-reminder": { version: 1, kind: "transactional", envFlag: "LIFECYCLE_VERIFICATION_REMINDER_ENABLED", templateEnv: "LIFECYCLE_VERIFICATION_REMINDER_TEMPLATE_ID", name: "Verification reminder", trigger: "Account remains unverified", delay: "24 hours after signup", definition: "One account-access reminder using the existing secure verification-token mechanism. Marketing opt-out does not block it.", path: "/settings" },
  "spending-summary": { version: 1, kind: "marketing", envFlag: "LIFECYCLE_SPENDING_SUMMARY_ENABLED", templateEnv: "LIFECYCLE_SPENDING_SUMMARY_TEMPLATE_ID", name: "Spending-summary prompt", trigger: "Three receipts and no completed report/export", delay: "48 hours after third receipt", definition: "One prompt after core activation when no authoritative report or export has completed.", path: "/reports" },
  "re-engagement": { version: 1, kind: "marketing", envFlag: "LIFECYCLE_REENGAGEMENT_ENABLED", templateEnv: "LIFECYCLE_REENGAGEMENT_TEMPLATE_ID", name: "Re-engagement", trigger: "No meaningful server-owned activity", delay: "14 days inactive", definition: "One re-engagement message after 14 days without login, receipt, or completed export activity.", path: "/home" },
};

export const flagOn = (name: string, env = process.env): boolean =>
  env[name]?.toLowerCase() === "true" && env[LIFECYCLE_MASTER_FLAG]?.toLowerCase() === "true";
export const campaignOn = (campaign: LifecycleCampaign, env = process.env) =>
  flagOn(CAMPAIGN_REGISTRY[campaign].envFlag, env);

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
export const safeUsername = (username: unknown): string => {
  const value = typeof username === "string" ? username.trim() : "";
  return value ? escapeHtml(value.slice(0, 80)) : "there";
};

const ALLOWED_PATHS = new Set(["/home", "/receipts", "/reports", "/settings"]);
export function canonicalLink(origin: string, path: string): string {
  const base = origin.replace(/\/+$/, "");
  const clean = path.split("?")[0];
  return `${base}${ALLOWED_PATHS.has(clean) ? clean : "/home"}`;
}

export type LifecycleFacts = {
  createdAt: Date; verifiedAt?: Date | null; firstReceiptAt?: Date | null;
  thirdReceiptAt?: Date | null; receiptCount: number; lastActivityAt?: Date | null;
  reportOrExportCompletedAt?: Date | null; meaningfulActivityAt?: Date | null;
  now: Date; reminderCount?: number; lastReminderAt?: Date | null;
  marketingOptedOut?: boolean; hardSuppressed?: boolean; welcomeAlreadySent?: boolean;
};
const hours = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3600000;

export function eligible(campaign: LifecycleCampaign, f: LifecycleFacts): boolean {
  if (f.createdAt < LIFECYCLE_ROLLOUT_BASELINE || f.now < LIFECYCLE_ROLLOUT_BASELINE || f.hardSuppressed) return false;
  if (campaign === "welcome") return false; // Existing post-verification sender owns welcome.
  if (campaign === "first-slip-encouragement") return f.receiptCount === 0 && hours(f.createdAt, f.now) >= 24;
  if (campaign === "core-activation") return !!f.thirdReceiptAt && f.receiptCount >= 3;
  if (campaign === "verification-reminder") {
    return !f.verifiedAt && hours(f.createdAt, f.now) >= 24 &&
      (f.reminderCount ?? 0) < 1;
  }
  if (campaign === "spending-summary") {
    return !!f.thirdReceiptAt && f.receiptCount >= 3 &&
      !f.reportOrExportCompletedAt && hours(f.thirdReceiptAt, f.now) >= 48;
  }
  const activity = f.meaningfulActivityAt ?? f.lastActivityAt ?? f.createdAt;
  return hours(activity, f.now) >= 14 * 24;
}

export function canSend(campaign: LifecycleCampaign, f: LifecycleFacts, quietHours = false, marketingSendsLast7Days = 0): boolean {
  if (!eligible(campaign, f) || quietHours) return false;
  if (CAMPAIGN_REGISTRY[campaign].kind === "marketing" &&
      (f.marketingOptedOut || marketingSendsLast7Days >= 2)) return false;
  return true;
}

export function buildCopy(campaign: LifecycleCampaign, username: unknown, origin: string) {
  const name = safeUsername(username);
  const link = canonicalLink(origin, CAMPAIGN_REGISTRY[campaign].path);
  const content: Record<LifecycleCampaign, { subject: string; preheader: string; body: string; cta: string }> = {
    welcome: { subject: "Welcome to Simple Slips", preheader: "Your account is ready.", body: "Welcome aboard. Your slips now have a tidy home.", cta: "Open Simple Slips" },
    "first-slip-encouragement": { subject: "Ready to save your first slip?", preheader: "One quick upload gets you started.", body: "Snap or upload your first slip and keep the paperwork from becoming a mission.", cta: "Save my first slip" },
    "core-activation": { subject: "Sharp — three slips saved", preheader: "You’re building a useful spending record.", body: "Nice one. Three slips are safely saved, and your spending picture is taking shape.", cta: "View my slips" },
    "verification-reminder": { subject: "Please verify your Simple Slips email", preheader: "Secure your account with one quick check.", body: "Please verify your email so we know this account belongs to you.", cta: "Verify my email" },
    "spending-summary": { subject: "Your spending story is taking shape", preheader: "Turn those saved slips into a useful summary.", body: "You’ve done the capturing. Now see what your saved slips say about your spending.", cta: "View my reports" },
    "re-engagement": { subject: "Your slips are still here when you need them", preheader: "Pick up where you left off.", body: "Life gets busy. Your saved slips are ready when you are — no stress.", cta: "Continue in Simple Slips" },
  };
  const item = content[campaign];
  return {
    subject: item.subject,
    preheader: item.preheader,
    text: `Hi ${name},\n\n${item.body}\n\n${item.cta}: ${link}\n\nSimple Slips`,
    html: `<p>Hi ${name},</p><p>${item.body}</p><p><a href="${escapeHtml(link)}">${item.cta}</a></p><p>Simple Slips</p>`,
  };
}

export const isQuietHours = (date: Date): boolean => {
  const hour = Number(new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", hour: "2-digit", hourCycle: "h23" }).format(date));
  return hour >= 20 || hour < 8;
};
export const retryDelayMs = (attempt: number): number => Math.min(24 * 3600000, 15 * 60000 * 2 ** Math.max(0, attempt - 1));

const tokenSecret = () => {
  const value = process.env.LIFECYCLE_UNSUBSCRIBE_SECRET || process.env.SESSION_SECRET || (process.env.NODE_ENV === "test" ? "test-only-secret" : "");
  if (!value) throw new Error("LIFECYCLE_UNSUBSCRIBE_SECRET is required");
  return value;
};
export function signUnsubscribeToken(userId: number): string {
  const key = createHash("sha256").update(tokenSecret()).digest();
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({ userId, exp: Date.now() + 90 * 86400000 })), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}
export function verifyUnsubscribeToken(token: string): number | null {
  try {
    const [ivRaw, tagRaw, bodyRaw] = token.split(".");
    if (!ivRaw || !tagRaw || !bodyRaw) return null;
    const decodeCanonical = (raw: string) => {
      if (!/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error("invalid token encoding");
      const decoded = Buffer.from(raw, "base64url");
      if (decoded.toString("base64url") !== raw) throw new Error("non-canonical token encoding");
      return decoded;
    };
    const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(tokenSecret()).digest(), decodeCanonical(ivRaw));
    decipher.setAuthTag(decodeCanonical(tagRaw));
    const payload = JSON.parse(Buffer.concat([decipher.update(decodeCanonical(bodyRaw)), decipher.final()]).toString());
    return Number.isInteger(payload.userId) && payload.userId > 0 && payload.exp > Date.now() ? payload.userId : null;
  } catch { return null; }
}
export const unsubscribeUrl = (userId: number): string =>
  `${resolvePublicAppOrigin()}/api/lifecycle-email/unsubscribe?token=${encodeURIComponent(signUnsubscribeToken(userId))}`;