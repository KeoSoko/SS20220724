import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./use-auth.tsx", import.meta.url), "utf8");

describe("registration auth installation contract", () => {
  it("uses the same auth response installer for login and authenticated registration", () => {
    expect(source.match(/installAuthResponse\(data\)/g)).toHaveLength(2);
    expect(source).toContain("storeToken(data.token, data.expiresIn, data.user.username)");
    expect(source).toContain('queryClient.setQueryData(["/api/user"], data.user)');
    expect(source).toContain("writeReturningUserMarker(localStorage)");
  });

  it("does not install partial auth after the account-created fallback", () => {
    expect(source).toContain('code: "account_created_but_signin_required"');
    expect(source).toContain('if (data.authenticated !== false && "token" in data)');
  });
});