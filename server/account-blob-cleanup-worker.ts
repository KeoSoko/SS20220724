import { pool } from "./db";
import { azureStorage } from "./azure-storage";
import { log } from "./vite";

const MAX_ATTEMPTS = 5;
let workerTimer: ReturnType<typeof setInterval> | null = null;
let running = false;

export interface BlobDeleter { deleteFile(blobName: string): Promise<void> }
export interface CleanupDb {
  query(sql: string, values?: unknown[]): Promise<{ rows: Array<{ id: string; blob_name: string; attempt_count: number }> }>;
}
export interface CleanupWorkerDependencies { db: CleanupDb; blobDeleter: BlobDeleter }

const defaultDependencies: CleanupWorkerDependencies = { db: pool, blobDeleter: azureStorage };
const safeErrorCode = (error: unknown) => {
  const candidate = error as { code?: string; statusCode?: number; status?: number };
  if (candidate?.statusCode === 404 || candidate?.status === 404 || candidate?.code === "BlobNotFound") return "NOT_FOUND";
  return "TRANSIENT_DELETE_FAILURE";
};

async function claimNextJob(db: CleanupDb) {
  const result = await db.query(
    `UPDATE account_blob_cleanup_jobs
        SET status = 'processing', attempt_count = attempt_count + 1, updated_at = now()
      WHERE id = (
        SELECT id FROM account_blob_cleanup_jobs
         WHERE (
           (status = 'queued' AND (next_attempt_at IS NULL OR next_attempt_at <= now()))
           OR (status = 'processing' AND updated_at <= now() - interval '5 minutes')
         )
           AND attempt_count < $1
         ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
      ) RETURNING id, blob_name, attempt_count`,
    [MAX_ATTEMPTS],
  );
  return result.rows[0] ?? null;
}

export async function processAccountBlobCleanupQueue(deps: CleanupWorkerDependencies = defaultDependencies): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (let processed = 0; processed < 3; processed += 1) {
      const job = await claimNextJob(deps.db);
      if (!job) break;
      try {
        await deps.blobDeleter.deleteFile(job.blob_name);
        await deps.db.query(
          "UPDATE account_blob_cleanup_jobs SET status = 'completed', completed_at = now(), last_error_code = NULL, updated_at = now() WHERE id = $1 AND status = 'processing'",
          [job.id],
        );
      } catch (error) {
        const code = safeErrorCode(error);
        if (code === "NOT_FOUND") {
          await deps.db.query(
            "UPDATE account_blob_cleanup_jobs SET status = 'completed', completed_at = now(), last_error_code = 'NOT_FOUND', updated_at = now() WHERE id = $1",
            [job.id],
          );
          continue;
        }
        const final = Number(job.attempt_count) >= MAX_ATTEMPTS;
        const seconds = Math.min(3600, 30 * 2 ** Math.max(0, Number(job.attempt_count) - 1));
        await deps.db.query(
          `UPDATE account_blob_cleanup_jobs
              SET status = $2, last_error_code = 'TRANSIENT_DELETE_FAILURE',
                  next_attempt_at = now() + ($3 * interval '1 second'), updated_at = now()
            WHERE id = $1`,
          [job.id, final ? "failed" : "queued", seconds],
        );
        // IDs and safe codes only; blob names can encode customer data.
        log(`Account blob cleanup failed jobId=${job.id} code=TRANSIENT_DELETE_FAILURE`, "cleanup");
        break;
      }
    }
  } finally {
    running = false;
  }
}

export function startAccountBlobCleanupWorker(): void {
  if (workerTimer) return;
  void processAccountBlobCleanupQueue();
  workerTimer = setInterval(() => void processAccountBlobCleanupQueue(), 30_000);
}