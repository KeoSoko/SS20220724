import { randomUUID } from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { exportJobs } from "@shared/schema";
import { azureStorage } from "./azure-storage";
import { exportService } from "./export-service";
import { normalizeReceiptExportDateRange } from "./export-date-range";
import { createServerLogger } from "./logger";

const logger = createServerLogger("background-export");
const LEASE_MINUTES = 20;
const FILE_LIFETIME_DAYS = 7;
const MAX_ATTEMPTS = 3;

const requestSchema = z.object({
  type: z.enum(["csv", "pdf", "tax-report"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  category: z.string().trim().min(1).max(120).optional(),
  includeSummary: z.boolean().optional(),
  includeImages: z.boolean().optional(),
  groupBy: z.enum(["category", "date"]).optional(),
  taxYear: z.number().int().min(2000).max(2200).optional(),
}).strict();

export type BackgroundExportRequest = z.infer<typeof requestSchema>;

let schemaPromise: Promise<void> | null = null;
let workerTimer: ReturnType<typeof setInterval> | null = null;
let workerRunning = false;

export function validateBackgroundExportRequest(input: unknown): BackgroundExportRequest {
  return requestSchema.parse(input);
}

export async function ensureBackgroundExportSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = db.execute(sql`
      CREATE TABLE IF NOT EXISTS export_jobs (
        id uuid PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type text NOT NULL,
        status text NOT NULL DEFAULT 'queued',
        parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
        file_name text,
        content_type text,
        blob_name text,
        result_summary jsonb,
        error_message text,
        attempt_count integer NOT NULL DEFAULT 0,
        lease_expires_at timestamp,
        expires_at timestamp,
        started_at timestamp,
        completed_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS export_jobs_queue_idx ON export_jobs (status, created_at);
      CREATE INDEX IF NOT EXISTS export_jobs_user_created_idx ON export_jobs (user_id, created_at DESC);
    `).then(() => undefined).catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }
  return schemaPromise;
}

function publicJob(job: typeof exportJobs.$inferSelect) {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    parameters: job.parameters,
    fileName: job.fileName,
    resultSummary: job.resultSummary,
    errorMessage: job.errorMessage,
    expiresAt: job.expiresAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

export async function createBackgroundExportJob(userId: number, input: unknown) {
  await ensureBackgroundExportSchema();
  const request = validateBackgroundExportRequest(input);
  const id = randomUUID();
  const [job] = await db.insert(exportJobs).values({
    id,
    userId,
    type: request.type,
    parameters: request,
  }).returning();
  void processBackgroundExportQueue();
  return publicJob(job);
}

export async function listBackgroundExportJobs(userId: number) {
  await ensureBackgroundExportSchema();
  const jobs = await db.select().from(exportJobs)
    .where(eq(exportJobs.userId, userId))
    .orderBy(desc(exportJobs.createdAt))
    .limit(20);
  return jobs.map(publicJob);
}

export async function getBackgroundExportJob(userId: number, id: string) {
  await ensureBackgroundExportSchema();
  const [job] = await db.select().from(exportJobs)
    .where(and(eq(exportJobs.userId, userId), eq(exportJobs.id, id)))
    .limit(1);
  return job ?? null;
}

async function claimNextJob() {
  const result = await db.execute(sql`
    UPDATE export_jobs
       SET status = 'processing',
           started_at = COALESCE(started_at, now()),
           lease_expires_at = now() + (${LEASE_MINUTES} * interval '1 minute'),
           attempt_count = attempt_count + 1,
           error_message = NULL,
           updated_at = now()
     WHERE id = (
       SELECT id
         FROM export_jobs
        WHERE (status = 'queued' OR (status = 'processing' AND lease_expires_at < now()))
          AND attempt_count < ${MAX_ATTEMPTS}
        ORDER BY created_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
     RETURNING *
  `);
  return (result as any).rows?.[0] ?? null;
}

function fileDateRange(parameters: BackgroundExportRequest): string {
  if (parameters.startDate && parameters.endDate) return `${parameters.startDate}-to-${parameters.endDate}`;
  if (parameters.startDate) return `from-${parameters.startDate}`;
  if (parameters.endDate) return `until-${parameters.endDate}`;
  return "all-dates";
}

async function generateJobFile(job: any) {
  const parameters = validateBackgroundExportRequest(job.parameters);
  const dateRange = normalizeReceiptExportDateRange(parameters.startDate, parameters.endDate);
  const common = { ...dateRange, category: parameters.category };

  if (parameters.type === "csv") {
    const csv = await exportService.exportReceiptsToCSV(job.user_id, common);
    return {
      buffer: Buffer.from(csv, "utf8"),
      contentType: "text/csv",
      extension: "csv",
      fileName: `receipts-${fileDateRange(parameters)}.csv`,
      summary: {},
    };
  }
  if (parameters.type === "tax-report") {
    const year = parameters.taxYear ?? new Date().getFullYear();
    const report = await exportService.generateTaxReport(job.user_id, year, common);
    return {
      buffer: report.pdf,
      contentType: "application/pdf",
      extension: "pdf",
      fileName: `tax-report-${fileDateRange(parameters)}.pdf`,
      summary: report.summary,
    };
  }

  const report = await exportService.exportReceiptsToPDF(job.user_id, {
    ...common,
    includeSummary: parameters.includeSummary,
    includeImages: parameters.includeImages,
    groupBy: parameters.groupBy,
  });
  return {
    buffer: report.pdf,
    contentType: "application/pdf",
    extension: "pdf",
    fileName: `receipts-${fileDateRange(parameters)}.pdf`,
    summary: report.summary,
  };
}

async function processClaimedJob(job: any): Promise<boolean> {
  try {
    const file = await generateJobFile(job);
    const blobName = `exports/${job.user_id}/${job.id}.${file.extension}`;
    await azureStorage.uploadExportFile(file.buffer, blobName, file.contentType);
    await db.execute(sql`
      UPDATE export_jobs
         SET status = 'completed', file_name = ${file.fileName}, content_type = ${file.contentType},
             blob_name = ${blobName}, result_summary = ${JSON.stringify(file.summary)}::jsonb,
             completed_at = now(), expires_at = now() + (${FILE_LIFETIME_DAYS} * interval '1 day'),
             lease_expires_at = NULL, updated_at = now()
       WHERE id = ${job.id} AND status = 'processing'
    `);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const finalFailure = Number(job.attempt_count) >= MAX_ATTEMPTS;
    await db.execute(sql`
      UPDATE export_jobs
         SET status = ${finalFailure ? "failed" : "queued"}, error_message = ${message.slice(0, 500)},
             lease_expires_at = NULL, updated_at = now()
       WHERE id = ${job.id}
    `);
    logger.error(`Export job ${job.id} failed${finalFailure ? " permanently" : "; queued for retry"}: ${message}`);
    return false;
  }
}

export async function processBackgroundExportQueue(): Promise<void> {
  if (workerRunning) return;
  workerRunning = true;
  try {
    await ensureBackgroundExportSchema();
    for (let processed = 0; processed < 3; processed += 1) {
      const job = await claimNextJob();
      if (!job) break;
      const completed = await processClaimedJob(job);
      // Give transient dependencies time to recover instead of consuming every
      // retry for the same job in one worker pass.
      if (!completed) break;
    }
  } catch (error) {
    logger.error(`Background export worker failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    workerRunning = false;
  }
}

export function startBackgroundExportWorker(): void {
  if (workerTimer) return;
  void processBackgroundExportQueue();
  workerTimer = setInterval(() => void processBackgroundExportQueue(), 15_000);
  workerTimer.unref?.();
  logger.info("Background export worker started");
}
