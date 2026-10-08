export type ReceiptImageAccessStatus =
  | "available" | "missing" | "configuration_unavailable" | "inaccessible"
  | "archived" | "rehydrating" | "temporarily_unavailable";

export type ReceiptImageLinkResult =
  | { status: "available"; imageUrl: string }
  | { status: Exclude<ReceiptImageAccessStatus, "available"> };

export const receiptImageMessages: Record<Exclude<ReceiptImageAccessStatus, "available"> | "load_failed", string> = {
  missing: "No receipt image was found. If you expected an attachment, contact support.",
  configuration_unavailable: "Receipt image storage is unavailable in this app deployment. Contact support.",
  inaccessible: "The app could not access receipt image storage. Contact support to check storage permissions and network access.",
  archived: "This receipt image is in archive storage. Contact support to arrange restoration; it may take several hours.",
  rehydrating: "This receipt image is being restored from archive storage. Restoration can take several hours. Try again later.",
  temporarily_unavailable: "The receipt image link could not be refreshed right now. Check your connection and try again.",
  load_failed: "Your browser could not load the receipt image. Its availability has not been confirmed. Try again or contact support.",
};
