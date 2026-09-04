import { describe, expect, it, vi } from "vitest";
import {
  getCanonicalAuthLocation,
  getAuthModeFromLocation,
  readReturningUserMarker,
  RETURNING_USER_KEY,
  writeReturningUserMarker,
} from "./auth-mode";

describe("auth mode and returning-browser preference", () => {
  it("defaults new browsers to registration and returning browsers to sign-in", () => {
    expect(getAuthModeFromLocation("/auth", false)).toBe("register");
    expect(getAuthModeFromLocation("/auth", true)).toBe("login");
    expect(getAuthModeFromLocation("/auth?redirect=%2Freceipts", true)).toBe("login");
  });

  it("gives explicit modes precedence over the browser marker", () => {
    expect(getAuthModeFromLocation("/auth?mode=signin", false)).toBe("login");
    expect(getAuthModeFromLocation("/auth?mode=register", true)).toBe("register");
    expect(getAuthModeFromLocation("/auth?mode=register&redirect=%2Freceipts", true)).toBe("register");
    expect(getAuthModeFromLocation("/auth?mode=signin&tab=register", false)).toBe("login");
    expect(getAuthModeFromLocation("/auth?mode=register&tab=login", true)).toBe("register");
  });

  it("supports and canonicalizes legacy tabs without losing redirects", () => {
    expect(getAuthModeFromLocation("/auth?tab=login", false)).toBe("login");
    expect(getAuthModeFromLocation("/auth?tab=register", true)).toBe("register");
    expect(getCanonicalAuthLocation("/auth?tab=login")).toBe("/auth?mode=signin");
    expect(getCanonicalAuthLocation("/auth?redirect=%2Freceipts&tab=register")).toBe(
      "/auth?redirect=%2Freceipts&mode=register",
    );
    expect(getCanonicalAuthLocation("/auth?mode=register&tab=login&reason=legacy")).toBe(
      "/auth?mode=register&reason=legacy",
    );
    expect(getCanonicalAuthLocation("/auth?mode=signin&tab=register&redirect=%2Fhome")).toBe(
      "/auth?mode=signin&redirect=%2Fhome",
    );
    expect(getCanonicalAuthLocation("/auth?mode=signin")).toBeNull();
  });

  it("stores and reads only the privacy-safe boolean marker", () => {
    const setItem = vi.fn();
    writeReturningUserMarker({ setItem });
    expect(setItem).toHaveBeenCalledOnce();
    expect(setItem).toHaveBeenCalledWith(RETURNING_USER_KEY, "true");

    expect(readReturningUserMarker({ getItem: () => "true" })).toBe(true);
    expect(readReturningUserMarker({ getItem: () => null })).toBe(false);
  });
});