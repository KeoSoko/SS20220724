import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const { getProperties, setAccessTier, create, sign, log } = vi.hoisted(() => ({
  getProperties: vi.fn(), setAccessTier: vi.fn(), create: vi.fn(),
  sign: vi.fn(() => ({ toString: () => "sp=r&sig=private" })), log: vi.fn(),
}));
vi.mock("./vite", () => ({ log }));
vi.mock("@azure/storage-blob", () => ({
  BlobServiceClient: class {
    static fromConnectionString() { return new this(); }
    getContainerClient() {
      return { create, getBlockBlobClient: () => ({
        getProperties, setAccessTier,
        url: "https://example.blob.core.windows.net/receipt-images/image.jpg",
      }) };
    }
  },
  StorageSharedKeyCredential: class {},
  BlobSASPermissions: { parse: (value: string) => value },
  generateBlobSASQueryParameters: sign,
}));
import { AzureBlobStorage } from "./azure-storage";

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("AZURE_STORAGE_CONNECTION_STRING", "AccountName=example;AccountKey=fake-test-key");
});

describe("bounded private receipt image link resolution", () => {
  it("signs read-only access after inspection without logging the link or changing storage", async () => {
    getProperties.mockResolvedValue({ accessTier: "Hot" });
    const result = await new AzureBlobStorage().resolveReceiptImageLink("image.jpg");
    expect(result.status).toBe("available");
    expect(sign).toHaveBeenCalledWith(expect.objectContaining({
      permissions: "r", containerName: "receipt-images", blobName: "image.jpg",
    }), expect.anything());
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/sig=|fake-test-key/);
    expect(create).not.toHaveBeenCalled();
    expect(setAccessTier).not.toHaveBeenCalled();
  });

  it.each([
    [{ accessTier: "Archive" }, "archived"],
    [{ accessTier: "Archive", archiveStatus: "rehydrate-pending-to-hot" }, "rehydrating"],
  ])("does not sign or mutate unavailable archive content", async (properties, status) => {
    getProperties.mockResolvedValue(properties);
    expect(await new AzureBlobStorage().resolveReceiptImageLink("image.jpg")).toEqual({ status });
    expect(sign).not.toHaveBeenCalled();
    expect(setAccessTier).not.toHaveBeenCalled();
  });

  it.each([[404, "missing"], [401, "inaccessible"], [403, "inaccessible"], [429, "temporarily_unavailable"], [500, "temporarily_unavailable"]])(
    "classifies Azure %s without exposing provider details", async (statusCode, status) => {
      getProperties.mockRejectedValue({ statusCode, message: "private?sig=secret" });
      expect(await new AzureBlobStorage().resolveReceiptImageLink("image.jpg")).toEqual({ status });
      expect(sign).not.toHaveBeenCalled();
      expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
    },
  );

  it("returns missing configuration even when the app starts without storage credentials", async () => {
    for (const key of ["AZURE_STORAGE_CONNECTION_STRING", "AZURE_STORAGE_ACCOUNT_NAME", "AZURE_STORAGE_ACCOUNT_KEY", "SLIPSSTOR1_STORAGE_ACCOUNT_NAME", "SLIPSSTOR1_STORAGE_ACCOUNT_KEY"]) vi.stubEnv(key, "");
    expect(await new AzureBlobStorage().resolveReceiptImageLink("image.jpg")).toEqual({ status: "configuration_unavailable" });
    expect(getProperties).not.toHaveBeenCalled();
  });

  it("returns within its timeout even if the provider ignores cancellation", async () => {
    getProperties.mockImplementation(() => new Promise(() => {}));
    expect(await new AzureBlobStorage().resolveReceiptImageLink("image.jpg", 5)).toEqual({ status: "temporarily_unavailable" });
    expect(getProperties.mock.calls[0][0].abortSignal.aborted).toBe(true);
    expect(sign).not.toHaveBeenCalled();
  });

  it("keeps the production CommonJS compatibility banner and excludes refresh bodies from request logs", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    expect(pkg.scripts.build).toContain("createRequire as __cjsRequire");
    expect(pkg.scripts.build).toContain("const require=__cjsRequire(import.meta.url)");
    const index = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
    expect(index).toContain('!path.endsWith("/refresh-image-url")');
    const worker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
    expect(worker).toContain('/^\\/api\\/receipts\\/[^/]+\\/refresh-image-url$/');
  });
});
