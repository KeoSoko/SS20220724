import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { Receipt } from "@shared/schema";
import { receiptImageMessages, type ReceiptImageLinkResult } from "@shared/receipt-image-access";
import { apiRequest } from "@/lib/queryClient";
import { ReceiptImageController } from "@/lib/receipt-image-controller";

export function useReceiptImage(receiptId: number, receipt?: Receipt) {
  // Never hydrate a prior query's receipt during navigation.
  const current = receipt?.id === receiptId ? receipt : undefined;
  const embedded = current?.imageData || null;
  const blobName = current?.blobName || null;
  const storedUrl = current?.blobUrl || null;
  // Stored SAS changes are NOT identity changes for a durable blob reference.
  const identity = JSON.stringify([receiptId, blobName, embedded, blobName ? null : storedUrl]);
  const controller = useMemo(() => new ReceiptImageController(
    embedded || storedUrl,
    !!blobName && !embedded,
    async () => {
      try {
        const response = await apiRequest("GET", `/api/receipts/${receiptId}/refresh-image-url`);
        const result = await response.json();
        if (result.status !== "available" || typeof result.imageUrl !== "string") {
          throw new Error("Invalid image refresh response");
        }
        return result as ReceiptImageLinkResult;
      } catch (error) {
        const status = (error as { responseData?: { status?: string } })?.responseData?.status;
        if (status && status in receiptImageMessages && status !== "load_failed") {
          return { status } as ReceiptImageLinkResult;
        }
        return { status: "temporarily_unavailable" };
      }
    },
  ), [identity]);
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  useEffect(() => {
    controller.activate();
    if (!controller.state.url && blobName && !embedded) void controller.refresh(false);
    return () => controller.dispose();
  }, [controller]);
  return { ...state, controller, refresh: () => controller.refresh(true) };
}
