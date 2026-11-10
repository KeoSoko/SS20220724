export type PaystackCardManagementState =
  | "hidden"
  | "ready"
  | "pending"
  | "disabled"
  | "review_required"
  | "unavailable";

export const CARD_MANAGEMENT_REFRESH_LIMIT = 6;
export const CARD_MANAGEMENT_REFRESH_INTERVAL_MS = 5000;

export function cardManagementExplanation(state: PaystackCardManagementState, exhausted: boolean): string {
  switch (state) {
    case "ready":
      return "Change your card securely on Paystack. This does not start another checkout.";
    case "disabled":
      return "Card updates are temporarily unavailable. Please contact support if you need to change your card.";
    case "review_required":
      return "We cannot safely identify your Paystack subscription. Please contact support before starting another checkout.";
    case "pending":
      return exhausted
        ? "Your payment is verified, but trusted subscription details are not available yet. Automatic refresh has stopped. Retry status or contact support; do not pay again to change your card."
        : "Your payment is verified. Card changes will become available once trusted subscription details arrive from Paystack.";
    default:
      return "Card-management status is temporarily unavailable. Retry status or contact support. Do not start another checkout to change your card.";
  }
}
