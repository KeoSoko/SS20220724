import { receiptImageMessages, type ReceiptImageLinkResult } from "@shared/receipt-image-access";

export type ImageState = {
  url: string | null;
  phase: "loading" | "loaded" | "refreshing" | "failed" | "missing";
  message: string | null;
};

export function cacheBustImageUrl(value: string, nonce: number): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Invalid image link");
  url.searchParams.set("cache", String(nonce));
  return url.toString();
}

/** One controller per receipt/blob identity. All refreshed links stay in memory. */
export class ReceiptImageController {
  state: ImageState;
  private listeners = new Set<() => void>();
  private automaticAttempts = 0;
  private inFlight = false;
  private generation = 0;
  private nonce = 0;
  private disposed = false;
  static readonly MAX_AUTOMATIC_ATTEMPTS = 3;

  constructor(
    url: string | null,
    private canRefresh: boolean,
    private resolve: () => Promise<ReceiptImageLinkResult>,
  ) {
    this.state = { url, phase: url ? "loading" : canRefresh ? "loading" : "missing", message: url || canRefresh ? null : receiptImageMessages.missing };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  snapshot = () => this.state;
  private update(state: ImageState) {
    if (this.disposed) return;
    this.state = state;
    this.listeners.forEach(listener => listener());
  }
  activate() { this.disposed = false; }
  dispose() { this.disposed = true; this.generation++; this.inFlight = false; }

  replace(url: string) {
    this.generation++;
    this.inFlight = false;
    this.automaticAttempts = 0;
    this.update({ url, phase: "loading", message: null });
  }

  loaded(url: string) {
    if (url !== this.state.url || this.state.phase !== "loading") return;
    this.update({ ...this.state, phase: "loaded", message: null });
  }

  failed(url: string) {
    if (url !== this.state.url || this.state.phase !== "loading") return;
    this.update({ ...this.state, phase: "failed", message: receiptImageMessages.load_failed });
    void this.refresh(false);
  }

  async refresh(manual = true) {
    if (this.disposed || this.inFlight || !this.canRefresh) return;
    if (!manual && this.automaticAttempts >= ReceiptImageController.MAX_AUTOMATIC_ATTEMPTS) return;
    if (!manual) this.automaticAttempts++;
    this.inFlight = true;
    const generation = ++this.generation;
    this.update({ ...this.state, phase: "refreshing", message: null });
    try {
      const result = await this.resolve();
      if (this.disposed || generation !== this.generation) return;
      if (result.status === "available") {
        const url = cacheBustImageUrl(result.imageUrl, Date.now() + ++this.nonce);
        this.update({ url, phase: "loading", message: null });
      } else {
        this.update({ ...this.state, phase: "failed", message: receiptImageMessages[result.status] });
      }
    } catch {
      if (!this.disposed && generation === this.generation) {
        this.update({ ...this.state, phase: "failed", message: receiptImageMessages.temporarily_unavailable });
      }
    } finally {
      if (generation === this.generation) this.inFlight = false;
    }
  }
}
