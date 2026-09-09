import { describe, expect, it } from "vitest";
import {
  LIFECYCLE_ROLLOUT_BASELINE, eligible, canSend, escapeHtml, safeUsername,
  canonicalLink, isQuietHours, CAMPAIGN_REGISTRY,
  buildCopy, signUnsubscribeToken, verifyUnsubscribeToken,
} from "./lifecycle-emails";

const now = new Date("2026-09-10T12:00:00Z");
const facts = (extra: Record<string, unknown> = {}) => ({
  createdAt: new Date("2026-09-09T00:00:00Z"), receiptCount: 0, now, ...extra,
});

describe("lifecycle policy", () => {
  it("enforces the 24-hour first-slip rule and receipt milestones", () => {
    expect(eligible("first-slip-encouragement", facts())).toBe(true);
    expect(eligible("first-slip-encouragement", facts({ receiptCount: 1 }))).toBe(false);
    expect(eligible("core-activation", facts({ receiptCount: 3, thirdReceiptAt: new Date("2026-09-10T00:00:00Z") }))).toBe(true);
    expect(eligible("core-activation", facts({ receiptCount: 1 }))).toBe(false);
  });
  it("caps verification reminders and keeps transactional mail independent of opt out", () => {
    expect(eligible("verification-reminder", facts({ reminderCount: 2 }))).toBe(false);
    expect(eligible("verification-reminder", facts({ reminderCount: 0 }))).toBe(true);
    expect(canSend("verification-reminder", facts({ marketingOptedOut: true }))).toBe(true);
    expect(canSend("first-slip-encouragement", facts({ marketingOptedOut: true }))).toBe(false);
  });
  it("applies baseline, suppression, quiet hours and cap", () => {
    expect(eligible("first-slip-encouragement", facts({ now: new Date(LIFECYCLE_ROLLOUT_BASELINE.getTime() - 1) }))).toBe(false);
    expect(canSend("first-slip-encouragement", facts({ hardSuppressed: true }))).toBe(false);
    expect(canSend("first-slip-encouragement", facts(), true)).toBe(false);
    expect(canSend("first-slip-encouragement", facts(), false, 2)).toBe(false);
  });
  it("escapes names and only permits relative deep links", () => {
    expect(escapeHtml("<x>&")).toBe("&lt;x&gt;&amp;");
    expect(safeUsername("")).toBe("there");
    expect(canonicalLink("https://simpleslips.app/", "/evil")).toBe("https://simpleslips.app/home");
    expect(CAMPAIGN_REGISTRY.welcome.managedExternally).toBe(true);
  });
  it("recognises Johannesburg quiet hours deterministically", () => {
    expect(isQuietHours(new Date("2026-09-10T19:00:00Z"))).toBe(true);
    expect(isQuietHours(new Date("2026-09-10T08:00:00Z"))).toBe(false);
  });

  it("waits 48 hours for the summary prompt and suppresses it after a completed export", () => {
    const third = new Date("2026-09-09T11:00:00Z");
    expect(eligible("spending-summary", facts({ receiptCount: 3, thirdReceiptAt: third, now: new Date("2026-09-11T10:59:59Z") }))).toBe(false);
    expect(eligible("spending-summary", facts({ receiptCount: 3, thirdReceiptAt: third, now: new Date("2026-09-11T11:00:00Z") }))).toBe(true);
    expect(eligible("spending-summary", facts({ receiptCount: 3, thirdReceiptAt: third, reportOrExportCompletedAt: now }))).toBe(false);
  });

  it("requires 14 full days without meaningful activity for re-engagement", () => {
    expect(eligible("re-engagement", facts({ now: new Date("2026-09-23T00:00:00Z"), meaningfulActivityAt: new Date("2026-09-09T00:00:00Z") }))).toBe(true);
    expect(eligible("re-engagement", facts({ now: new Date("2026-09-23T00:00:00Z"), meaningfulActivityAt: new Date("2026-09-22T00:00:00Z") }))).toBe(false);
  });

  it("never schedules a duplicate welcome and rejects historical cohorts", () => {
    expect(eligible("welcome", facts())).toBe(false);
    expect(eligible("first-slip-encouragement", facts({ createdAt: new Date("2026-09-08T23:59:59Z") }))).toBe(false);
  });

  it("builds escaped, canonical, recognisably Simple Slips copy", () => {
    const copy = buildCopy("first-slip-encouragement", "<Thandi>", "https://simpleslips.app");
    expect(copy.html).toContain("&lt;Thandi&gt;");
    expect(copy.html).toContain("https://simpleslips.app/receipts");
    expect(copy.text).toContain("paperwork from becoming a mission");
    expect(copy.preheader).toBeTruthy();
  });

  it("round-trips opaque unsubscribe tokens and rejects tampering", () => {
    const token = signUnsubscribeToken(42);
    expect(token).not.toContain("42");
    expect(verifyUnsubscribeToken(token)).toBe(42);
    expect(verifyUnsubscribeToken(`${token}x`)).toBeNull();
  });
});