
export function validateReceiptId(id: unknown): number {
  const receiptId = Number(id);
  if (isNaN(receiptId) || receiptId <= 0) {
    throw new Error(`Invalid receipt ID: ${id}`);
  }
  return receiptId;
}
