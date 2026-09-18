import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface Preview {
  outcome: "ready_for_confirmation" | "verify_previous_attempt_only";
  userId: number; subscriptionId: number; invoiceCode: string;
  amount: number; currency: string; mode: "live" | "test"; reference: string; periodEnd: string;
  recurringSubscriptionMutation: string; confirmationToken: string;
}

export function AdminCatchupPanel() {
  const [userId, setUserId] = useState("");
  const [subscriptionId, setSubscriptionId] = useState("");
  const [invoiceCode, setInvoiceCode] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [expiresAt, setExpiresAt] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  useEffect(() => { const timer = window.setInterval(() => setClock(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const clearPreview = () => { setPreview(null); setConfirmOpen(false); setMessage(""); };
  const validInput = /^\d+$/.test(userId) && Number.isSafeInteger(Number(userId)) && Number(userId) > 0
    && /^\d+$/.test(subscriptionId) && Number.isSafeInteger(Number(subscriptionId)) && Number(subscriptionId) > 0
    && /^INV_[A-Za-z0-9]+$/.test(invoiceCode);
  const fresh = !!preview && clock < expiresAt;
  async function inspect() {
    if (lock.current || !validInput) return;
    lock.current = true; setBusy(true); clearPreview();
    // Conservative client expiry starts BEFORE the request; server also verifies expiry.
    const deadline = Date.now() + 5 * 60_000;
    try {
      const response = await apiRequest("POST", `/api/admin/users/${Number(userId)}/paystack-catchup/preview`, { subscriptionId: Number(subscriptionId), invoiceCode });
      const result: Preview = await response.json();
      if (!["ready_for_confirmation", "verify_previous_attempt_only"].includes(result.outcome)
        || !["live", "test"].includes(result.mode) || result.amount !== 4900 || result.currency !== "ZAR" || result.recurringSubscriptionMutation !== "none"
        || result.userId !== Number(userId) || result.subscriptionId !== Number(subscriptionId)
        || result.invoiceCode !== invoiceCode || !result.confirmationToken || !Number.isFinite(Date.parse(result.periodEnd))) throw new Error("Unexpected preview. Stop and review the account.");
      setPreview(result); setExpiresAt(deadline); setClock(Date.now());
    } catch (error) { setMessage(error instanceof Error ? error.message : "Preview unavailable. Nothing was submitted for charging."); }
    finally { lock.current = false; setBusy(false); }
  }
  async function execute() {
    if (lock.current || !preview || Date.now() >= expiresAt) return;
    lock.current = true; setBusy(true); setConfirmOpen(false);
    const approved = preview;
    setPreview(null); // Consume confirmation even on network failure. NEVER automatically retry.
    try {
      const response = await apiRequest("POST", `/api/admin/users/${approved.userId}/paystack-catchup/execute`, {
        subscriptionId: approved.subscriptionId, invoiceCode: approved.invoiceCode,
        confirmationToken: approved.confirmationToken, confirmed: true,
      });
      const result = await response.json();
      setMessage(result.outcome === "payment_and_access_applied"
        ? `Payment verified and access reconciled. Reference: ${approved.reference}`
        : `Not confirmed settled: ${result.outcome ?? "unknown result"}. Reference: ${approved.reference}. Do not initiate another charge; request a fresh preview for verification or contact support.`);
    } catch {
      setMessage(`Execution could not be confirmed. Reference: ${approved.reference}. A charge may have occurred. Do not retry the charge or use another invoice; request a fresh preview to verify the existing attempt.`);
    } finally { lock.current = false; setBusy(false); }
  }
  return <Card><CardHeader><CardTitle>One-off renewal catch-up</CardTitle></CardHeader><CardContent className="space-y-4">
    <p className="text-sm text-muted-foreground">Admin-only R49 monthly recovery. Preview does not charge. The server requires an enabled feature flag and user allowlist; this panel cannot enable them. Existing recurring subscriptions remain unchanged.</p>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="text-sm">User ID<Input disabled={busy} inputMode="numeric" value={userId} onChange={event => { clearPreview(); setUserId(event.target.value); }} /></label>
      <label className="text-sm">Local subscription ID<Input disabled={busy} inputMode="numeric" value={subscriptionId} onChange={event => { clearPreview(); setSubscriptionId(event.target.value); }} /></label>
      <label className="text-sm">Failed invoice code<Input disabled={busy} value={invoiceCode} onChange={event => { clearPreview(); setInvoiceCode(event.target.value.trim()); }} /></label>
    </div>
    <Button variant="outline" disabled={busy || !validInput} onClick={inspect}>{busy ? "Checking…" : "Preview / verify existing attempt"}</Button>
    {message && <p role="status" className="break-words rounded border p-3 text-sm">{message}</p>}
    {preview && <div className="space-y-2 rounded border p-3 text-sm">
      <p>User #{preview.userId} · Subscription #{preview.subscriptionId} · {preview.invoiceCode}</p>
      <p>Environment: {preview.mode.toUpperCase()} · Amount: R49.00 ZAR · Access through: {new Date(preview.periodEnd).toLocaleString()}</p>
      <p className="break-all">Reference: {preview.reference}</p>
      <p>{preview.outcome === "verify_previous_attempt_only" ? "Existing attempt: verification/reconciliation only. No new charge will be submitted." : "One R49 charge attempt, followed by independent verification."}</p>
      {!fresh && <p role="alert">Preview expired. Request a fresh preview.</p>}
      <Button disabled={!fresh || busy} onClick={() => setConfirmOpen(true)}>{preview.outcome === "verify_previous_attempt_only" ? "Review verification" : "Review R49 charge"}</Button>
    </div>}
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{preview?.outcome === "verify_previous_attempt_only" ? "Verify existing attempt?" : `Confirm one ${preview?.mode.toUpperCase()} R49 charge?`}</AlertDialogTitle>
        <AlertDialogDescription>User #{preview?.userId}, local subscription #{preview?.subscriptionId}, invoice {preview?.invoiceCode}. {preview?.outcome === "verify_previous_attempt_only" ? "This only verifies/reconciles the existing attempt." : "This submits a live or test charge according to the server credential. Confirm only after reviewing the customer and invoice."} The recurring subscription will not be modified.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><Button disabled={!fresh || busy} onClick={execute}>{preview?.outcome === "verify_previous_attempt_only" ? "Confirm verification only" : "Confirm R49 charge"}</Button></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </CardContent></Card>;
}
