import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("billing operations dashboard", () => {
  it("is admin-only and read-only", () => {
    const source = readFileSync(new URL("./admin-routes.ts", import.meta.url), "utf8");
    const start = source.indexOf('app.get("/api/admin/command-center/billing-operations"');
    const end = source.indexOf("// ========================================", start);
    const route = source.slice(start, end);
    expect(route).toContain("requireAdmin");
    expect(route).toContain("capabilities: { readOnly: true, settlement: false, cancellation: false");
    expect(route).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    expect(route).not.toMatch(/subscription\.(disable|create|enable)|transaction\.charge/);
  });

  it("shows the dedicated admin page and keeps technical identities behind details", () => {
    const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
    const page = readFileSync(new URL("../client/src/pages/billing-operations.tsx", import.meta.url), "utf8");
    expect(app).toContain('path="/command-center/billing"');
    expect(app.indexOf('path="/command-center/billing"')).toBeLessThan(app.indexOf('path="/command-center"'));
    expect(page).toContain("Read-only safety mode");
    expect(page).toContain("View technical details");
    expect(page).not.toContain("apiRequest(");
  });
});
