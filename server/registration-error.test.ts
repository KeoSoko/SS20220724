import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { registrationErrorFromResponse } from "../client/src/lib/registration-error";

describe("registration error recovery", () => {
  it("preserves a username conflict instead of catching its own structured error", () => {
    const error = registrationErrorFromResponse(409, "Conflict", JSON.stringify({
      error: "Username already exists",
      message: "This username is already taken",
      field: "username",
      suggestion: "Choose a different username",
    }));
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      status: 409, field: "username", message: "This username is already taken",
      suggestion: "Choose a different username",
    });
  });

  it("keeps email conflicts distinct and retains their recovery action", () => {
    expect(registrationErrorFromResponse(409, "Conflict", JSON.stringify({
      error: "Email address is already registered",
      field: "email",
      action: "redirect_to_login",
    }))).toMatchObject({
      status: 409, field: "email", action: "redirect_to_login",
      message: "Email address is already registered",
    });
  });

  it("preserves the specific failed registration field and its validation message", () => {
    expect(registrationErrorFromResponse(400, "Bad Request", JSON.stringify({
      error: "Invalid registration details",
      message: "Username can only contain letters, numbers, and underscores",
      field: "username",
    }))).toMatchObject({
      status: 400, field: "username",
      message: "Username can only contain letters, numbers, and underscores",
    });
  });

  it.each(["<html>Internal Server Error</html>", "null", "[]"])(
    "uses a safe status-bearing fallback for %s", (body) => {
      expect(registrationErrorFromResponse(500, "Internal Server Error", body)).toMatchObject({
        status: 500, message: "Registration failed: 500 Internal Server Error",
      });
    },
  );

  it("uses the parser in the real auth hook and opens the actual verification flow", () => {
    const hook = readFileSync(new URL("../client/src/hooks/use-auth.tsx", import.meta.url), "utf8");
    const page = readFileSync(new URL("../client/src/pages/auth-page.tsx", import.meta.url), "utf8");
    expect(hook).toContain("throw registrationErrorFromResponse(response.status, response.statusText, errorText)");
    expect(page).toContain('setLocation("/verify-email")');
    expect(page).not.toContain("Could implement resend verification here");
    expect(page).toContain("error.field === 'username' && error.status === 409");
  });
});
