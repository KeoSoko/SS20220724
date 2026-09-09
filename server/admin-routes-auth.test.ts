import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("./storage", () => ({ storage: {} }));
vi.mock("./db", () => ({ db: {}, pool: { query: vi.fn() } }));
vi.mock("./billing-service", () => ({ billingService: {} }));
vi.mock("./email-service", () => ({ emailService: {} }));
vi.mock("./export-service", () => ({ exportService: {} }));
vi.mock("./vite", () => ({ log: vi.fn() }));
vi.mock("openai", () => ({ default: class OpenAI {} }));

import { growthDashboard, registerAdminRoutes, requireAdmin } from "./admin-routes";
import { pool } from "./db";

function response() {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

describe("admin authorization for manual identity repair", () => {
  it("returns aggregate-only lifecycle status to an admin route", async () => {
    const routes = new Map<string, any[]>();
    const register = vi.fn((path: string, ...handlers: any[]) => routes.set(path, handlers));
    const app = { get: register, post: register, put: register, patch: register, delete: register } as any;
    registerAdminRoutes(app);
    const handlers = routes.get("/api/admin/lifecycle-email/status");
    expect(handlers?.[0]).toBe(requireAdmin);

    vi.mocked(pool.query)
      .mockResolvedValueOnce({ rows: [
        { campaign_key: "first-slip-encouragement", status: "eligible", count: "3" },
        { campaign_key: "first-slip-encouragement", status: "sent", count: "2" },
      ] } as any)
      .mockResolvedValueOnce({ rows: [{ started_at: new Date("2026-09-09T10:00:00Z"), completed_at: new Date("2026-09-09T10:01:00Z") }] } as any)
      .mockResolvedValueOnce({ rows: [{ due_at: new Date("2026-09-10T08:00:00Z") }] } as any);
    const res = response();
    await handlers[1]({}, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      meta: expect.objectContaining({ masterEnabled: false, timezone: "Africa/Johannesburg" }),
      campaigns: expect.arrayContaining([
        expect.objectContaining({ key: "first-slip-encouragement", eligible: 3, sent: 2, enabled: false }),
      ]),
    }));
  });

  it("allows an admin through the shared boundary and returns aggregate growth data", async () => {
    const res = response();
    const next = vi.fn();
    requireAdmin({ user: { id: 1, isAdmin: true } } as any, res, next);
    expect(next).toHaveBeenCalledOnce();

    vi.mocked(pool.query)
      .mockResolvedValueOnce({
        rows: [{
          signups: "4", first7: "2", third7: "1", verified: "3", paid: "1", paid_active: "1",
          paid_0: "0", paid_1_2: "0", paid_3plus: "1", segment_0: "1", segment_1_2: "1", segment_3plus: "2",
          d1: "2", d7: "1", d30: "0", d1_den: "4", d7_den: "3", d30_den: "1",
          median_first_receipt_hours: "12",
        }],
      } as any)
      .mockResolvedValueOnce({ rows: [] } as any);

    await growthDashboard({
      query: { from: "2026-09-08", to: "2026-09-08", timezone: "Africa/Johannesburg", cohort: "all" },
    } as any, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      meta: expect.objectContaining({ baselineDate: "2026-09-08", incomplete: false }),
      summary: expect.objectContaining({
        firstReceiptWithin7Days: expect.objectContaining({ value: 50, numerator: 2, denominator: 4 }),
      }),
    }));
  });

  it("rejects a normal authenticated user", () => {
    const res = response();
    const next = vi.fn();

    requireAdmin({ user: { id: 12, isAdmin: false } } as any, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Forbidden - Admin access required" });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", () => {
    const res = response();
    const next = vi.fn();

    requireAdmin({ user: undefined } as any, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("keeps the preview and execute endpoints behind admin middleware and explicit confirmation", () => {
    const source = readFileSync(new URL("./admin-routes.ts", import.meta.url), "utf8");

    expect(source).toContain(
      'app.post("/api/admin/users/:userId/paystack-manual-identity-repair/preview", requireAdmin',
    );
    expect(source).toContain(
      'app.post("/api/admin/users/:userId/paystack-manual-identity-repair/execute", requireAdmin',
    );
    expect(source).toContain("req.body?.confirmed !== true");
    expect(source).toContain("paystackRequest: \"none\"");
  });

  it("keeps lifecycle status and synthetic preview admin-only with no send endpoint", () => {
    const source = readFileSync(new URL("./admin-routes.ts", import.meta.url), "utf8");
    expect(source).toContain('app.get("/api/admin/lifecycle-email/status", requireAdmin');
    expect(source).toContain('app.post("/api/admin/lifecycle-email/preview", requireAdmin');
    expect(source).not.toContain('app.post("/api/admin/lifecycle-email/test-send"');
    expect(source).toContain("Synthetic preview only");
  });

  it("uses the shared Paystack billing-owner lock for local repair execution", () => {
    const billingServiceSource = readFileSync(new URL("./billing-service.ts", import.meta.url), "utf8");

    expect(billingServiceSource).toContain(
      "pg_advisory_xact_lock(${billingOwnerUserId}, 36)",
    );
  });
});