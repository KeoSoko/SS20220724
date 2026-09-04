import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { handleAccountDeletionRequest } from "./account-deletion-handler";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("account deletion route contracts", () => {
  const route = read("server/routes.ts");
  const response = () => {
    const result: { status?: number; body?: any } = {};
    const res: any = { status: (status: number) => { result.status = status; return res; }, json: (body: any) => { result.body = body; } };
    return { result, res };
  };
  const deps = (overrides: Record<string, any> = {}) => ({
    getUser: async () => ({ password: "hash" }),
    comparePassword: async () => true,
    deleteAccount: async () => undefined,
    log: () => undefined,
    ...overrides,
  });

  it("executes validation guards without calling deletion", async () => {
    for (const body of [{ confirmationText: "DELETE MY ACCOUNT" }, { password: "x" }, { password: "x", confirmationText: "delete my account" }]) {
      let calls = 0;
      const output = response();
      await handleAccountDeletionRequest({ body }, output.res, 7, deps({ deleteAccount: async () => { calls++; } }));
      expect(calls).toBe(0);
    }
    let calls = 0;
    const output = response();
    await handleAccountDeletionRequest({ body: { password: "wrong", confirmationText: "DELETE MY ACCOUNT" } }, output.res, 7,
      deps({ comparePassword: async () => false, deleteAccount: async () => { calls++; } }));
    expect(calls).toBe(0);
  });

  it("maps service errors safely and destroys a session only after success", async () => {
    const blocked = response();
    await handleAccountDeletionRequest({ body: { password: "x", confirmationText: "DELETE MY ACCOUNT" } }, blocked.res, 7,
      deps({ deleteAccount: async () => { throw { code: "ACTIVE_PROVIDER_SUBSCRIPTION" }; } }));
    expect(blocked.result).toMatchObject({ status: 409, body: { code: "ACTIVE_PROVIDER_SUBSCRIPTION", userMessage: expect.any(String) } });
    const conflict = response();
    await handleAccountDeletionRequest({ body: { password: "x", confirmationText: "DELETE MY ACCOUNT" } }, conflict.res, 7,
      deps({ deleteAccount: async () => { throw { code: "DEPENDENCY_CONFLICT" }; } }));
    expect(conflict.result).toMatchObject({ status: 409, body: { code: "DEPENDENCY_CONFLICT", userMessage: expect.any(String) } });

    const sequence: string[] = [];
    const success = response();
    let releaseService!: () => void;
    const pendingService = new Promise<void>((resolve) => { releaseService = resolve; });
    const handled = handleAccountDeletionRequest({ body: { password: "x", confirmationText: "DELETE MY ACCOUNT" }, session: { destroy: (done) => { sequence.push("destroy"); done(); } } }, success.res, 7,
      deps({ deleteAccount: async () => { sequence.push("service"); await pendingService; } }));
    await new Promise((resolve) => setImmediate(resolve));
    expect(sequence).toEqual(["service"]);
    releaseService();
    await handled;
    expect(sequence).toEqual(["service", "destroy"]);
    let destroyed = false;
    await handleAccountDeletionRequest({ body: { password: "x", confirmationText: "DELETE MY ACCOUNT" }, session: { destroy: () => { destroyed = true; } } }, response().res, 7,
      deps({ deleteAccount: async () => { throw { code: "DEPENDENCY_CONFLICT" }; } }));
    expect(destroyed).toBe(false);
  });

  it("keeps Paystack and Azure outside the deletion service boundary", () => {
    const deletionService = read("server/account-deletion-service.ts");
    expect(deletionService).not.toContain("billingService");
    expect(deletionService).not.toContain("azureStorage");
    expect(deletionService).not.toMatch(/from "\.\/(?:billing-service|azure-storage)"/);
  });
});

describe("schema/migration deletion FK contract", () => {
  const schema = read("shared/schema.ts");
  const service = read("server/account-deletion-service.ts");
  const migration = read("migrations/0008_add_account_deletion_cleanup.sql");
  const inboundUserTables = [
    "custom_categories", "workspace_members", "workspace_invites", "receipts", "tags", "auth_tokens",
    "budgets", "receipt_shares", "email_receipts", "inbound_email_logs", "email_documents", "user_preferences",
    "tax_settings", "receipt_audit_trail", "user_subscriptions", "paystack_subscription_identities",
    "paystack_checkout_attempts", "paystack_cancellation_attempts", "payment_transactions", "billing_events",
    "export_jobs", "email_events", "user_corrections", "merchant_patterns", "business_profiles",
    "business_email_identities", "clients", "quotations", "invoices",
  ];
  const inboundWorkspaceTables = [
    "users", "workspace_members", "workspace_invites", "receipts", "email_documents", "merchant_category_rules",
    "clients", "quotations", "invoices",
  ];

  it("classifies every shared-schema inbound user/workspace table as handled or a pre-delete block", () => {
    for (const table of [...inboundUserTables, ...inboundWorkspaceTables]) {
      expect(schema).toContain(`pgTable("${table}"`);
      expect(service).toContain(table);
    }
  });

  it("keeps blob cleanup unaffiliated with deleted users and audit free of durable IDs", () => {
    expect(schema).toContain('pgTable("account_blob_cleanup_jobs"');
    expect(schema).not.toContain('deletedUserId');
    expect(migration).toContain('DROP COLUMN IF EXISTS "deleted_user_id"');
    expect(migration).toContain('"aggregate_counts" jsonb');
  });
});