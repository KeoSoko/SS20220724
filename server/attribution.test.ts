import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ pool: { query: vi.fn() } }));

import { attachAttributionVisitor, isAttributionVisitorId, recordAttributionVisit, sanitizeAttributionTouch, shouldIgnoreAttributionRequest } from "./attribution";
import { pool } from "./db";

describe("attribution input boundary", () => {
  it("persists only the exact allowlist and strips URL components", () => {
    expect(sanitizeAttributionTouch({
      utm_source: " newsletter ",
      referrerHost: "https://Example.COM/private?token=nope",
      landingPath: "/pricing?coupon=nope#section",
      unexpected: "must not be stored",
    })).toEqual({
      utm_source: "newsletter",
      referrerHost: "example.com",
      landingPath: "/pricing",
      channel: "attributed",
    });
  });

  it("classifies direct and unknown consistently and validates UUIDs", () => {
    expect(sanitizeAttributionTouch({})).toEqual({ channel: "direct" });
    expect(sanitizeAttributionTouch({ referrerHost: "partner.example" }).channel).toBe("unknown");
    expect(isAttributionVisitorId("8b9c0d1e-1234-4abc-8def-123456789abc")).toBe(true);
    expect(isAttributionVisitorId("not-a-uuid")).toBe(false);
  });

  it("reliably excludes authenticated admins and known crawlers", () => {
    expect(shouldIgnoreAttributionRequest({ user: { isAdmin: true } as any, headers: {} })).toBe(true);
    expect(shouldIgnoreAttributionRequest({ user: undefined, headers: { "user-agent": "Googlebot/2.1" } })).toBe(true);
    expect(shouldIgnoreAttributionRequest({ user: undefined, headers: { "user-agent": "Mozilla/5.0" } })).toBe(false);
  });

  it("only permits latest-touch mutation for a new qualifying session", async () => {
    vi.mocked(pool.query).mockResolvedValueOnce({ rowCount: 1 } as any);
    await recordAttributionVisit("8b9c0d1e-1234-4abc-8def-123456789abc", { channel: "direct" });
    expect(vi.mocked(pool.query).mock.calls[0][0]).toContain("$4 AND attribution_visitors.latest_seen_at");
    expect(vi.mocked(pool.query).mock.calls[0][1]?.[3]).toBe(false);
    vi.mocked(pool.query).mockClear();
    vi.mocked(pool.query).mockResolvedValueOnce({ rowCount: 1 } as any);
    await recordAttributionVisit("8b9c0d1e-1234-4abc-8def-123456789abc", { channel: "attributed", utm_source: "x" });
    expect(vi.mocked(pool.query).mock.calls[0][1]?.[3]).toBe(true);
  });

  it("uses an expiry-guarded, idempotent attachment update", async () => {
    vi.mocked(pool.query).mockClear();
    vi.mocked(pool.query).mockResolvedValueOnce({ rowCount: 0 } as any);
    expect(await attachAttributionVisitor("8b9c0d1e-1234-4abc-8def-123456789abc", 7)).toBe(false);
    const sql = String(vi.mocked(pool.query).mock.calls[0][0]);
    expect(sql).toContain("user_id IS NULL");
    expect(sql).toContain("INTERVAL '90 days'");
  });
});