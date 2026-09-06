import { pool } from "./db";
import { log } from "./vite";

export const GROWTH_EVENT_NAMES = [
  "signup_completed",
  "first_receipt_saved",
  "third_receipt_saved",
  "categories_reviewed",
  "spending_summary_viewed",
  "business_hub_viewed",
  "business_profile_completed",
  "first_report_created",
  "first_report_exported",
  "first_quote_or_invoice_created",
  "subscription_started",
  "activation_journey_dismissed",
] as const;

export type GrowthEventName = typeof GROWTH_EVENT_NAMES[number];
export const isGrowthEventName = (value: unknown): value is GrowthEventName =>
  typeof value === "string" && (GROWTH_EVENT_NAMES as readonly string[]).includes(value);

// Browser requests can only represent user-interface observations/actions.
// Completion milestones remain server-owned even though they share the internal
// event vocabulary above.
export const CLIENT_GROWTH_EVENT_NAMES = [
  "activation_journey_dismissed",
  "spending_summary_viewed",
] as const;
export type ClientGrowthEventName = typeof CLIENT_GROWTH_EVENT_NAMES[number];
export const isClientGrowthEventName = (value: unknown): value is ClientGrowthEventName =>
  typeof value === "string" && (CLIENT_GROWTH_EVENT_NAMES as readonly string[]).includes(value);

type EventData = Record<string, unknown> | undefined;
type GrowthEventQuery = {
  query: (text: string, values: unknown[]) => Promise<{ rowCount: number | null }>;
};

export function receiptMilestoneNames(receiptCount: number): GrowthEventName[] {
  const milestones: GrowthEventName[] = [];
  if (receiptCount >= 1) milestones.push("first_receipt_saved");
  if (receiptCount >= 3) milestones.push("third_receipt_saved");
  return milestones;
}

/** Writes only a first occurrence. Callers should use recordBestEffort for UX paths. */
export async function recordGrowthEvent(
  userId: number,
  eventName: GrowthEventName,
  eventData?: EventData,
  occurredAt = new Date(),
): Promise<boolean> {
  return recordGrowthEventWithQuery(pool, userId, eventName, eventData, occurredAt);
}

/** Injectable query boundary keeps first-occurrence semantics testable without a database. */
export async function recordGrowthEventWithQuery(
  queryable: GrowthEventQuery,
  userId: number,
  eventName: GrowthEventName,
  eventData?: EventData,
  occurredAt = new Date(),
): Promise<boolean> {
  const result = await queryable.query(
    `INSERT INTO growth_events (user_id, event_name, occurred_at, event_data)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (user_id, event_name) DO NOTHING
     RETURNING id`,
    [userId, eventName, occurredAt, eventData ? JSON.stringify(eventData) : null],
  );
  return result.rowCount === 1;
}

/** Removes only the current user's reversible activation-guide dismissal. */
export async function restoreActivationJourney(userId: number): Promise<boolean> {
  return restoreActivationJourneyWithQuery(pool, userId);
}

/** Injectable query boundary keeps restore isolation and idempotency testable without a database. */
export async function restoreActivationJourneyWithQuery(
  queryable: GrowthEventQuery,
  userId: number,
): Promise<boolean> {
  const result = await queryable.query(
    `DELETE FROM growth_events
     WHERE user_id = $1 AND event_name = 'activation_journey_dismissed'
     RETURNING id`,
    [userId],
  );
  return result.rowCount === 1;
}

export function recordGrowthEventBestEffort(
  userId: number,
  eventName: GrowthEventName,
  eventData?: EventData,
): void {
  recordGrowthEvent(userId, eventName, eventData).catch((error) =>
    log(`Growth event ${eventName} was not recorded for user ${userId}: ${error}`, "growth"),
  );
}

