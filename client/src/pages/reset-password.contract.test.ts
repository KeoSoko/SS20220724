import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const resetSource = readFileSync(new URL("./reset-password-page.tsx", import.meta.url), "utf8");
const authSource = readFileSync(new URL("./auth-page.tsx", import.meta.url), "utf8");

describe("password reset client contract", () => {
  it("shows requirements and validates matching passwords", () => {
    expect(resetSource).toContain("password: strongPasswordSchema");
    expect(resetSource).toContain("Passwords do not match");
    expect(resetSource).toContain("8–64 characters");
    expect(resetSource).toContain("At least one lowercase and one uppercase letter");
    expect(resetSource).toContain("At least one number and one special character");
  });

  it("clears stale authentication and returns to the explicit sign-in route", () => {
    expect(resetSource).toContain("setAuthToken(null)");
    expect(resetSource).toContain("authStore.clear()");
    expect(resetSource).toContain('queryClient.removeQueries({ queryKey: ["/api/user"] })');
    expect(resetSource).toContain('/auth?mode=signin&passwordReset=success');
    expect(authSource).toContain("Password updated. Welcome back—sign in with your new password.");
  });

  it("keeps the reset request same-origin and does not persist passwords", () => {
    expect(resetSource).toContain('fetch("/api/reset-password"');
    expect(resetSource).not.toContain("localStorage.setItem");
    expect(resetSource).not.toContain("redirect=");
  });
});