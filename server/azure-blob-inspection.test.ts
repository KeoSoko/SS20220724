import { describe, expect, it } from "vitest";
import { classifyAzureBlobInspectionError, classifyAzureBlobProperties } from "./azure-blob-inspection";

describe("read-only Azure blob inspection classification", () => {
  it("separates available, archived and rehydrating objects", () => {
    expect(classifyAzureBlobProperties({ accessTier: "Hot" }).status).toBe("available");
    expect(classifyAzureBlobProperties({ accessTier: "Archive" }).status).toBe("archived");
    expect(classifyAzureBlobProperties({ accessTier: "Archive", archiveStatus: "rehydrate-pending-to-hot" }).status).toBe("rehydrating");
  });

  it("separates missing, inaccessible and temporary failures", () => {
    expect(classifyAzureBlobInspectionError({ statusCode: 404 }).status).toBe("missing");
    expect(classifyAzureBlobInspectionError({ statusCode: 403 }).status).toBe("inaccessible");
    expect(classifyAzureBlobInspectionError({ statusCode: 429 }).status).toBe("temporarily_unavailable");
    expect(classifyAzureBlobInspectionError({ name: "AbortError" }).status).toBe("temporarily_unavailable");
  });
});
