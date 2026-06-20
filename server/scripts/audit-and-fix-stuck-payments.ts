// Audit and fix all past payments that got stuck — one-time, idempotent remediation.
//
// Background: A bug caused some Paystack renewal charges to arrive without plan_code
// or metadata.user_id, so the processing path threw before recording anything.
// This script finds every such case in billing_events and makes each customer whole
// in exactly the same way user 140 was fixed manually.
//
// Two signals are searched:
//   1. billing_events with event_type = 'plan_resolution_failed'
//      → payment arrived but we could not resolve the plan; nothing was recorded.
//   2. billing_events with event_type = 'legacy_paystack_webhook_processed'
//      → user was identified via email fallback; check whether a payment_transaction
//        row was ultimately saved (sometimes the downstream step also failed).
//
// For each unique reference found:
//   - Skip if a payment_transaction already exists (idempotent).
//   - Verify the charge with Paystack (must be 'success').
//   - Resolve the user via metadata.user_id → customer email.
//   - Call billingService.processPaystackSubscription (same path the webhook uses).
//   - Log a 'manual_payment_reconciliation' billing event.
//
// Safe to re-run: every step is idempotent.
//
// Run with: npx tsx server/scripts/audit-and-fix-stuck-payments.ts
// Add --dry-run to only print what would be fixed without changing anything.

import { db } from "../db";
import { sql } from "drizzle-orm";
import { billingService } from "../billing-service";
import { resolveUserForReconciliation } from "../reconcile-user-resolver";
import { storage } from "../storage";

const DRY_RUN = process.argv.includes("--dry-run");

// ─── Types ────────────────────────────────────────────────────────────────────

interface StuckPayment {
  reference: string;
  signal: "plan_resolution_failed" | "legacy_webhook_no_transaction";
  userId: number | null;
  eventId: number;
  eventCreatedAt: string;
}

interface ReconcileOutcome {
  reference: string;
  userId: number | null;
  result:
    | "already_recorded"
    | "reconciled"
    | "dry_run_skipped"
    | "verify_failed"
    | "user_not_found"
    | "process_failed";
  detail?: string;
}

// ─── Phase 1: Audit ───────────────────────────────────────────────────────────

async function findStuckPayments(): Promise<StuckPayment[]> {
  // 1a. plan_resolution_failed events — payment was received but plan could not be
  //     resolved so processing aborted before writing payment_transactions.
  const failedRows = await db.execute<{
    id: number;
    user_id: number | null;
    event_data: any;
    created_at: string;
  }>(sql`
    SELECT id, user_id, event_data, created_at
    FROM billing_events
    WHERE event_type = 'plan_resolution_failed'
    ORDER BY created_at
  `);

  // 1b. legacy_paystack_webhook_processed events — user resolved via email fallback,
  //     but the downstream processPaystackSubscription may have also failed.
  const legacyRows = await db.execute<{
    id: number;
    user_id: number | null;
    event_data: any;
    created_at: string;
  }>(sql`
    SELECT id, user_id, event_data, created_at
    FROM billing_events
    WHERE event_type = 'legacy_paystack_webhook_processed'
    ORDER BY created_at
  `);

  const seen = new Set<string>();
  const stuck: StuckPayment[] = [];

  // Collect plan_resolution_failed references
  for (const row of (failedRows as any).rows ?? []) {
    const ref: string | undefined =
      row.event_data?.paystackReference ?? row.event_data?.reference;
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    stuck.push({
      reference: ref,
      signal: "plan_resolution_failed",
      userId: row.user_id ?? null,
      eventId: row.id,
      eventCreatedAt: row.created_at,
    });
  }

  // Collect legacy webhook references that lack a payment_transaction
  for (const row of (legacyRows as any).rows ?? []) {
    const ref: string | undefined = row.event_data?.reference;
    if (!ref || seen.has(ref)) continue;

    // Check if a payment_transaction already exists for this reference
    const existing = await db.execute<{ cnt: string }>(sql`
      SELECT COUNT(*)::int AS cnt
      FROM payment_transactions
      WHERE platform_transaction_id = ${ref}
         OR metadata->>'reference' = ${ref}
    `);
    const cnt = parseInt(((existing as any).rows?.[0]?.cnt ?? "0"), 10);
    if (cnt > 0) continue; // already recorded — skip

    seen.add(ref);
    stuck.push({
      reference: ref,
      signal: "legacy_webhook_no_transaction",
      userId: row.user_id ?? null,
      eventId: row.id,
      eventCreatedAt: row.created_at,
    });
  }

  return stuck;
}

// ─── Phase 2: Fix ─────────────────────────────────────────────────────────────

