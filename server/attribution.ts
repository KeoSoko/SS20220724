import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { pool } from "./db";

export const ATTRIBUTION_FIELDS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "referrerHost", "landingPath", "gclid", "fbclid", "ttclid",
] as const;
export type AttributionTouch = Partial<Record<typeof ATTRIBUTION_FIELDS[number], string>> & {
  channel: "direct" | "unknown" | "attributed";
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_VALUE = 160;
const KNOWN_BOT_USER_AGENT = /(bot|crawler|spider|slurp|headlesschrome|lighthouse)/i;

export const isAttributionVisitorId = (value: unknown): value is string =>
  typeof value === "string" && UUID.test(value);

export function shouldIgnoreAttributionRequest(req: Pick<Request, "user" | "headers">) {
  return req.user?.isAdmin === true || KNOWN_BOT_USER_AGENT.test(String(req.headers["user-agent"] || ""));
}

function bounded(value: unknown, max = MAX_VALUE): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = value.trim().replace(/[\u0000-\u001f\u007f<>"'`\\]/g, "");
  return clean ? clean.slice(0, max) : undefined;
}

export function sanitizeAttributionTouch(input: unknown): AttributionTouch {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const touch: Record<string, string> = {};
  for (const field of ATTRIBUTION_FIELDS) {
    let value: string | undefined;
    if (field === "referrerHost") {
      const raw = bounded(source[field]);
      if (raw) try { value = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.toLowerCase().slice(0, 253); } catch { /* reject */ }
    } else if (field === "landingPath") {
      const raw = bounded(source[field], 512);
      if (raw) try { value = new URL(raw, "https://local.invalid").pathname.slice(0, 512); } catch { /* reject */ }
    } else value = bounded(source[field]);
    if (value) touch[field] = value;
  }
  const attributed = ["utm_source", "gclid", "fbclid", "ttclid"].some((key) => Boolean(touch[key]));
  return { ...touch, channel: attributed ? "attributed" : touch.referrerHost ? "unknown" : "direct" };
}

/** Upserts a visit without allowing the client to pick any stored columns. */
export async function recordAttributionVisit(visitorId: string, touch: AttributionTouch, now = new Date()) {
  const qualifying = touch.channel !== "direct";
  return pool.query(
    `INSERT INTO attribution_visitors
       (visitor_id, first_touch, latest_touch, first_seen_at, latest_seen_at, session_started_at)
     VALUES ($1, $2::jsonb, $2::jsonb, $3, $3, $3)
     ON CONFLICT (visitor_id) DO UPDATE SET
       latest_touch = CASE WHEN $4 AND attribution_visitors.latest_seen_at <= $3 - INTERVAL '30 minutes'
                           THEN EXCLUDED.latest_touch ELSE attribution_visitors.latest_touch END,
       latest_seen_at = CASE WHEN $4 AND attribution_visitors.latest_seen_at <= $3 - INTERVAL '30 minutes'
                             THEN $3 ELSE attribution_visitors.latest_seen_at END,
       session_started_at = CASE WHEN $4 AND attribution_visitors.latest_seen_at <= $3 - INTERVAL '30 minutes'
                                 THEN $3 ELSE attribution_visitors.session_started_at END
     RETURNING visitor_id`,
    [visitorId, JSON.stringify(touch), now, qualifying],
  );
}

/** Conditional update makes attachment idempotent and prevents a reused ID moving users. */
export async function attachAttributionVisitor(visitorId: string, userId: number, now = new Date()): Promise<boolean> {
  if (!isAttributionVisitorId(visitorId)) return false;
  const result = await pool.query(
    `UPDATE attribution_visitors SET user_id = $2
       WHERE visitor_id = $1 AND user_id IS NULL
         AND first_seen_at >= $3 - INTERVAL '90 days'
     RETURNING visitor_id`,
    [visitorId, userId, now],
  );
  return result.rowCount === 1;
}

export function registerAttributionRoutes(app: Express) {
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });
  app.post("/api/attribution/visit", limiter, async (req: Request, res: Response) => {
    try {
      if (shouldIgnoreAttributionRequest(req)) return res.status(204).end();
      const visitorId = req.body?.attributionVisitorId;
      if (!isAttributionVisitorId(visitorId)) return res.status(400).json({ error: "Invalid attributionVisitorId" });
      await recordAttributionVisit(visitorId, sanitizeAttributionTouch(req.body?.touch));
      return res.status(204).end();
    } catch {
      return res.status(500).json({ error: "Unable to record attribution visit" });
    }
  });
}