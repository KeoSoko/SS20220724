import { db } from "./db";
import { sql } from "drizzle-orm";
import { log } from "./vite";

const READY_CACHE_TTL_MS = 30_000;
const NOT_READY_CACHE_TTL_MS = 2_000;

export type PaystackBillingSchemaRequirement =
  | "subscription_identities_table"
  | "checkout_attempts_table"
  | "subscription_code_unique"
  | "checkout_reference_unique"
  | "one_pending_checkout_per_owner"
  | "checkout_access_code_column";

export interface PaystackBillingSchemaReadiness {
  ready: boolean;
  missing: PaystackBillingSchemaRequirement[];
  checkedAt: Date;
}

export class PaystackBillingSchemaNotReadyError extends Error {
  readonly readiness: PaystackBillingSchemaReadiness;

  constructor(readiness: PaystackBillingSchemaReadiness) {
    super("Paystack billing schema is not ready");
    this.name = "PaystackBillingSchemaNotReadyError";
    this.readiness = readiness;
  }
}

type CachedReadiness = PaystackBillingSchemaReadiness & { expiresAt: number };

let cachedReadiness: CachedReadiness | null = null;
let lastLoggedState: boolean | null = null;

function asBoolean(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1 || value === "1";
}

function logReadiness(readiness: PaystackBillingSchemaReadiness): void {
  if (lastLoggedState === readiness.ready) return;
  lastLoggedState = readiness.ready;
  log(JSON.stringify({
    event: readiness.ready ? "billing_schema_ready" : "billing_schema_not_ready",
    missing: readiness.missing,
    checkedAt: readiness.checkedAt.toISOString(),
  }), "billing");
}

/**
 * Verifies the additive Paystack schema without creating or altering anything.
 *
 * The check is intentionally expressed through PostgreSQL catalogs rather than
 * migration metadata: the application needs the actual tables and uniqueness
 * guarantees before a checkout or provider event can safely be processed.
 */
export async function getPaystackBillingSchemaReadiness(
  options: { forceRefresh?: boolean } = {},
): Promise<PaystackBillingSchemaReadiness> {
  const now = Date.now();
  if (!options.forceRefresh && cachedReadiness && cachedReadiness.expiresAt > now) {
    return cachedReadiness;
  }

  const checkedAt = new Date();
  let readiness: PaystackBillingSchemaReadiness;
  try {
    const result = await db.execute(sql`
      SELECT
        to_regclass('public.paystack_subscription_identities') IS NOT NULL
          AS subscription_identities_table,
        to_regclass('public.paystack_checkout_attempts') IS NOT NULL
          AS checkout_attempts_table,
        EXISTS (
          SELECT 1
          FROM pg_index index_meta
          WHERE index_meta.indrelid = to_regclass('public.paystack_subscription_identities')
            AND index_meta.indisunique
            AND pg_get_indexdef(index_meta.indexrelid)
              ~* 'UNIQUE[[:space:]]+(INDEX|CONSTRAINT).*\\(subscription_code\\)'
        ) AS subscription_code_unique,
        EXISTS (
          SELECT 1
          FROM pg_index index_meta
          WHERE index_meta.indrelid = to_regclass('public.paystack_checkout_attempts')
            AND index_meta.indisunique
            AND pg_get_indexdef(index_meta.indexrelid)
              ~* 'UNIQUE[[:space:]]+(INDEX|CONSTRAINT).*\\(paystack_reference\\)'
        ) AS checkout_reference_unique,
        EXISTS (
          SELECT 1
          FROM pg_index index_meta
          WHERE index_meta.indrelid = to_regclass('public.paystack_checkout_attempts')
            AND index_meta.indisunique
            AND pg_get_indexdef(index_meta.indexrelid)
              ~* '\\(billing_owner_user_id\\).*WHERE.*status.*pending'
        ) AS one_pending_checkout_per_owner,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name  = 'paystack_checkout_attempts'
            AND column_name = 'paystack_access_code'
        ) AS checkout_access_code_column
    `);
    const row = (result as any).rows?.[0] ?? {};
    const requirements: Array<[PaystackBillingSchemaRequirement, boolean]> = [
      ["subscription_identities_table", asBoolean(row.subscription_identities_table)],
      ["checkout_attempts_table", asBoolean(row.checkout_attempts_table)],
      ["subscription_code_unique", asBoolean(row.subscription_code_unique)],
      ["checkout_reference_unique", asBoolean(row.checkout_reference_unique)],
      ["one_pending_checkout_per_owner", asBoolean(row.one_pending_checkout_per_owner)],
      ["checkout_access_code_column", asBoolean(row.checkout_access_code_column)],
    ];
    const missing = requirements
      .filter(([, satisfied]) => !satisfied)
      .map(([requirement]) => requirement);
    readiness = { ready: missing.length === 0, missing, checkedAt };
  } catch (error) {
    log(JSON.stringify({
      event: "billing_schema_not_ready",
      missing: ["schema_check_failed"],
      checkedAt: checkedAt.toISOString(),
      error: error instanceof Error ? error.message : String(error),
    }), "billing");
    readiness = {
      ready: false,
      missing: [
        "subscription_identities_table",
        "checkout_attempts_table",
        "subscription_code_unique",
        "checkout_reference_unique",
        "one_pending_checkout_per_owner",
        "checkout_access_code_column",
      ],
      checkedAt,
    };
  }

  cachedReadiness = {
    ...readiness,
    expiresAt: now + (readiness.ready ? READY_CACHE_TTL_MS : NOT_READY_CACHE_TTL_MS),
  };
  logReadiness(readiness);
  return readiness;
}

export async function requirePaystackBillingSchema(): Promise<void> {
  const readiness = await getPaystackBillingSchemaReadiness();
  if (!readiness.ready) {
    throw new PaystackBillingSchemaNotReadyError(readiness);
  }
}

export function resetPaystackBillingSchemaReadinessForTests(): void {
  cachedReadiness = null;
  lastLoggedState = null;
}