import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ pool: {} }));
vi.mock("./azure-storage", () => ({ azureStorage: { deleteFile: vi.fn() } }));
vi.mock("./vite", () => ({ log: vi.fn() }));

import { processAccountBlobCleanupQueue } from "./account-blob-cleanup-worker";

describe("account blob cleanup worker", () => {
  let statements: string[];
  let jobs: any[];
  beforeEach(() => { statements = []; jobs = [{ id: "job-1", blob_name: "receipts/a", attempt_count: 1 }]; });
  const db = () => ({
    query: vi.fn(async (sql: string) => {
      statements.push(sql);
      if (sql.includes("RETURNING id, blob_name")) return { rows: jobs.length ? [jobs.shift()] : [] };
      return { rows: [] };
    }),
  });

  it("deletes a claimed blob and marks the job completed", async () => {
    const deleter = { deleteFile: vi.fn(async () => undefined) };
    await processAccountBlobCleanupQueue({ db: db(), blobDeleter: deleter });
    expect(deleter.deleteFile).toHaveBeenCalledWith("receipts/a");
    expect(statements.some((sql) => sql.includes("status = 'completed'"))).toBe(true);
  });

  it("treats an Azure not-found response as completed", async () => {
    const deleter = { deleteFile: vi.fn(async () => { throw { statusCode: 404 }; }) };
    await processAccountBlobCleanupQueue({ db: db(), blobDeleter: deleter });
    expect(statements.some((sql) => sql.includes("last_error_code = 'NOT_FOUND'"))).toBe(true);
  });

  it("requeues a transient failure with a safe code and backoff", async () => {
    const deleter = { deleteFile: vi.fn(async () => { throw new Error("provider details must not persist"); }) };
    await processAccountBlobCleanupQueue({ db: db(), blobDeleter: deleter });
    const retry = statements.find((sql) => sql.includes("TRANSIENT_DELETE_FAILURE"));
    expect(retry).toContain("next_attempt_at");
    expect(retry).not.toContain("provider details");
  });

  it("can reclaim a stale processing job after a worker interruption", async () => {
    const database = db();
    const deleter = { deleteFile: vi.fn(async () => undefined) };
    await processAccountBlobCleanupQueue({ db: database, blobDeleter: deleter });
    expect(statements[0]).toContain("status = 'processing'");
    expect(statements[0]).toContain("interval '5 minutes'");
  });
});