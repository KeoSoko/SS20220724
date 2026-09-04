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

  it("preserves the form architecture for Back and prevents duplicate requests", () => {
    expect(source).toContain("setRegisterStep((step) => Math.max(1, step - 1))");
    expect(source).toContain("registrationSubmitStarted.current");
    expect(source).toContain("registerMutation.isPending");
    expect(source).toContain("await registerMutation.mutateAsync");
  });

  it("preserves legal wording and the verification-first success message", () => {
    expect(source).toContain("I agree to the");
    expect(source).toContain("terms and conditions");
    expect(source).toContain("Simple Slips is not a registered tax practitioner");
    expect(source).toContain("Your 30-day Simple Slips trial is ready.");
    expect(source).toContain("Please verify your email before subscribing or making a payment.");
    expect(source).toContain("Continue to Sign In");
  });

  it("defaults to registration and makes sign-in a secondary, reversible choice", () => {
    expect(source).toContain('useState(() => getModeFromLocation(getBrowserLocation()))');
    expect(source).toContain('return params.get("mode") === "signin"');
    expect(source).toContain("Let’s get your slips organised");
    expect(source).toContain("Already have an account?");
    expect(source).toContain("New to Simple Slips?");
    expect(source).toContain("Get started");
  });

  it("uses a stable sign-in query mode without dropping unrelated parameters", () => {
    expect(source).toContain('params.set("mode", "signin")');
    expect(source).toContain('params.delete("tab")');
    expect(source).toContain("setLocation(`${pathname || \"/auth\"}${query ? `?${query}` : \"\"}`)");
    expect(source).toContain("setActiveTabState(getModeFromLocation(getBrowserLocation()))");
    expect(source).toContain('window.addEventListener("popstate", syncModeFromBrowserHistory)');
    expect(source).toContain('window.removeEventListener("popstate", syncModeFromBrowserHistory)');
    expect(source).not.toContain('setActiveTab("login")');
  });
});