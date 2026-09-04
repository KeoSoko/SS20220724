import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ pool: {} }));
vi.mock("./vite", () => ({ log: vi.fn() }));

import { AccountDeletionError, AccountDeletionService } from "./account-deletion-service";

class FakeClient {
  statements: string[] = [];
  failOn?: string;
  scenario: "fresh" | "paid" | "missing" = "fresh";
  async query(statement: string): Promise<{ rows: any[]; rowCount: number }> {
    this.statements.push(statement);
    if (this.failOn && statement.includes(this.failOn)) throw new Error("injected failure");
    if (statement.includes("FROM users WHERE")) return { rows: this.scenario === "missing" ? [] : [{ id: 7, workspace_id: 9 }], rowCount: 1 };
    if (statement.includes("FROM workspaces WHERE")) return { rows: [{ id: 9, owner_id: 7 }], rowCount: 1 };
    if (statement.includes("FROM workspace_members")) return { rows: [{ user_id: 7 }], rowCount: 1 };
    if (statement.includes("FROM user_subscriptions")) return { rows: [{ total_paid: this.scenario === "paid" ? 500 : 0 }], rowCount: 1 };
    if (statement.includes("AS identities")) return { rows: [{ identities: 0, checkouts: 0, cancellations: 0, completed: 0, provider_transactions: 0 }], rowCount: 1 };
    if (statement.includes("UNION SELECT blob_name")) return { rows: [{ blob_name: "receipt-a" }, { blob_name: "" }, { blob_name: "receipt-a" }, { blob_name: "export-a" }], rowCount: 4 };
    return { rows: [], rowCount: 1 };
  }
  release = vi.fn();
}

describe("AccountDeletionService", () => {
  let client: FakeClient;
  let service: AccountDeletionService;

  beforeEach(() => {
    client = new FakeClient();
    service = new AccountDeletionService({ connect: async () => client as any });
  });

  it("deletes a fresh personal trial in explicit child-first order and queues unique nonblank blobs", async () => {
    const result = await service.deleteAccount(7);
    expect(result.blobNames).toEqual(["receipt-a", "export-a"]);
    const position = (fragment: string) => client.statements.findIndex((x) => x.includes(fragment));
    expect(position("DELETE FROM invoice_payments")).toBeLessThan(position("DELETE FROM invoices"));
    expect(position("DELETE FROM line_items")).toBeLessThan(position("DELETE FROM quotations"));
    expect(position("DELETE FROM receipt_tags")).toBeLessThan(position("DELETE FROM receipts"));
    expect(position("DELETE FROM workspace_members")).toBeLessThan(position("DELETE FROM users"));
    expect(position("DELETE FROM users")).toBeLessThan(position("DELETE FROM workspaces"));
    expect(client.statements.filter((x) => x.includes("account_blob_cleanup_jobs"))).toHaveLength(2);
    expect(client.statements).toContain("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("blocks paid/provider evidence before a local mutation and never reaches external dependencies", async () => {
    client.scenario = "paid";
    await expect(service.deleteAccount(7)).rejects.toMatchObject<AccountDeletionError>({ code: "ACTIVE_PROVIDER_SUBSCRIPTION" });
    expect(client.statements.some((x) => /^(DELETE|UPDATE|INSERT) /i.test(x))).toBe(false);
    expect(client.statements).not.toContain("COMMIT");
    expect(client.statements).toContain("ROLLBACK");
  });

  it("rolls back an injected local deletion failure without committing", async () => {
    client.failOn = "DELETE FROM receipts";
    await expect(service.deleteAccount(7)).rejects.toMatchObject<AccountDeletionError>({ code: "UNEXPECTED_DELETION_FAILURE" });
    expect(client.statements).toContain("ROLLBACK");
    expect(client.statements).not.toContain("COMMIT");
  });

  it("reports a retry after deletion as NOT_FOUND", async () => {
    client.scenario = "missing";
    await expect(service.deleteAccount(7)).rejects.toMatchObject<AccountDeletionError>({ code: "NOT_FOUND" });
    expect(client.statements.some((x) => /^(DELETE|UPDATE|INSERT) /i.test(x))).toBe(false);
  });
});