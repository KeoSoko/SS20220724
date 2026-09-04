import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const home = readFileSync(new URL("./home-page.tsx", import.meta.url), "utf8");
const upload = readFileSync(new URL("./upload-receipt.tsx", import.meta.url), "utf8");

describe("first-slip activation UI contract", () => {
  it("offers one primary dashboard route and a session-only dismissal", () => {
    expect(home).toContain("Let’s scan your first slip.");
    expect(home).toContain("Photograph or upload a slip and Simple Slips will organise the important details.");
    expect(home).toContain('<Link href="/upload">');
    expect(home).toContain("Scan your first slip");
    expect(home).toContain("I’ll do this later");
    expect(home).toContain("sessionStorage.setItem(FIRST_SLIP_DISMISSED_KEY");
  });

  it("shows concise guidance without adding an email-verification gate", () => {
    expect(upload).toContain("Take a clear photo or choose an image.");
    expect(upload).toContain("Keep the full slip visible.");
    expect(upload).toContain("We’ll extract and organise the details.");
    expect(upload).not.toMatch(/emailVerified|isEmailVerified|verification.*gate/i);
  });

  it("uses the real saved id for accessible first-slip success actions", () => {
    expect(upload).toContain("return await res.json();");
    expect(upload).toContain("savedReceiptId: data?.id");
    expect(upload).toContain("Your first slip is organised.");
    expect(upload).toContain('role="status" aria-live="polite"');
    expect(upload).toContain('<Link href={`/receipt/${firstSaveReceiptId}`}>');
    expect(upload).toContain("Scan another");
    expect(upload).toContain("if (!isFirstOnlineSave)");
  });
});