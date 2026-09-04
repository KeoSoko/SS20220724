import { describe, expect, it } from "vitest";
import { getSafeAuthRedirect } from "./safe-auth-redirect";

describe("getSafeAuthRedirect", () => {
  it("accepts internal application paths", () => {
    expect(getSafeAuthRedirect("/upload?source=welcome#scan")).toBe("/upload?source=welcome#scan");
  });

  it("rejects external, protocol-relative, malformed, and auth-loop redirects", () => {
    expect(getSafeAuthRedirect("https://evil.example")).toBe("/home");
    expect(getSafeAuthRedirect("//evil.example/path")).toBe("/home");
    expect(getSafeAuthRedirect("/\\evil.example")).toBe("/home");
    expect(getSafeAuthRedirect("/auth?mode=signin")).toBe("/home");
    expect(getSafeAuthRedirect(null)).toBe("/home");
  });
});