async function reconcilePayment(payment: StuckPayment): Promise<ReconcileOutcome> {
  const { reference, userId: hintUserId } = payment;

  // Idempotency: skip if already recorded
  const existing = await db.execute<{ cnt: string }>(sql`
    SELECT COUNT(*)::int AS cnt
    FROM payment_transactions
    WHERE platform_transaction_id = ${reference}
       OR metadata->>'reference' = ${reference}
  `);
  const alreadyExists = parseInt(((existing as any).rows?.[0]?.cnt ?? "0"), 10) > 0;
  if (alreadyExists) {
    return { reference, userId: hintUserId, result: "already_recorded" };
  }

  if (DRY_RUN) {
    return { reference, userId: hintUserId, result: "dry_run_skipped" };
  }

  // Verify with Paystack — must be a successful charge
  let verification: Awaited<ReturnType<typeof billingService.verifyPaystackTransaction>>;
  try {
    verification = await billingService.verifyPaystackTransaction(reference);
  } catch (err: any) {
    return { reference, userId: hintUserId, result: "verify_failed", detail: String(err) };
  }

  if (!verification.valid) {
    return {
      reference,
      userId: hintUserId,
      result: "verify_failed",
      detail: verification.error ?? "Paystack returned invalid status",
    };
  }

  // Resolve user: prefer metadata.user_id, fall back to customer email
  const user = await resolveUserForReconciliation(
    { subscription: verification.subscription as any },
    storage,
  );

  if (!user) {
    await billingService.recordBillingEvent(null, "manual_reconciliation_failed", {
      reference,
      reason: "no_user_id_and_no_matching_email",
      customer_email: (verification.subscription as any)?.customer?.email ?? null,
    });
    return { reference, userId: null, result: "user_not_found" };
  }

  // Process subscription using the same path the webhook uses
  try {
    const subscription = await billingService.processPaystackSubscription(user.id, reference);

    await billingService.recordBillingEvent(user.id, "manual_payment_reconciliation", {
      reference,
      subscription_id: subscription.id,
      plan_id: subscription.planId,
      status: subscription.status,
      reconciled_at: new Date().toISOString(),
      source: "audit_and_fix_stuck_payments_script",
    });

    return { reference, userId: user.id, result: "reconciled" };
  } catch (err: any) {
    await billingService.recordBillingEvent(user.id, "manual_reconciliation_error", {
      reference,
      error: String(err),
      source: "audit_and_fix_stuck_payments_script",
    });
    return {
      reference,
      userId: user.id,
      result: "process_failed",
      detail: String(err),
    };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("Simple Slips — Stuck Payment Audit & Fix");
  console.log(DRY_RUN ? "MODE: DRY RUN (no changes will be made)" : "MODE: LIVE (will fix affected customers)");
  console.log("=".repeat(60));

  // Phase 1: audit
  console.log("\n[1/2] Scanning billing_events for stuck payments...");
  const stuck = await findStuckPayments();

  if (stuck.length === 0) {
    console.log("✓ No stuck payments found. All customers are accounted for.");
    return;
  }

  console.log(`\nFound ${stuck.length} candidate(s):\n`);
  for (const p of stuck) {
    console.log(
      `  • ref=${p.reference}  signal=${p.signal}  userId=${p.userId ?? "unknown"}  date=${p.eventCreatedAt}`,
    );
  }

  // Phase 2: fix
  console.log("\n[2/2] Reconciling each reference...\n");

  const outcomes: ReconcileOutcome[] = [];
  for (const payment of stuck) {
    const outcome = await reconcilePayment(payment);
    outcomes.push(outcome);

    const icon =
      outcome.result === "reconciled"
        ? "✓"
        : outcome.result === "already_recorded"
          ? "–"
          : outcome.result === "dry_run_skipped"
            ? "○"
            : "✗";

    console.log(
      `  ${icon} ref=${outcome.reference}  user=${outcome.userId ?? "n/a"}  result=${outcome.result}${outcome.detail ? `  (${outcome.detail})` : ""}`,
    );
  }

  // Summary
  const reconciled = outcomes.filter((o) => o.result === "reconciled");
  const alreadyRecorded = outcomes.filter((o) => o.result === "already_recorded");
  const skipped = outcomes.filter((o) => o.result === "dry_run_skipped");
  const failed = outcomes.filter(
    (o) => o.result === "verify_failed" || o.result === "user_not_found" || o.result === "process_failed",
  );

  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`  Total candidates found : ${stuck.length}`);
  console.log(`  Fixed (reconciled)     : ${reconciled.length}`);
  console.log(`  Already recorded       : ${alreadyRecorded.length}`);
  console.log(`  Dry-run skipped        : ${skipped.length}`);
  console.log(`  Could not fix          : ${failed.length}`);

  if (reconciled.length > 0) {
    console.log("\nCustomers made whole:");
    for (const o of reconciled) {
      console.log(`  • userId=${o.userId}  ref=${o.reference}`);
    }
  }

  if (failed.length > 0) {
    console.log("\nReferences that need manual attention:");
    for (const o of failed) {
      console.log(`  • ref=${o.reference}  reason=${o.result}  detail=${o.detail ?? "—"}`);
    }
  }

  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[audit-and-fix] Fatal error:", err);
    process.exit(1);
  });
