import { describe, expect, it, vi } from "vitest";
import {
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