import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimLifecycleBatch, enrollLifecycleEligibility, processLifecycleBatch } from "./lifecycle-email-scheduler";

const originalEnv = { ...process.env };
const enable = (campaign = "LIFECYCLE_FIRST_SLIP_ENABLED") => {
  process.env.LIFECYCLE_EMAILS_ENABLED = "true";
  process.env[campaign] = "true";
};
const row = {
  id: "delivery-1", campaign_key: "first-slip-encouragement", campaign_version: 1,
  user_id: 10, attempt_count: 1,
};
const eligibleUser = {
  created_at: new Date("2026-09-09T00:00:00Z"), last_login: null,
  email_verified_at: null, is_email_verified: false, is_active: true, is_admin: false,
  email: "person@example.co.za", marketing_opted_out: false, marketing_unsubscribed: false,
  receipt_count: 0, first_receipt_at: null, third_receipt_at: null, last_receipt_at: null,
  report_completed_at: null, hard_suppressed: false,
};

beforeEach(() => {
  process.env = { ...originalEnv, NODE_ENV: "test" };
  for (const key of Object.keys(process.env)) if (key.startsWith("LIFECYCLE_")) delete process.env[key];
});
afterEach(() => { process.env = { ...originalEnv }; vi.restoreAllMocks(); });

describe("lifecycle scheduler safety", () => {
  it("performs zero database and sender calls while all flags are off", async () => {
    const query = vi.fn();
    const sender = vi.fn();
    expect(await enrollLifecycleEligibility({ query } as any)).toBe(0);
    expect(await claimLifecycleBatch({ query } as any)).toEqual([]);
    expect(await processLifecycleBatch(sender, { query } as any)).toEqual({ claimed: 0 });
    expect(query).not.toHaveBeenCalled();
    expect(sender).not.toHaveBeenCalled();
  });

  it("uses a bounded authoritative scan and idempotent enrollment", async () => {
    enable();
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ ...eligibleUser, id: 10, receipt_count: 0, meaningful_activity_at: eligibleUser.created_at, marketing_sends_7d: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    expect(await enrollLifecycleEligibility({ query } as any, new Date("2026-09-10T12:00:00Z"))).toBe(1);
    const scan = query.mock.calls[0][0] as string;
    const insert = query.mock.calls[1][0] as string;
    expect(scan).toContain("LEFT JOIN LATERAL");
    expect(scan).toContain("COUNT(DISTINCT r.id)");
    expect(scan).toContain("LIMIT 100");
    expect(scan).not.toContain("HAVING");
    expect(insert).toContain("ON CONFLICT (campaign_key,campaign_version,user_id) DO NOTHING");
  });

  it("claims with skip-locked fencing and quarantines stale in-flight sends", async () => {
    enable();
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [row], rowCount: 1 });
    expect(await claimLifecycleBatch({ query } as any, new Date("2026-09-10T12:00:00Z"))).toEqual([row]);
    expect(query.mock.calls[0][0]).toContain("status='uncertain'");
    expect(query.mock.calls[1][0]).toContain("FOR UPDATE SKIP LOCKED");
    expect(query.mock.calls[1][0]).toContain("status='claimed'");
  });

  async function run(result: "sent" | "transient" | "permanent" | "uncertain", user = eligibleUser, cap = 0, delivery = row) {
    enable();
    const statements: string[] = [];
    const query = vi.fn(async (sql: string) => {
      statements.push(sql);
      if (sql.includes("RETURNING id") && sql.includes("scheduler_runs")) return { rows: [{ id: "run-1" }], rowCount: 1 };
      if (sql.includes("status='uncertain'") && sql.includes("send_started_at <")) return { rows: [], rowCount: 0 };
      if (sql.includes("RETURNING d.*")) return { rows: [delivery], rowCount: 1 };
      if (sql.includes("SELECT u.created_at")) return { rows: [user], rowCount: 1 };
      if (sql.includes("COUNT(*)::int count")) return { rows: [{ count: cap }], rowCount: 1 };
      if (sql.includes("status='sending'") && sql.includes("RETURNING id")) return { rows: [{ id: delivery.id }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const sender = vi.fn().mockResolvedValue(result);
    await processLifecycleBatch(sender, { query } as any, new Date("2026-09-10T12:00:00Z"));
    return { sender, statements };
  }

  it.each([
    ["sent", "status='sent'"],
    ["transient", "status='retry'"],
    ["permanent", "error_code='delivery_permanent'"],
    ["uncertain", "status='uncertain'"],
  ] as const)("fences the %s delivery transition from sending", async (result, expected) => {
    const { sender, statements } = await run(result);
    expect(sender).toHaveBeenCalledOnce();
    expect(statements.some(sql => sql.includes(expected) && sql.includes("status='sending'"))).toBe(true);
  });

  it("suppresses at send time after verification or marketing opt-out", async () => {
    process.env.LIFECYCLE_FIRST_SLIP_ENABLED = undefined;
    enable("LIFECYCLE_VERIFICATION_REMINDER_ENABLED");
    const verified = { ...eligibleUser, is_email_verified: true, email_verified_at: new Date("2026-09-10T10:00:00Z") };
    const verificationDelivery = { ...row, campaign_key: "verification-reminder" };
    const { sender, statements } = await run("sent", verified, 0, verificationDelivery);
    expect(sender).not.toHaveBeenCalled();
    expect(statements.some(sql => sql.includes("ineligible_at_send"))).toBe(true);
  });

  it("enforces the rolling marketing cap immediately before sending", async () => {
    const { sender, statements } = await run("sent", eligibleUser, 2);
    expect(sender).not.toHaveBeenCalled();
    expect(statements.some(sql => sql.includes("ineligible_at_send"))).toBe(true);
  });

  it("defers claimed work during Johannesburg quiet hours", async () => {
    enable();
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("RETURNING id") && sql.includes("scheduler_runs")) return { rows: [{ id: "run-1" }], rowCount: 1 };
      if (sql.includes("RETURNING d.*")) return { rows: [row], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const sender = vi.fn();
    await processLifecycleBatch(sender, { query } as any, new Date("2026-09-10T19:00:00Z"));
    expect(sender).not.toHaveBeenCalled();
    expect(query.mock.calls.some(call => String(call[0]).includes("interval '1 hour'"))).toBe(true);
  });
});