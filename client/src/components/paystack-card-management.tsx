import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import {
  CARD_MANAGEMENT_REFRESH_INTERVAL_MS,
  CARD_MANAGEMENT_REFRESH_LIMIT,
  cardManagementExplanation,
  type PaystackCardManagementState,
} from "@shared/paystack-card-management";

interface Props {
  state: PaystackCardManagementState;
  busy: boolean;
  fetching: boolean;
  refresh: () => Promise<unknown>;
  open: () => void;
}

export function PaystackCardManagement({ state, busy, fetching, refresh, open }: Props) {
  const [attempts, setAttempts] = useState(0);
  const exhausted = attempts >= CARD_MANAGEMENT_REFRESH_LIMIT;

  useEffect(() => {
    if (state !== "pending" || exhausted || fetching) return;
    const timer = window.setTimeout(() => {
      setAttempts(count => count + 1);
      void refresh();
    }, CARD_MANAGEMENT_REFRESH_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [state, exhausted, fetching, attempts, refresh]);

  if (state === "hidden") return null;
  return (
    <div className="space-y-2" data-testid="paystack-card-management">
      <Button
        variant="outline"
        size="sm"
        onClick={open}
        disabled={state !== "ready" || busy}
        aria-describedby="paystack-card-management-explanation"
        data-testid="button-change-paystack-payment-card"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        Change payment card
      </Button>
      <p id="paystack-card-management-explanation" className="text-sm text-muted-foreground" role="status">
        {cardManagementExplanation(state, exhausted)}
      </p>
      {(state === "unavailable" || (state === "pending" && exhausted)) && (
        <Button variant="outline" size="sm" disabled={fetching} onClick={() => {
          // A retry is one deliberate status read, not another polling cycle.
          void refresh();
        }}>
          {fetching ? "Refreshing status…" : "Retry status"}
        </Button>
      )}
      {state !== "ready" && (
        <a className="block text-sm underline" href="mailto:hello@simpleslips.co.za">Contact support</a>
      )}
    </div>
  );
}
