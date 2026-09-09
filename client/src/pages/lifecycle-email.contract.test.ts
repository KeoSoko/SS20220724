import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./lifecycle-email.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const commandCenter = readFileSync(new URL("./command-center.tsx", import.meta.url), "utf8");

describe("lifecycle email admin UI contract", () => {
  it("keeps the page behind the admin route and links it from Command Centre", () => {
    expect(app).toContain('path="/command-center/lifecycle"');
    expect(app).toContain("component={LifecycleEmailPage}");
    expect(commandCenter).toContain('href="/command-center/lifecycle"');
    expect(page).toContain('"/api/admin/lifecycle-email/status"');
  });

  it("renders aggregate-only operations without customer identifiers", () => {
    expect(page).toContain("aggregate-only");
    expect(page.toLowerCase()).toContain("no customer details");
    expect(page).not.toMatch(/\b(customer|user)(Name|Email|Id)\b/i);
  });

  it("keeps sending controls disabled and previews synthetic data", () => {
    expect(page).toContain(">DISABLED</Badge>");
    expect(page).toContain(">OFF</Badge>");
    expect(page).toContain('disabled title="Test sends are unavailable');
    expect(page).toContain('"/api/admin/lifecycle-email/preview"');
    expect(page).toContain("syntheticDataNotice");
  });

  it("contains dense content on narrow screens", () => {
    expect(page).toContain("overflow-x-hidden");
    expect(page).toContain("overflow-x-auto");
    expect(page).toContain("min-w-[930px]");
    expect(page).toContain("sm:");
  });
});