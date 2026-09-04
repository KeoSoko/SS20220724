export const FIRST_SLIP_DISMISSED_KEY = "simple-slips:first-slip-dismissed";

export type FirstSlipEligibilityInput = {
  authenticated: boolean;
  queryLoaded: boolean;
  queryError: boolean;
  isOnline: boolean;
  pendingUploads: number;
  receiptCount: number;
  sessionDismissed: boolean;
};

export function isFirstSlipEligible(input: FirstSlipEligibilityInput): boolean {
  return input.authenticated &&
    input.queryLoaded &&
    !input.queryError &&
    input.isOnline &&
    input.pendingUploads === 0 &&
    input.receiptCount === 0 &&
    !input.sessionDismissed;
}

export function getFirstSlipSuccessId(input: {
  wasEligible: boolean;
  isOnline: boolean;
  savedReceiptId: unknown;
}): number | null {
  return input.wasEligible &&
    input.isOnline &&
    typeof input.savedReceiptId === "number"
    ? input.savedReceiptId
    : null;
}