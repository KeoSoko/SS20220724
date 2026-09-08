import { describe, expect, it } from "vitest";
import { buildSafeAttributionTouch } from "./attribution";

describe("browser attribution privacy boundary", () => {
  it("captures only allowlisted campaign values, host-only referrer, and path-only landing", () => {
    const touch = buildSafeAttributionTouch({
      pathname: "/pricing",
      hostname: "simpleslips.app",
      search: "?utm_source=newsletter&utm_campaign=%3Cscript%3Ex%3C%2Fscript%3E&token=secret&email=private%40example.com&gclid=click-1",
    } as Location, "https://Partner.Example/private/path?token=secret#fragment");
    expect(touch).toEqual({
      landingPath: "/pricing",
      utm_source: "newsletter",
      utm_campaign: "scriptx/script",
      gclid: "click-1",
      referrerHost: "partner.example",
    });
    expect(JSON.stringify(touch)).not.toContain("private");
    expect(JSON.stringify(touch)).not.toContain("secret");
  });

  it("does not preserve internal referrers", () => {
    expect(buildSafeAttributionTouch({
      pathname: "/auth",
      hostname: "simpleslips.app",
      search: "",
    } as Location, "https://simpleslips.app/reset-password?token=secret")).toEqual({ landingPath: "/auth" });
  });
});