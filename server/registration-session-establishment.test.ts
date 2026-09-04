import { describe, expect, it, vi } from "vitest";
import { establishAuthenticatedSession, jwtAuthMiddleware, revokeBearerCredential } from "./auth";

const user = { id: 901, username: "new-user", tokenVersion: 4 } as any;

function mockPersistence() {
  const enforce = vi.fn().mockResolvedValue(undefined);
  const createToken = vi.fn().mockResolvedValue({ id: "test-session" });
  const lastLogin = vi.fn().mockResolvedValue(undefined);
  return {
    enforce,
    createToken,
    lastLogin,
    persistence: {
      updateUser: vi.fn().mockResolvedValue(user),
      enforceSessionLimit: enforce,
      createAuthToken: createToken,
      updateLastLogin: lastLogin,
      getAuthTokenByToken: vi.fn().mockResolvedValue(undefined),
      revokeAuthToken: vi.fn().mockResolvedValue(undefined),
    } as any,
  };
}

describe("registration session establishment", () => {
  it("regenerates before Passport login and persists the current device session", async () => {
    const order: string[] = [];
    const persistence = mockPersistence();
    const req = {
      logout: (done: (error?: unknown) => void) => { order.push("logout"); done(); },
      session: {
        regenerate: (done: (error?: unknown) => void) => { order.push("regenerate"); done(); },
        destroy: (done: (error?: unknown) => void) => done(),
      },
      login: (_user: unknown, done: (error?: unknown) => void) => { order.push("login"); done(); },
    } as any;

    const result = await establishAuthenticatedSession(req, user, false, persistence.persistence);

    expect(order).toEqual(["logout", "regenerate", "login"]);
    expect(result.token.split(".")).toHaveLength(3);
    expect(result.rememberMe).toBe(false);
    expect(persistence.enforce).toHaveBeenCalledWith(user.id, 2);
    const persistedJti = persistence.createToken.mock.calls[0][2];
    expect(persistence.createToken).toHaveBeenCalledWith(user.id, 1, expect.any(String));
    expect((await import("jsonwebtoken")).default.decode(result.token)).toMatchObject({ jti: persistedJti, v: 4 });
    expect(persistence.lastLogin).toHaveBeenCalledWith(user.id);
  });

  it("fails closed without Passport login or token persistence when regeneration fails", async () => {
    const persistence = mockPersistence();
    const login = vi.fn();
    let regenerations = 0;
    const req = {
      logout: (done: (error?: unknown) => void) => done(),
      session: { regenerate: (done: (error?: unknown) => void) => {
        regenerations += 1;
        done(regenerations === 1 ? new Error("regeneration failed") : undefined);
      }, destroy: (done: (error?: unknown) => void) => done() },
      login,
    } as any;

    await expect(establishAuthenticatedSession(req, user, false, persistence.persistence)).rejects.toThrow("regeneration failed");
    expect(login).not.toHaveBeenCalled();
    expect(persistence.createToken).not.toHaveBeenCalled();
  });

  it("rejects the exact issued JWT after its persisted session is revoked", async () => {
    const activeTokens = new Map<string, any>();
    const persistence = {
      updateUser: vi.fn().mockResolvedValue(user),
      createAuthToken: vi.fn(async (userId: number, _days: number, tokenValue: string) => {
        const record = { id: "session-1", userId, token: tokenValue, isRevoked: false };
        activeTokens.set(tokenValue, record);
        return record;
      }),
      enforceSessionLimit: vi.fn().mockResolvedValue(undefined),
      updateLastLogin: vi.fn().mockResolvedValue(undefined),
      revokeAuthToken: vi.fn(async (tokenId: string) => {
        for (const [tokenValue, record] of activeTokens) {
          if (record.id === tokenId) activeTokens.delete(tokenValue);
        }
      }),
      getUser: vi.fn().mockResolvedValue(user),
      getAuthTokenByToken: vi.fn(async (tokenValue: string) => activeTokens.get(tokenValue)),
    } as any;
    const loginRequest = {
      logout: (done: (error?: unknown) => void) => done(),
      session: {
        regenerate: (done: (error?: unknown) => void) => done(),
        destroy: (done: (error?: unknown) => void) => done(),
      },
      login: (_user: unknown, done: (error?: unknown) => void) => done(),
    } as any;
    const authentication = await establishAuthenticatedSession(loginRequest, user, false, persistence);
    expect(await revokeBearerCredential(authentication.token, persistence)).toBe(true);

    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const next = vi.fn();
    jwtAuthMiddleware(
      {
        path: "/api/receipts",
        headers: { authorization: `Bearer ${authentication.token}` },
        session: {},
        isAuthenticated: () => false,
      } as any,
      { status, json } as any,
      next,
      persistence,
    );
    await vi.waitFor(() => expect(status).toHaveBeenCalledWith(401));
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: "Token revoked" }));
    expect(next).not.toHaveBeenCalled();
  });
});