import { describe, expect, it } from "vitest";
import {
  buildPublicAppUrl,
  PRODUCTION_PUBLIC_ORIGIN,
  resolvePublicAppOrigin,
} from "./public-app-origin";

describe("resolvePublicAppOrigin", () => {
  it("uses the externally reachable Replit development domain", () => {
    const origin = resolvePublicAppOrigin({
      NODE_ENV: "development",
      REPLIT_DEV_DOMAIN: "example-workspace.replit.dev",
      APP_URL: PRODUCTION_PUBLIC_ORIGIN,
    });

    expect(origin).toBe("https://example-workspace.replit.dev");
    expect(origin).not.toBe(PRODUCTION_PUBLIC_ORIGIN);
  });

  it("uses the first Replit domain when REPLIT_DEV_DOMAIN is unavailable", () => {
    expect(resolvePublicAppOrigin({
      REPLIT_DOMAINS: "first.replit.dev, second.replit.dev",
    })).toBe("https://first.replit.dev");
  });

  it("always uses the canonical production origin in production", () => {
    expect(resolvePublicAppOrigin({
      NODE_ENV: "production",
      REPLIT_DEV_DOMAIN: "development.replit.dev",
      APP_URL: "https://incorrect.example",
    })).toBe("https://simpleslips.app");
  });

  it.each([
    ["missing configuration", {}],
    ["malformed Replit domain", { REPLIT_DEV_DOMAIN: "https://example.replit.dev/path" }],
    ["production Replit domain in development", { REPLIT_DEV_DOMAIN: "simpleslips.app" }],
    ["production APP_URL in development", { APP_URL: PRODUCTION_PUBLIC_ORIGIN }],
    ["insecure production APP_URL in development", { APP_URL: "http://simpleslips.app" }],
    ["non-HTTP APP_URL", { APP_URL: "javascript:alert(1)" }],
  ])("fails closed for %s", (_name, env) => {
    expect(() => resolvePublicAppOrigin(env)).toThrow();
  });

  it("builds authentication links from the same resolved origin", () => {
    const env = { REPLIT_DEV_DOMAIN: "example-workspace.replit.dev" };

    expect(buildPublicAppUrl("/verify-email?token=placeholder", env))
      .toBe("https://example-workspace.replit.dev/verify-email?token=placeholder");
    expect(buildPublicAppUrl("/reset-password?token=placeholder", env))
      .toBe("https://example-workspace.replit.dev/reset-password?token=placeholder");
  });
});