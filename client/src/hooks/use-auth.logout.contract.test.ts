import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./use-auth.tsx", import.meta.url), "utf8");

describe("logout auth destination", () => {
  it("sends direct and resilient logout paths to the canonical sign-in mode", () => {
    expect(source).toContain('window.location.href = "/auth?mode=signin";');
    expect(source).toContain("window.location.href = '/auth?mode=signin&force=true';");
    expect(source).toContain("window.location.href = '/auth?mode=signin&signedout=all';");
    expect(source).not.toContain("/auth?tab=login");
  });
});