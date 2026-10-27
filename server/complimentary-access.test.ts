import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn(), owner: vi.fn() }));
vi.mock("./db", () => ({ pool: { query: mocks.query, connect: async () => ({ query: mocks.query, release: mocks.release }) } }));
vi.mock("./billing-owner", () => ({ resolveBillingOwner: mocks.owner }));
vi.mock("./storage", () => ({ storage: { getUserSubscription: async () => ({ id: 354, status: "paused", planId: 1, nextBillingDate: new Date("2026-09-15Z") }), getSubscriptionPlan: async () => ({ maxSeats: 1 }) } }));
import { complimentaryExpiry, grantComplimentaryAccess, validateComplimentaryInput } from "./complimentary-access";
import { getSubscriptionStatus, getEffectiveSubscriptionStatus } from "./subscription-middleware";
const body = () => ({ subscriptionId: 354, expiresAt: new Date(Date.now() + 86400000).toISOString(), reason: "Goodwill access following payment difficulties", confirmed: true });
beforeEach(() => { vi.clearAllMocks(); mocks.owner.mockResolvedValue({ state: "resolved", canManageBilling: true, billingOwnerUserId: 385 }); mocks.query.mockResolvedValue({ rows: [] }); });
describe("audited complimentary access", () => {
  it("rejects expired, excessive, unconfirmed and unaudited requests", () => {
    for (const change of [{ confirmed: false }, { reason: "short" }, { expiresAt: "invalid" }, { expiresAt: new Date(Date.now() - 1).toISOString() }, { expiresAt: new Date(Date.now() + 91 * 86400000).toISOString() }]) expect(() => validateComplimentaryInput({ ...body(), ...change })).toThrow();
  });
  it("only inserts an audited access grant, never updates billing or payments", async () => {
    mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.includes("SELECT s.id") ? [{ id: 354 }] : [] }));
    expect((await grantComplimentaryAccess(385, body(), 1)).outcome).toBe("complimentary_access_granted");
    const sql = mocks.query.mock.calls.map(call => call[0]).join("\n");
    expect(sql).toContain("pg_advisory_xact_lock"); expect(sql).toContain("INSERT INTO billing_events"); expect(sql).toContain("COMMIT");
    expect(sql).not.toMatch(/UPDATE (users|user_subscriptions)|INSERT INTO payment_transactions/);
    expect(mocks.release).toHaveBeenCalled();
  });
  it("rejects member accounts before opening a transaction", async () => {
    mocks.owner.mockResolvedValue({ state: "resolved", canManageBilling: false, billingOwnerUserId: 100 });
    await expect(grantComplimentaryAccess(385, body(), 1)).rejects.toThrow("billing_owner_required"); expect(mocks.query).not.toHaveBeenCalled();
  });
  it("rolls back grants for a mismatched or nonpaused account", async () => {
    await expect(grantComplimentaryAccess(385, body(), 1)).rejects.toThrow(); expect(mocks.query).toHaveBeenCalledWith("ROLLBACK");
  });
  it("expires without writes and ignores invalid dates", async () => {
    for (const expiry of ["invalid", new Date(Date.now() - 1).toISOString()]) { mocks.query.mockResolvedValue({ rows: [{ expiry }] }); expect(await complimentaryExpiry(385, 354)).toBeNull(); }
  });
  it("grants paused accounts premium access without claiming payment or trial", async () => {
    const expiry = body().expiresAt; mocks.query.mockResolvedValue({ rows: [{ expiry }] });
    expect(await getSubscriptionStatus(385)).toMatchObject({ hasActiveSubscription: true, isInTrial: false, subscriptionType: "premium", complimentaryExpiresAt: expiry, paymentRecoveryRecommended: true });
  });
  it("fails closed when the grant lookup is unavailable", async () => {
    mocks.query.mockRejectedValue(new Error("unavailable")); expect((await getSubscriptionStatus(385)).hasActiveSubscription).toBe(false);
  });
  it("workspace members inherit the owner's grant", async () => {
    mocks.owner.mockResolvedValue({ state: "resolved", canManageBilling: false, billingOwnerUserId: 385, workspaceId: 1 });
    mocks.query.mockResolvedValue({ rows: [{ expiry: body().expiresAt }] });
    expect((await getEffectiveSubscriptionStatus(400)).hasActiveSubscription).toBe(true);
    expect(mocks.query.mock.calls[0][1][0]).toBe(385);
  });
});
