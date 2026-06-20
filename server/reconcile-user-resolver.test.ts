import { describe, it, expect, vi } from "vitest";
import { resolveUserForReconciliation } from "./reconcile-user-resolver";

type TestUser = { id: number; email: string };

function makeLookup(users: TestUser[]) {
  const getUser = vi.fn(async (id: number) => users.find((u) => u.id === id));
  const getUserByEmail = vi.fn(async (email: string) =>
    users.find((u) => u.email.toLowerCase() === email.toLowerCase()),
  );
  return { getUser, getUserByEmail };
}

describe("resolveUserForReconciliation", () => {
  const ian: TestUser = { id: 140, email: "iantolmay@mweb.co.za" };

  it("resolves by metadata.user_id when present and the account exists", async () => {
    const lookup = makeLookup([ian]);
    const user = await resolveUserForReconciliation(
      { subscription: { metadata: { user_id: 140 }, customer: { email: ian.email } } },
      lookup,
    );
    expect(user?.id).toBe(140);
    expect(lookup.getUser).toHaveBeenCalledWith(140);
    expect(lookup.getUserByEmail).not.toHaveBeenCalled();
  });

  it("falls back to the customer email when metadata.user_id is absent (the renewal case)", async () => {
    const lookup = makeLookup([ian]);
    const user = await resolveUserForReconciliation(
      { subscription: { metadata: null, customer: { email: ian.email } } },
      lookup,
    );
    expect(user?.id).toBe(140);
    expect(lookup.getUserByEmail).toHaveBeenCalledWith(ian.email);
  });

  it("falls back to email when metadata.user_id points to a non-existent account", async () => {
    const lookup = makeLookup([ian]);
    const user = await resolveUserForReconciliation(
      { subscription: { metadata: { user_id: 99999 }, customer: { email: ian.email } } },
      lookup,
    );
    expect(user?.id).toBe(140);
    expect(lookup.getUser).toHaveBeenCalledWith(99999);
    expect(lookup.getUserByEmail).toHaveBeenCalledWith(ian.email);
  });

  it("coerces a string metadata.user_id to a number before lookup", async () => {
    const lookup = makeLookup([ian]);
    const user = await resolveUserForReconciliation(
      { subscription: { metadata: { user_id: "140" }, customer: { email: ian.email } } },
      lookup,
    );
    expect(user?.id).toBe(140);
    expect(lookup.getUser).toHaveBeenCalledWith(140);
  });

  it("returns null when neither user_id nor email resolves to an account", async () => {
    const lookup = makeLookup([ian]);
    const user = await resolveUserForReconciliation(
      { subscription: { metadata: null, customer: { email: "nobody@example.com" } } },
      lookup,
    );
    expect(user).toBeNull();
  });

  it("returns null when there is no metadata and no customer email", async () => {
    const lookup = makeLookup([ian]);
    const user = await resolveUserForReconciliation({ subscription: {} }, lookup);
    expect(user).toBeNull();
    expect(lookup.getUser).not.toHaveBeenCalled();
    expect(lookup.getUserByEmail).not.toHaveBeenCalled();
  });
});
