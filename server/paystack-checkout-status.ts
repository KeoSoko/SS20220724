export function isDefinitivePaystackNonPaymentStatus(status: unknown): boolean {
  return typeof status === "string"
    && ["abandoned", "failed"].includes(status.trim().toLowerCase());
}
