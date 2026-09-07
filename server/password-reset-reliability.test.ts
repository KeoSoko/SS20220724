import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { strongPasswordSchema } from "@shared/schema";
import { jwtAuthMiddleware } from "./auth";
import {
  generatePasswordResetToken,
  getPasswordResetExpiry,
  hashPasswordResetToken,
  PASSWORD_RESET_TTL_MS,
} from "./password-reset-security";
import { MemStorage } from "./storage";

const authSource = readFileSync(new URL("./auth.ts", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const databaseStorageSource = readFileSync(new URL("./database-storage.ts", import.meta.url), "utf8");

async function fixture() {
  const storage = new MemStorage();
  const user = await storage.createUser({
    username: "reset-fixture",
    email: "reset-fixture@example.test",
    password: "old-password-hash",
    isEmailVerified: false,
  } as any);
  await storage.updateUser(user.id, {
    subscriptionTier: "premium",
    subscriptionExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
  });
  return { storage, user };
}

describe("password reset reliability", () => {
  it("generates strong opaque tokens, stores only a digest, and uses a finite expiry", async () => {
    const { storage, user } = await fixture();
    const token = generatePasswordResetToken();
    const secondToken = generatePasswordResetToken();
    const before = Date.now();
    const expires = getPasswordResetExpiry(before);

    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(secondToken).not.toBe(token);
    expect(hashPasswordResetToken(token)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(expires.getTime()).toBe(before + PASSWORD_RESET_TTL_MS);

    await storage.storePasswordResetToken(user.id, token, expires);
    expect((await storage.getUser(user.id))?.passwordResetToken).toBe(hashPasswordResetToken(token));
  });

  it("accepts one valid token exactly once", async () => {
    const { storage, user } = await fixture();
    const token = generatePasswordResetToken();
    await storage.storePasswordResetToken(user.id, token, getPasswordResetExpiry());

    const consumed = await storage.consumePasswordResetToken(token, "new-password-hash");
    expect(consumed?.id).toBe(user.id);
    expect(await storage.consumePasswordResetToken(token, "replay")).toBeUndefined();
    expect((await storage.getUser(user.id))?.password).toBe("new-password-hash");
  });

  it("rejects invalid, expired, and superseded tokens", async () => {
    const { storage, user } = await fixture();
    const oldToken = generatePasswordResetToken();
    const newestToken = generatePasswordResetToken();
    await storage.storePasswordResetToken(user.id, oldToken, getPasswordResetExpiry());
    await storage.storePasswordResetToken(user.id, newestToken, getPasswordResetExpiry());

    expect(await storage.consumePasswordResetToken("invalid", "hash")).toBeUndefined();
    expect(await storage.consumePasswordResetToken(oldToken, "hash")).toBeUndefined();

    await storage.storePasswordResetToken(user.id, newestToken, new Date(Date.now() - 1));
    expect(await storage.consumePasswordResetToken(newestToken, "hash")).toBeUndefined();
  });

  it("does not verify email or alter subscription access when resetting", async () => {
    const { storage, user } = await fixture();
    const token = generatePasswordResetToken();
    await storage.storePasswordResetToken(user.id, token, getPasswordResetExpiry());
    await storage.consumePasswordResetToken(token, "new-password-hash");
    const updated = await storage.getUser(user.id);

    expect(updated?.isEmailVerified).toBe(false);
    expect(updated?.subscriptionTier).toBe("premium");
    expect(updated?.subscriptionExpiresAt).toEqual(new Date("2030-01-01T00:00:00.000Z"));
  });

  it("enforces the shared strong password policy", () => {
    expect(strongPasswordSchema.safeParse("weak").success).toBe(false);
    expect(strongPasswordSchema.safeParse("StrongPass1!").success).toBe(true);
  });

  it("allows logged-out reset requests even with an expired bearer header", () => {
    const next = vi.fn();
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    jwtAuthMiddleware({
      path: "/api/reset-password",
      headers: { authorization: "Bearer expired.jwt.value" },
    } as any, { status, json } as any, next);
    expect(next).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });

  it("keeps one reset endpoint, neutral forgot responses, and auth rate limiting", () => {
    expect(authSource.split('app.post("/api/reset-password"')).toHaveLength(2);
    expect(authSource.split("If this email is registered, you'll receive password reset instructions.")).toHaveLength(3);
    expect(indexSource).toContain("'/api/forgot-password'");
    expect(authSource).not.toMatch(/resetToken.*log|resetUrl.*log/);
  });

  it("atomically consumes the token and preserves verification and billing fields", () => {
    const consumeStart = databaseStorageSource.indexOf("async consumePasswordResetToken");
    const consumeEnd = databaseStorageSource.indexOf("async updateUserPassword", consumeStart);
    const consumeSource = databaseStorageSource.slice(consumeStart, consumeEnd);
    expect(consumeSource).toContain("passwordResetToken: null");
    expect(consumeSource).toContain("tokenVersion:");
    expect(consumeSource).toContain("db.transaction");
    expect(consumeSource).toContain("transaction.delete(authTokens)");
    expect(consumeSource).not.toContain("isEmailVerified");
    expect(consumeSource).not.toContain("subscriptionTier");
  });
});