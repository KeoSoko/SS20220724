export function isValidExportBlobPath(blobName: string): boolean {
  return /^exports\/\d+\/[0-9a-f-]+\.(csv|pdf)$/i.test(blobName);
}