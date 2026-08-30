export type AzureBlobInspectionStatus =
  | "available"
  | "archived"
  | "rehydrating"
  | "missing"
  | "inaccessible"
  | "temporarily_unavailable";

export interface AzureBlobInspectionResult {
  status: AzureBlobInspectionStatus;
  accessTier: string | null;
  archiveStatus: string | null;
  contentLength: number | null;
  contentType: string | null;
  lastModified: string | null;
}

export function classifyAzureBlobProperties(properties: {
  accessTier?: string;
  archiveStatus?: string;
  contentLength?: number;
  contentType?: string;
  lastModified?: Date;
}): AzureBlobInspectionResult {
  const accessTier = properties.accessTier ?? null;
  const archiveStatus = properties.archiveStatus ?? null;
  const status: AzureBlobInspectionStatus = archiveStatus
    ? "rehydrating"
    : accessTier?.toLowerCase() === "archive"
      ? "archived"
      : "available";
  return {
    status,
    accessTier,
    archiveStatus,
    contentLength: properties.contentLength ?? null,
    contentType: properties.contentType ?? null,
    lastModified: properties.lastModified?.toISOString() ?? null,
  };
}

export function classifyAzureBlobInspectionError(error: unknown): AzureBlobInspectionResult {
  const candidate = error as { statusCode?: number; name?: string; code?: string };
  const statusCode = candidate?.statusCode;
  const missing = statusCode === 404;
  const inaccessible = statusCode === 401 || statusCode === 403;
  return {
    status: missing ? "missing" : inaccessible ? "inaccessible" : "temporarily_unavailable",
    accessTier: null,
    archiveStatus: null,
    contentLength: null,
    contentType: null,
    lastModified: null,
  };
}