export async function recordReceiptMilestones(userId: number): Promise<void> {
  const result = await pool.query<{ receipt_count: string; first_receipt_at: Date | null; third_receipt_at: Date | null }>(
    `SELECT COUNT(*)::text AS receipt_count, MIN(created_at) AS first_receipt_at,
     (ARRAY_AGG(created_at ORDER BY created_at))[3] AS third_receipt_at
     FROM receipts WHERE user_id = $1`,
    [userId],
  );
  const milestones = result.rows[0];
  const names = receiptMilestoneNames(Number(milestones?.receipt_count ?? 0));
  if (names.includes("first_receipt_saved") && milestones?.first_receipt_at) {
    await recordGrowthEvent(userId, "first_receipt_saved", undefined, milestones.first_receipt_at);
  }
  if (names.includes("third_receipt_saved") && milestones?.third_receipt_at) {
    await recordGrowthEvent(userId, "third_receipt_saved", undefined, milestones.third_receipt_at);
  }
}

export function buildActivationResponse(
  events: Array<{ event_name: GrowthEventName; occurred_at: Date }>,
  receiptInfo: { receipt_count: string; first_receipt_at: Date | null; third_receipt_at: Date | null } | undefined,
  userInfo: { created_at: Date } | undefined,
  profileInfo: { created_at: Date | null; updated_at: Date | null } | undefined,
  documentInfo: { created_at: Date | null } | undefined,
  exportInfo: { created_at: Date | null; completed_at: Date | null } | undefined,
) {
  const timestamps: Partial<Record<GrowthEventName, string>> = {};
  for (const row of events) timestamps[row.event_name] = row.occurred_at.toISOString();
  const addDerived = (name: GrowthEventName, value: Date | null | undefined) => {
    if (!timestamps[name] && value) timestamps[name] = value.toISOString();
  };
  addDerived("signup_completed", userInfo?.created_at);
  addDerived("first_receipt_saved", receiptInfo?.first_receipt_at);
  addDerived("third_receipt_saved", receiptInfo?.third_receipt_at);
  addDerived("business_profile_completed", profileInfo?.updated_at || profileInfo?.created_at);
  addDerived("first_quote_or_invoice_created", documentInfo?.created_at);
  addDerived("first_report_created", exportInfo?.created_at);
  addDerived("first_report_exported", exportInfo?.completed_at);
  return {
    receiptCount: Number(receiptInfo?.receipt_count ?? 0),
    timestamps,
    dismissed: Boolean(timestamps.activation_journey_dismissed),
  };
}

export async function getActivation(userId: number) {
  const [events, receiptInfo, userInfo, profileInfo, documentInfo, exportInfo] = await Promise.all([
    pool.query<{ event_name: GrowthEventName; occurred_at: Date }>(
      "SELECT event_name, occurred_at FROM growth_events WHERE user_id = $1", [userId]),
    pool.query<{ receipt_count: string; first_receipt_at: Date | null; third_receipt_at: Date | null }>(
      `SELECT COUNT(*)::text AS receipt_count, MIN(created_at) AS first_receipt_at,
       (ARRAY_AGG(created_at ORDER BY created_at))[3] AS third_receipt_at
       FROM receipts WHERE user_id = $1`, [userId]),
    pool.query<{ created_at: Date }>("SELECT created_at FROM users WHERE id = $1", [userId]),
    pool.query<{ created_at: Date | null; updated_at: Date | null }>(
      "SELECT created_at, updated_at FROM business_profiles WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1", [userId]),
    pool.query<{ created_at: Date | null }>(
      `SELECT MIN(created_at) AS created_at FROM (
        SELECT created_at FROM quotations WHERE user_id = $1
        UNION ALL SELECT created_at FROM invoices WHERE user_id = $1
      ) documents`, [userId]),
    pool.query<{ created_at: Date | null; completed_at: Date | null }>(
      `SELECT MIN(created_at) AS created_at,
       MIN(completed_at) FILTER (WHERE status = 'completed') AS completed_at
       FROM export_jobs WHERE user_id = $1`, [userId])
      .catch(() => ({ rows: [] as { created_at: Date | null; completed_at: Date | null }[] })), // older schemas may predate export jobs
  ]);
  return buildActivationResponse(
    events.rows, receiptInfo.rows[0], userInfo.rows[0], profileInfo.rows[0],
    documentInfo.rows[0], exportInfo.rows[0],
  );
}