import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ pool: { query: vi.fn() } }));
vi.mock("./azure-storage", () => ({ azureStorage: { deleteFile: vi.fn() } }));
vi.mock("./vite", () => ({ log: vi.fn() }));

import { processAccountBlobCleanupQueue, startAccountBlobCleanupWorker } from "./account-blob-cleanup-worker";
import { pool } from "./db";
import { azureStorage } from "./azure-storage";
import { log } from "./vite";

describe("account blob cleanup worker", () => {
  let statements: string[];
  let jobs: any[];
  beforeEach(() => {
    vi.clearAllMocks();
    statements = [];
    jobs = [{ id: "job-1", blob_name: "receipts/a", attempt_count: 1 }];
  });
  afterEach(() => { vi.useRealTimers(); });
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

  it("contains a claim timeout, logs no sensitive details, and releases the running guard", async () => {
    const database = { query: vi.fn(async () => { throw new Error("timeout with private connection details"); }) };
    const deleter = { deleteFile: vi.fn(async () => undefined) };
    await expect(processAccountBlobCleanupQueue({ db: database, blobDeleter: deleter })).resolves.toBeUndefined();
    expect(database.query).toHaveBeenCalledTimes(1);
    expect(deleter.deleteFile).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("WORKER_RUN_FAILED"), "cleanup");
    expect(JSON.stringify(vi.mocked(log).mock.calls)).not.toContain("private connection details");

    await processAccountBlobCleanupQueue({ db: db(), blobDeleter: deleter });
    expect(deleter.deleteFile).toHaveBeenCalledWith("receipts/a");
  });

  it.each(["completion", "not-found completion", "retry scheduling"])(
    "contains database failures during %s and leaves the job recoverable",
    async (stage) => {
      const job = { id: "job-1", blob_name: "receipts/a", attempt_count: 1 };
      const database = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes("RETURNING id, blob_name")) return { rows: [job] };
          throw new Error("database unavailable");
        }),
      };
      const deleter = {
        deleteFile: vi.fn(async () => {
          if (stage === "not-found completion") throw { statusCode: 404 };
          if (stage === "retry scheduling") throw new Error("provider unavailable");
        }),
      };
      await expect(processAccountBlobCleanupQueue({ db: database, blobDeleter: deleter })).resolves.toBeUndefined();
      expect(log).toHaveBeenCalledWith(expect.stringContaining("WORKER_RUN_FAILED"), "cleanup");
      // No destructive queue cleanup or immediate retry loop on a database outage.
      expect(database.query.mock.calls.every(([sql]) => !/^\s*DELETE\b/i.test(sql))).toBe(true);
      expect(database.query.mock.calls.filter(([sql]) => sql.includes("RETURNING id, blob_name"))).toHaveLength(1);

      const recoveredDb = db();
      await processAccountBlobCleanupQueue({ db: recoveredDb, blobDeleter: { deleteFile: vi.fn(async () => undefined) } });
      expect(recoveredDb.query).toHaveBeenCalled();
      expect(statements.some((sql) => sql.includes("status = 'completed'"))).toBe(true);
    },
  );

  it("keeps the startup and scheduled worker alive after connection failures", async () => {
    vi.useFakeTimers();
    const query = vi.mocked(pool.query);
    query.mockRejectedValue(new Error("connection timeout"));
    startAccountBlobCleanupWorker();
    await vi.advanceTimersByTimeAsync(0);
    expect(query).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(query).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledTimes(2);

    query.mockResolvedValue({ rows: [], rowCount: 0, command: "UPDATE", oid: 0, fields: [] });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(query).toHaveBeenCalledTimes(3);
    expect(azureStorage.deleteFile).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(2);
    vi.clearAllTimers();
  });
});