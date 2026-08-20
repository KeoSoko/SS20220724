import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("./storage", () => ({ storage: {} }));
vi.mock("./db", () => ({ db: {}, pool: {} }));
vi.mock("./billing-service", () => ({ billingService: {} }));
vi.mock("./email-service", () => ({ emailService: {} }));
vi.mock("./export-service", () => ({ exportService: {} }));
vi.mock("./vite", () => ({ log: vi.fn() }));
vi.mock("openai", () => ({ default: class OpenAI {} }));

import { requireAdmin } from "./admin-routes";

function response() {
  const res: any = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

describe("admin authorization for manual identity repair", () => {
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

  it("uses the shared Paystack billing-owner lock for local repair execution", () => {
    const billingServiceSource = readFileSync(new URL("./billing-service.ts", import.meta.url), "utf8");

    expect(billingServiceSource).toContain(
      "pg_advisory_xact_lock(${billingOwnerUserId}, 36)",
    );
  });
});