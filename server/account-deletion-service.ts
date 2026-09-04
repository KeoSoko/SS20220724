import { pool } from "./db";
import { log } from "./vite";

export type AccountDeletionCode =
  | "NOT_FOUND"
  | "ACTIVE_PROVIDER_SUBSCRIPTION"
  | "DEPENDENCY_CONFLICT"
  | "UNEXPECTED_DELETION_FAILURE";

export class AccountDeletionError extends Error {
  constructor(public readonly code: AccountDeletionCode) {
    super(code);
    this.name = "AccountDeletionError";
  }
}

export interface AccountDeletionResult {
  blobNames: string[];
  workspaceId: number;
}

type Queryable = { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> };
type TransactionProvider = { connect: () => Promise<Queryable & { release: () => void }> };

const hasValue = (value: unknown) => value !== null && value !== undefined && value !== "";

/**
 * Deletes a free, personal account only.  It deliberately has no billing or
 * object-storage dependency: all external work is represented by an outbox row.
 */
export class AccountDeletionService {
  constructor(private readonly transactionProvider: TransactionProvider = pool) {}

  async deleteAccount(userId: number): Promise<AccountDeletionResult> {
    const client = await this.transactionProvider.connect();
    try {
      await client.query("BEGIN");
      // Serializes deletion with membership and billing writes for this account.
      await client.query("SELECT pg_advisory_xact_lock($1)", [userId]);

      const userResult = await client.query(
        "SELECT id, workspace_id FROM users WHERE id = $1 FOR UPDATE", [userId],
      );
      const user = userResult.rows[0];
      if (!user) throw new AccountDeletionError("NOT_FOUND");
      const workspaceId = user.workspace_id;

      const workspaceResult = await client.query(
        "SELECT id, owner_id FROM workspaces WHERE id = $1 FOR UPDATE", [workspaceId],
      );
      const workspace = workspaceResult.rows[0];
      if (!workspace || workspace.owner_id !== userId) {
        throw new AccountDeletionError("DEPENDENCY_CONFLICT");
      }
      const members = await client.query(
        "SELECT user_id FROM workspace_members WHERE workspace_id = $1 FOR UPDATE", [workspaceId],
      );
      if (members.rows.length !== 1 || Number(members.rows[0].user_id) !== userId) {
        throw new AccountDeletionError("DEPENDENCY_CONFLICT");
      }

      // Evidence is evaluated before *any* delete. A trial with no provider
      // fields/payment is intentionally permitted.
      const subscription = (await client.query(
        `SELECT paystack_reference, paystack_customer_code, authorization_code,
                google_play_purchase_token, google_play_order_id, google_play_subscription_id,
                apple_receipt_data, apple_transaction_id, apple_original_transaction_id,
                total_paid
           FROM user_subscriptions WHERE user_id = $1 FOR UPDATE`, [userId],
      )).rows[0];
      const evidenceCounts = await client.query(
        `SELECT
          (SELECT count(*) FROM paystack_subscription_identities WHERE user_id = $1) AS identities,
          (SELECT count(*) FROM paystack_checkout_attempts
             WHERE billing_owner_user_id = $1 OR requested_by_user_id = $1) AS checkouts,
          (SELECT count(*) FROM paystack_cancellation_attempts WHERE billing_owner_user_id = $1) AS cancellations,
          (SELECT count(*) FROM payment_transactions WHERE user_id = $1 AND status = 'completed') AS completed,
          (SELECT count(*) FROM payment_transactions
             WHERE user_id = $1 AND (platform IN ('paystack', 'google_play', 'apple')
               OR provider_transaction_id IS NOT NULL OR provider_authorization_code IS NOT NULL
               OR platform_subscription_id IS NOT NULL)) AS provider_transactions`,
        [userId],
      );
      const counts = evidenceCounts.rows[0];
      const providerFields = subscription && [
        subscription.paystack_reference, subscription.paystack_customer_code, subscription.authorization_code,
        subscription.google_play_purchase_token, subscription.google_play_order_id, subscription.google_play_subscription_id,
        subscription.apple_receipt_data, subscription.apple_transaction_id, subscription.apple_original_transaction_id,
      ].some(hasValue);
      if (providerFields || (subscription && Number(subscription.total_paid || 0) > 0) ||
          Number(counts.identities) > 0 || Number(counts.checkouts) > 0 ||
          Number(counts.cancellations) > 0 || Number(counts.completed) > 0 ||
          Number(counts.provider_transactions) > 0) {
        throw new AccountDeletionError("ACTIVE_PROVIDER_SUBSCRIPTION");
      }

      const blobs = await client.query(
        `SELECT blob_name FROM receipts WHERE user_id = $1 AND blob_name IS NOT NULL
         UNION SELECT blob_name FROM export_jobs WHERE user_id = $1 AND blob_name IS NOT NULL`,
        [userId],
      );
      const blobNames = Array.from(new Set(
        blobs.rows
          .map((row) => row.blob_name as string)
          .filter((name) => typeof name === "string" && name.trim().length > 0),
      ));

      // Descendants first.  The statements are intentionally explicit rather
      // than relying on whichever production FK migrations happen to cascade.
      const deletes: Array<[string, unknown[]]> = [
        ["DELETE FROM invoice_payments WHERE invoice_id IN (SELECT id FROM invoices WHERE user_id = $1 OR workspace_id = $2)", [userId, workspaceId]],
        ["DELETE FROM line_items WHERE invoice_id IN (SELECT id FROM invoices WHERE user_id = $1 OR workspace_id = $2) OR quotation_id IN (SELECT id FROM quotations WHERE user_id = $1 OR workspace_id = $2)", [userId, workspaceId]],
        ["DELETE FROM invoices WHERE user_id = $1 OR workspace_id = $2", [userId, workspaceId]],
        ["DELETE FROM quotations WHERE user_id = $1 OR workspace_id = $2", [userId, workspaceId]],
        ["DELETE FROM clients WHERE user_id = $1 OR workspace_id = $2", [userId, workspaceId]],
        ["DELETE FROM receipt_tags WHERE receipt_id IN (SELECT id FROM receipts WHERE user_id = $1 OR workspace_id = $2)", [userId, workspaceId]],
        ["DELETE FROM receipt_duplicates WHERE original_receipt_id IN (SELECT id FROM receipts WHERE user_id = $1 OR workspace_id = $2) OR duplicate_receipt_id IN (SELECT id FROM receipts WHERE user_id = $1 OR workspace_id = $2)", [userId, workspaceId]],
        ["DELETE FROM receipt_audit_trail WHERE user_id = $1 OR receipt_id IN (SELECT id FROM receipts WHERE user_id = $1 OR workspace_id = $2)", [userId, workspaceId]],
        ["DELETE FROM user_corrections WHERE user_id = $1 OR receipt_id IN (SELECT id FROM receipts WHERE user_id = $1 OR workspace_id = $2)", [userId, workspaceId]],
        ["DELETE FROM receipt_shares WHERE shared_by_user_id = $1 OR receipt_id IN (SELECT id FROM receipts WHERE user_id = $1 OR workspace_id = $2)", [userId, workspaceId]],
        ["DELETE FROM email_documents WHERE user_id = $1 OR workspace_id = $2", [userId, workspaceId]],
        ["DELETE FROM email_receipts WHERE user_id = $1", [userId]],
        ["DELETE FROM receipts WHERE user_id = $1 OR workspace_id = $2", [userId, workspaceId]],
        ["DELETE FROM custom_categories WHERE user_id = $1", [userId]],
        ["DELETE FROM tags WHERE user_id = $1", [userId]],
        ["DELETE FROM budgets WHERE user_id = $1", [userId]],
        ["DELETE FROM user_preferences WHERE user_id = $1", [userId]],
        ["DELETE FROM tax_settings WHERE user_id = $1", [userId]],
        ["DELETE FROM merchant_patterns WHERE user_id = $1", [userId]],
        ["DELETE FROM merchant_category_rules WHERE workspace_id = $1", [workspaceId]],
        ["DELETE FROM business_email_identities WHERE user_id = $1", [userId]],
        ["DELETE FROM business_profiles WHERE user_id = $1", [userId]],
        ["DELETE FROM email_events WHERE user_id = $1", [userId]],
        ["UPDATE inbound_email_logs SET user_id = NULL, receipt_email_id = NULL, from_email = '[deleted]', to_address = '[deleted]', subject = NULL, html_body = NULL, text_body = NULL, error_message = NULL WHERE user_id = $1", [userId]],
        ["DELETE FROM auth_tokens WHERE user_id = $1", [userId]],
        ["DELETE FROM export_jobs WHERE user_id = $1", [userId]],
        ["DELETE FROM billing_events WHERE user_id = $1", [userId]],
        ["DELETE FROM payment_transactions WHERE user_id = $1", [userId]],
        ["DELETE FROM paystack_cancellation_attempts WHERE billing_owner_user_id = $1", [userId]],
        ["DELETE FROM paystack_checkout_attempts WHERE billing_owner_user_id = $1 OR requested_by_user_id = $1", [userId]],
        ["DELETE FROM paystack_subscription_identities WHERE user_id = $1", [userId]],
        ["DELETE FROM user_subscriptions WHERE user_id = $1", [userId]],
        ["DELETE FROM workspace_invites WHERE invited_by_user_id = $1 OR workspace_id = $2", [userId, workspaceId]],
        ["DELETE FROM workspace_members WHERE user_id = $1 OR workspace_id = $2", [userId, workspaceId]],
      ];
      const aggregateCounts: Record<string, number> = {};
      for (const [statement, values] of deletes) {
        const result = await client.query(statement, values);
        const table = statement.match(/(?:FROM|UPDATE)\s+([a-z_]+)/i)?.[1];
        if (table) aggregateCounts[table] = (aggregateCounts[table] || 0) + (result.rowCount || 0);
      }
      for (const blobName of blobNames) {
        await client.query(
          "INSERT INTO account_blob_cleanup_jobs (id, blob_name, status) VALUES (gen_random_uuid(), $1, 'queued') ON CONFLICT (blob_name) DO NOTHING",
          [blobName],
        );
      }
      await client.query("DELETE FROM users WHERE id = $1", [userId]);
      await client.query("DELETE FROM workspaces WHERE id = $1 AND owner_id = $2", [workspaceId, userId]);
      await client.query(
        "INSERT INTO account_deletion_audit (id, outcome_code, aggregate_counts, blob_cleanup_count) VALUES (gen_random_uuid(), 'DELETED', $1::jsonb, $2)",
        [JSON.stringify(aggregateCounts), blobNames.length],
      );
      await client.query("COMMIT");
      return { blobNames, workspaceId };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      if (error instanceof AccountDeletionError) throw error;
      log(`Account deletion failed userId=${userId} code=UNEXPECTED_DELETION_FAILURE`, "api");
      throw new AccountDeletionError("UNEXPECTED_DELETION_FAILURE");
    } finally {
      client.release();
    }
  }
}

export const accountDeletionService = new AccountDeletionService();