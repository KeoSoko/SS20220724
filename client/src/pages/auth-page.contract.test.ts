import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./auth-page.tsx", import.meta.url), "utf8");

describe("Simple Slips sign-up onboarding contract", () => {
  it("keeps the approved conversational copy and four-step structure", () => {
    expect(source).toContain("What can I call you?");
    expect(source).toContain("Let’s start with the name you’d like to see inside Simple Slips.");
    expect(source).toContain("Where can we reach you?");
    expect(source).toContain("We’ll use this for important account and receipt updates.");
    expect(source).toContain(">Let’s secure your account</h2>");
    expect(source).toContain(">One last thing</h2>");
    expect(source).toContain("Step {registerStep} of 4");
    expect(source).toContain("Create My Account");
  });

  it("validates one step at a time and prevents early submission", () => {
    expect(source).toContain("registerForm.trigger(fields)");
    expect(source).toContain("if (registerStep < 4)");
    expect(source).toContain("event.preventDefault()");
    expect(source).toContain('name="password"');
    expect(source).toContain('name="confirmPassword"');
  });

  it("preserves registration step navigation and prevents duplicate requests", () => {
    expect(source).toContain("setRegisterStep((step) => Math.max(1, step - 1))");
    expect(source).toContain("registrationSubmitStarted.current");
    expect(source).toContain("registerMutation.isPending");
    expect(source).toContain("await registerMutation.mutateAsync");
  });

  it("preserves legal wording and removes the mandatory second sign-in", () => {
    expect(source).toContain("I agree to the");
    expect(source).toContain("terms and conditions");
    expect(source).toContain("Simple Slips is not a registered tax practitioner");
    expect(source).toContain("setLocation(getRedirectUrl())");
    expect(source).not.toContain("Continue to Sign In");
  });

  it("keeps a clear welcome, returning-user action, and new-user hierarchy", () => {
    expect(source).toContain('useState(() => getModeFromLocation(getBrowserLocation()))');
    expect(source).toContain("Let’s get your slips organised");
    expect(source).toContain("Already use Simple Slips?");
    expect(source).toContain("Sign in to your account");
    expect(source).toContain("New to Simple Slips? Let’s get started.");
    expect(source.indexOf("Sign in to your account")).toBeLessThan(source.indexOf("New to Simple Slips? Let’s get started."));
    expect(source.indexOf("New to Simple Slips? Let’s get started.")).toBeLessThan(source.indexOf("What can I call you?"));
    expect(source).toContain("New to Simple Slips?");
    expect(source).toContain("Get started");
    expect(source).not.toContain("Already have an account?");
    expect(source).not.toContain("<Tabs");
  });

  it("uses explicit modes as precedence and preserves unrelated parameters", () => {
    expect(source).toContain("getAuthModeFromLocation(value, readReturningUserMarker(localStorage))");
    expect(source).toContain('params.set("mode", "signin")');
    expect(source).toContain('params.set("mode", "register")');
    expect(source).toContain('params.delete("tab")');
    expect(source).toContain("setLocation(`${pathname || \"/auth\"}${query ? `?${query}` : \"\"}`)");
    expect(source).toContain("getCanonicalAuthLocation(browserLocation)");
    expect(source).toContain('window.history.replaceState(window.history.state, "", canonicalLocation)');
    expect(source).toContain("setActiveTabState(getModeFromLocation(canonicalLocation || browserLocation))");
    expect(source).toContain('window.addEventListener("popstate", syncModeFromBrowserHistory)');
    expect(source).toContain('window.removeEventListener("popstate", syncModeFromBrowserHistory)');
    expect(source).not.toContain('setActiveTab("login")');
  });

  it("stores only a privacy-safe returning-browser boolean after successful authentication", () => {
    expect(source).toContain("await loginMutation.mutateAsync(data);");
    expect(source).not.toMatch(/localStorage\.(setItem|getItem)\([^)]*(email|username|password|token)/i);
  });

  it("gives shared-browser new users an explicit registration escape route", () => {
    expect(source).toContain("New to Simple Slips?");
    expect(source).toMatch(/>\s*Get started\s*</);
    expect(source).toContain('onClick={() => setAuthMode("register")}');
    expect(source).toContain('params.set("mode", "register")');
  });

  it("removes the ambiguous page-level Back control while keeping auth-mode switching", () => {
    expect(source).not.toContain("ArrowLeft");
    expect(source).not.toContain('onClick={() => setLocation("/")}');
    expect(source).toContain("Sign in to your account");
    expect(source).toMatch(/>\s*Get started\s*</);
  });
});