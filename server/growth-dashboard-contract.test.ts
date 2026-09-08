import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adminSource = readFileSync("server/admin-routes.ts", "utf8");
const authSource = readFileSync("server/auth.ts", "utf8");
const clientSource = readFileSync("client/src/pages/growth-dashboard.tsx", "utf8");

describe("growth dashboard contracts", () => {
  it("protects the aggregate endpoint with the shared admin boundary", () => {
    expect(adminSource).toContain('app.get("/api/admin/growth-dashboard", requireAdmin, growthDashboard)');
    expect(adminSource).toContain('return res.status(401).json({ error: "Unauthorized" })');
    expect(adminSource).toContain('return res.status(403).json({ error: "Forbidden - Admin access required" })');
  });

  it("keeps registration attachment opaque and server-owned", () => {
    expect(authSource).toContain("isAttributionVisitorId(attributionVisitorId)");
    expect(authSource).toContain("attachAttributionVisitor(attributionVisitorId, user.id)");
    expect(authSource).not.toContain("req.body.firstTouch");
    expect(authSource).not.toContain("req.body.latestTouch");
  });

  it("renders numerator/denominator evidence, incompleteness, filters, and mobile breakpoints", () => {
    expect(clientSource).toContain("ratioText");
    expect(clientSource).toContain("data.meta.incomplete");
    expect(clientSource).toContain('option value="attributed"');
    expect(clientSource).toContain("sm:grid-cols-3");
    expect(clientSource).toContain("overflow-x-auto");
  });

  it("does not expose user identity fields or add CSV export", () => {
    expect(clientSource).not.toMatch(/\buserEmail\b/);
    expect(clientSource).not.toMatch(/\busername\b/);
    expect(clientSource).not.toMatch(/\bfullName\b/);
    expect(clientSource).not.toContain(".csv");
  });
});