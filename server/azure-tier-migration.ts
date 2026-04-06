import { db } from './db.js';
import { receipts } from '../shared/schema.js';
import { isNotNull } from 'drizzle-orm';
import { azureStorage } from './azure-storage.js';
import { log } from './vite.js';

// Tier thresholds in days
const COOL_THRESHOLD_DAYS = 90;   // 3 months → move to Cool
const COLD_THRESHOLD_DAYS = 180;  // 6 months → move to Cold

function getTargetTier(createdAt: Date): 'Hot' | 'Cool' | 'Cold' {
  const ageMs = Date.now() - createdAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays >= COLD_THRESHOLD_DAYS) return 'Cold';
  if (ageDays >= COOL_THRESHOLD_DAYS) return 'Cool';
  return 'Hot';
}

/**
 * Migrate all receipt blobs to the correct storage tier based on receipt age.
 *   0–3 months  → Hot  (fast access, higher cost)
 *   3–6 months  → Cool (still instant, ~40% cheaper)
 *   6+ months   → Cold (cheapest, handled gracefully by parallel-fetch with timeout)
 *
 * Runs in small batches with a short pause between them to avoid overwhelming Azure.
 */
export async function runTierMigration(): Promise<void> {
  const startTime = Date.now();
  log('[TIER_MIGRATION] Starting blob tier migration run...', 'azure');

  try {
    // Fetch all receipts that have an Azure blob
    const allReceipts = await db
      .select({ id: receipts.id, blobName: receipts.blobName, createdAt: receipts.createdAt })
      .from(receipts)
      .where(isNotNull(receipts.blobName));

    const BATCH_SIZE = 10;
    let moved: Record<string, number> = { Hot: 0, Cool: 0, Cold: 0 };
    let skipped = 0;
    let errors = 0;

    for (let i = 0; i < allReceipts.length; i += BATCH_SIZE) {
      const batch = allReceipts.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (receipt) => {
        if (!receipt.blobName || !receipt.createdAt) { skipped++; return; }
        const blobName = receipt.blobName as string;
        if (blobName.toLowerCase().endsWith('.pdf')) { skipped++; return; }

        const targetTier = getTargetTier(new Date(receipt.createdAt));
        const ok = await azureStorage.setBlobTier(blobName, targetTier);
        if (ok) {
          moved[targetTier]++;
        } else {
          errors++;
        }
      }));

      // Small pause between batches to be gentle on the Azure API
      if (i + BATCH_SIZE < allReceipts.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    const durationMs = Date.now() - startTime;
    log(
      `[TIER_MIGRATION] Complete in ${(durationMs / 1000).toFixed(1)}s — ` +
      `Hot: ${moved.Hot}, Cool: ${moved.Cool}, Cold: ${moved.Cold}, ` +
      `skipped: ${skipped}, errors: ${errors}`,
      'azure'
    );
  } catch (error) {
    log(`[TIER_MIGRATION] Fatal error during migration: ${error}`, 'azure');
  }
}

/**
 * Start the nightly tier migration job.
 * Runs once immediately at startup (for the backfill), then every 24 hours.
 */
export function startTierMigrationMonitoring(intervalHours: number = 24): void {
  log(`[TIER_MIGRATION] Starting tier migration monitoring (every ${intervalHours} hours)`, 'azure');

  // Run once immediately to backfill existing blobs
  runTierMigration().catch(err => log(`[TIER_MIGRATION] Startup run error: ${err}`, 'azure'));

  // Then run on schedule
  setInterval(() => {
    runTierMigration().catch(err => log(`[TIER_MIGRATION] Scheduled run error: ${err}`, 'azure'));
  }, intervalHours * 60 * 60 * 1000);
}
