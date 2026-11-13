import { describe, expect, it, vi } from "vitest";
import { ReceiptImageController, cacheBustImageUrl } from "../client/src/lib/receipt-image-controller";
import { receiptImageMessages, type ReceiptImageLinkResult } from "@shared/receipt-image-access";
import { readFileSync } from "node:fs";

const stale = "https://storage.example/image.jpg?sig=expired";
const fresh = { status: "available", imageUrl: "https://storage.example/image.jpg?sig=fresh" } as const;
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe("receipt image recovery", () => {
  it("recovers an expired image, reporting recovery only after browser load", async () => {
    const resolve = vi.fn().mockResolvedValue(fresh);
    const controller = new ReceiptImageController(stale, true, resolve);
    controller.failed(stale);
    await settle();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(controller.state.url).toContain("sig=fresh");
    expect(controller.state.phase).toBe("loading");
    controller.loaded(controller.state.url!);
    expect(controller.state.phase).toBe("loaded");
  });

  it("stops after three automatic refreshes; manual retry still exits the placeholder", async () => {
    const resolve = vi.fn().mockResolvedValue(fresh);
    const controller = new ReceiptImageController(stale, true, resolve);
    for (let i = 0; i < 4; i++) {
      controller.failed(controller.state.url!);
      await settle();
    }
    expect(resolve).toHaveBeenCalledTimes(3);
    expect(controller.state.phase).toBe("failed");
    expect(controller.state.message).toBe(receiptImageMessages.load_failed);
    await controller.refresh();
    expect(resolve).toHaveBeenCalledTimes(4);
    expect(controller.state.phase).toBe("loading");
    controller.loaded(controller.state.url!);
    expect(controller.state.phase).toBe("loaded");
  });

  it("deduplicates simultaneous manual/automatic attempts and ignores old image events", async () => {
    let complete!: (result: ReceiptImageLinkResult) => void;
    const resolve = vi.fn(() => new Promise<ReceiptImageLinkResult>(r => { complete = r; }));
    const controller = new ReceiptImageController(stale, true, resolve);
    const first = controller.refresh();
    await controller.refresh();
    controller.failed(stale);
    expect(resolve).toHaveBeenCalledTimes(1);
    complete(fresh);
    await first;
    controller.failed(stale);
    controller.loaded(stale);
    expect(controller.state.phase).toBe("loading");
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("ignores late responses after navigation and gives a new receipt a fresh retry budget", async () => {
    let complete!: (result: ReceiptImageLinkResult) => void;
    const old = new ReceiptImageController(stale, true, () => new Promise(r => { complete = r; }));
    const pending = old.refresh();
    old.dispose();
    const next = new ReceiptImageController("https://storage.example/next.jpg", true, async () => fresh);
    complete(fresh);
    await pending;
    expect(old.state.url).toBe(stale);
    expect(next.state.url).toBe("https://storage.example/next.jpg");
    next.failed(next.state.url!);
    await settle();
    expect(next.state.phase).toBe("loading");
  });

  it("replacement attachments cannot be overwritten by a late refresh", async () => {
    let complete!: (result: ReceiptImageLinkResult) => void;
    const controller = new ReceiptImageController(stale, true, () => new Promise(r => { complete = r; }));
    const pending = controller.refresh();
    controller.replace("data:image/png;base64,new");
    complete(fresh);
    await pending;
    expect(controller.state.url).toBe("data:image/png;base64,new");
  });

  it.each(["missing", "configuration_unavailable", "inaccessible", "archived", "rehydrating", "temporarily_unavailable"] as const)(
    "shows %s failures and permits another manual attempt", async (status) => {
      const resolve = vi.fn().mockResolvedValue({ status });
      const controller = new ReceiptImageController(stale, true, resolve);
      await controller.refresh();
      expect(controller.state.phase).toBe("failed");
      expect(controller.state.message).toBe(receiptImageMessages[status]);
      resolve.mockResolvedValue(fresh);
      await controller.refresh();
      expect(controller.state.phase).toBe("loading");
    },
  );

  it("shows network failures rather than silently suppressing them", async () => {
    const controller = new ReceiptImageController(stale, true, async () => { throw new Error("offline"); });
    await controller.refresh();
    expect(controller.state.message).toBe(receiptImageMessages.temporarily_unavailable);
  });

  it("does not retry embedded images or receipts without blob references", async () => {
    const resolve = vi.fn();
    const controller = new ReceiptImageController("data:image/png;base64,bad", false, resolve);
    controller.failed(controller.state.url!);
    await controller.refresh();
    expect(resolve).not.toHaveBeenCalled();
    expect(controller.state.message).toBe(receiptImageMessages.load_failed);
    expect(new ReceiptImageController(null, false, resolve).state.phase).toBe("missing");
  });

  it("adds cache parameters without corrupting query strings or fragments", () => {
    expect(cacheBustImageUrl("https://example.com/a#preview", 1)).toBe("https://example.com/a?cache=1#preview");
    expect(cacheBustImageUrl("https://example.com/a?sig=a%2Bb&cache=old", 2)).toBe("https://example.com/a?sig=a%2Bb&cache=2");
    expect(() => cacheBustImageUrl("javascript:alert(1)", 1)).toThrow();
  });

  it("separates receipt form hydration from image state and retains the controller across same-blob refetches", () => {
    const hook = readFileSync(new URL("../client/src/hooks/use-receipt-image.ts", import.meta.url), "utf8");
    const page = readFileSync(new URL("../client/src/pages/receipt/[id].tsx", import.meta.url), "utf8");
    expect(hook).toContain("receipt?.id === receiptId");
    expect(hook).toContain("blobName ? null : storedUrl");
    expect(hook).toContain("), [identity])");
    expect(page).not.toContain("setImageUrl");
    expect(page).not.toContain("cloud storage is configured");
  });
});
