import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const home = readFileSync(new URL("./home-page.tsx", import.meta.url), "utf8");
const upload = readFileSync(new URL("./upload-receipt.tsx", import.meta.url), "utf8");
const activationCard = readFileSync(new URL("../components/activation-card.tsx", import.meta.url), "utf8");
const activationJourney = readFileSync(new URL("../utils/activation-journey.ts", import.meta.url), "utf8");

describe("activation journey UI contract", () => {
  it("mounts the server-driven, dismissible activation card on Home", () => {
    expect(home).toContain('<ActivationCard />');
    expect(activationCard).toContain('"/api/growth/activation"');
    expect(activationCard).toContain("activation_journey_dismissed");
    expect(activationCard).toContain("Continue setup");
    expect(activationCard).toContain("Hide setup guide");
    expect(activationCard).toContain("Open one of your saved slips and confirm its category to continue.");
    expect(activationCard).toContain('localStorage');
    expect(readFileSync(new URL("./profile-page.tsx", import.meta.url), "utf8")).toContain('"/api/growth/activation/restore"');
    expect(activationJourney).toContain("Save first slip");
    expect(activationCard).toContain('<Link href={action.href}');
    expect(activationCard).not.toContain("spending_summary_viewed");
    expect(readFileSync(new URL("./analytics-page.tsx", import.meta.url), "utf8")).toContain("spending_summary_viewed");
  });

  it("keeps receipt guidance and success actions free of an email-verification gate", () => {
    expect(upload).toContain("Take a clear photo or choose an image.");
    expect(upload).toContain("Keep the full slip visible.");
    expect(upload).not.toMatch(/emailVerified|isEmailVerified|verification.*gate/i);
  });

  it("uses the shared semantic brand treatment rather than the retired earthy palette", () => {
    expect(activationCard).toContain("border-border");
    expect(activationCard).toContain("bg-card");
    expect(activationCard).toContain("text-card-foreground");
    expect(activationCard).toContain("text-muted-foreground");
    expect(activationCard).toContain("text-primary");
    expect(activationCard).toContain("bg-primary/10");
    expect(activationCard).toContain("<Progress");
    expect(activationCard).toContain("activation-primary-cta");
    expect(activationCard).toContain("flex-col items-stretch");
    expect(activationCard).toContain("sm:flex-row");
    expect(activationCard).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(activationCard).not.toMatch(/amber-|sky-|violet-|brown|cream|earthy/i);
  });

  it("scrolls the visible success state and preserves both next actions", () => {
    expect(upload).toContain("Your first slip is organised.");
    expect(upload).toContain('role="status" aria-live="polite"');
    expect(upload).toContain('<Link href={`/receipt/${firstSaveReceiptId}`}>');
    expect(upload).toContain("Scan another");
    expect(upload).toContain("scrollIntoView");
  });
});