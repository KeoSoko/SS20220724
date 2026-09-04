import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { strongPasswordSchema } from "../shared/schema";

const authSource = readFileSync(new URL("./auth.ts", import.meta.url), "utf8");
const billingSource = readFileSync(new URL("./billing-service.ts", import.meta.url), "utf8");
const verifyPageSource = readFileSync(
  new URL("../client/src/pages/verify-email-page.tsx", import.meta.url),
  "utf8",
);
const routesSource = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");

describe("registration integrity", () => {
  it("enforces the shared strong password policy", () => {
    expect(strongPasswordSchema.safeParse("Valid1!a").success).toBe(true);
    expect(strongPasswordSchema.safeParse("short1!").success).toBe(false);
    expect(strongPasswordSchema.safeParse("NOLOWERCASE1!").success).toBe(false);
    expect(strongPasswordSchema.safeParse("nouppercase1!").success).toBe(false);
    expect(strongPasswordSchema.safeParse("NoNumber!").success).toBe(false);
    expect(strongPasswordSchema.safeParse("NoSpecial1").success).toBe(false);
    expect(strongPasswordSchema.safeParse(`A1!${"a".repeat(62)}`).success).toBe(false);
  });

  it("normalizes identity and requires explicit legal consent", () => {
    expect(authSource).toContain('req.body.username.trim()');
    expect(authSource).toContain('req.body.email.trim().toLowerCase()');
    expect(authSource).toContain("strongPasswordSchema.safeParse(password)");
    expect(authSource).toContain('req.body.agreedToTerms !== true');
    expect(authSource).toContain('req.body.agreedToTaxDisclaimer !== true');
    expect(authSource).toContain('eventType: "registration_legal_acceptance"');
    expect(authSource).toContain('const REGISTRATION_LEGAL_VERSION = "2026-09-03"');
  });

  it("creates one authoritative registration trial and records it", () => {
    const registrationStart = authSource.indexOf('app.post("/api/register"');
    const registrationEnd = authSource.indexOf('app.post("/api/login"', registrationStart);
    const registration = authSource.slice(registrationStart, registrationEnd);

    expect(registration.match(/createUserSubscription\(/g)).toHaveLength(1);
    expect(registration).not.toContain("storage.startFreeTrial");
    expect(registration).toContain("await storage.updateUser(user.id, { trialEndDate })");
    expect(registration).toContain('eventType: "trial_started"');
    expect(registration).toContain("establishAuthenticatedSession(req, user, false)");
    expect(registration).toContain('"account_created_but_signin_required"');
    expect(registration.match(/storage\.createUser\(/g)).toHaveLength(1);
  });

  it("keeps Paystack checkout behind verified email", () => {
    expect(routesSource).toContain('app.post("/api/billing/paystack/checkout", requireVerifiedEmail');
  });

  it("keeps billing-service and late-verification trial expiries mirrored", () => {
    expect(billingSource).toContain("trialEndDate,");
    expect(billingSource).toContain(".update(users)");
    expect(authSource).toContain("trialEndDate: newTrialEndDate");
  });

  it("keeps invalid verification tokens visible and guides email sign-in", () => {
    expect(verifyPageSource).not.toContain("invalid or has expired') ||");
    expect(verifyPageSource).toContain("setVerificationStatus('error')");
    expect(verifyPageSource).toContain("email and password");
    expect(authSource).toContain("Repaired stale email verification metadata");
  });
});