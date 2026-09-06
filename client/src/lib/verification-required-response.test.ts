import { describe, expect, it } from "vitest";
import { getVerificationRequiredResponse } from "./verification-required-response";

describe("getVerificationRequiredResponse", () => {
  it("classifies the structured verification-required 403 response", () => {
    expect(getVerificationRequiredResponse(403, {
      error: "email_verification_required",
      userEmail: "owner@example.com",
    })).toEqual({ userEmail: "owner@example.com" });
  });

  it.each([
    [403, { error: "forbidden", userEmail: "owner@example.com" }],
    [500, { error: "email_verification_required", userEmail: "owner@example.com" }],
  ])("does not classify unrelated %i responses", (status, responseBody) => {
    expect(getVerificationRequiredResponse(status, responseBody)).toBeNull();
  });
});