import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adminRoutes = readFileSync(new URL("./admin-routes.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../client/src/pages/receipt-image-health.tsx", import.meta.url), "utf8");

describe("receipt image health admin queue contract", () => {
  it("is admin-protected and read-only", () => {
    expect(adminRoutes).toContain('app.get("/api/admin/command-center/receipt-image-health", requireAdmin');
    expect(adminRoutes).not.toContain('app.post("/api/admin/command-center/receipt-image-health"');
    expect(adminRoutes).toContain("providerObjectExistenceChecked: false");
  });

  it("does not load full embedded image payloads into the scanner response", () => {
    expect(adminRoutes).toContain("imageDataPrefix:");
    expect(adminRoutes).not.toContain("imageData: receipts.imageData");
  });

  it("states the metadata-only limitation in the admin interface", () => {
    expect(page).toContain("Metadata-only scan");
    expect(page).toContain("does not contact or change Azure storage");
  });
});
