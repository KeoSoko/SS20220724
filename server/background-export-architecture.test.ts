import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync(new URL("./background-export-service.ts", import.meta.url), "utf8");
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("../client/src/pages/exports-page.tsx", import.meta.url), "utf8");

describe("background export architecture", () => {
  it("claims jobs atomically with an expiring lease", () => {
    expect(service).toContain("FOR UPDATE SKIP LOCKED");
    expect(service).toContain("lease_expires_at < now()");
    expect(service).toContain("attempt_count <");
  });

  it("keeps stored blob names server-owned and download routes owner-scoped", () => {
    expect(service).toContain("`exports/${job.user_id}/${job.id}.${file.extension}`");
    expect(routes).toContain("getBackgroundExportJob(getUserId(req), req.params.jobId)");
    expect(routes).not.toContain("req.body.blobName");
  });

  it("uses the queue for downloads while retaining direct preview endpoints", () => {
    expect(client).toContain("fetch('/api/export/jobs'");
    expect(client).toContain("handlePreview('pdf')");
    expect(client).toContain("handlePreview('tax-report')");
    expect(routes).toContain('app.get("/api/export/pdf"');
  });
});
