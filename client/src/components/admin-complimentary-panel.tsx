import { useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
export function AdminComplimentaryPanel() {
  const [user, setUser] = useState(""); const [subscription, setSubscription] = useState("");
  const [expiry, setExpiry] = useState(""); const [reason, setReason] = useState("");
  const [review, setReview] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const lock = useRef(false);
  const valid = /^\d+$/.test(user) && Number(user) > 0 && /^\d+$/.test(subscription) && Number(subscription) > 0
    && /Z$/.test(expiry) && Number.isFinite(Date.parse(expiry)) && Date.parse(expiry) > Date.now() && reason.trim().length >= 10;
  async function grant() {
    if (lock.current || !valid) return;
    lock.current = true; setBusy(true); setReview(false);
    try {
      const response = await apiRequest("POST", `/api/admin/users/${Number(user)}/complimentary-access`, {
        subscriptionId: Number(subscription), expiresAt: expiry, reason, confirmed: true,
      });
      const result = await response.json();
      setMessage(result.outcome === "complimentary_access_granted" ? `Complimentary grant recorded through ${result.expiresAt}. No payment or billing schedule changed. Refresh the customer's session to verify effective access.` : "Grant not confirmed. Verify the audit record before resubmitting.");
    } catch { setMessage("Grant not confirmed. Check the account and audit record before resubmitting; do not assume access was granted."); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Card><CardHeader><CardTitle>Complimentary access — no payment received</CardTitle></CardHeader><CardContent className="space-y-3">
    <p className="text-sm">For paused accounts only. Grants premium access for up to 90 days without changing subscription status, payment history, totals or billing dates. Owner workspace members inherit access. Access expires automatically.</p>
    <label className="block text-sm">User ID<Input disabled={busy} value={user} onChange={e => setUser(e.target.value)} /></label>
    <label className="block text-sm">Local subscription ID<Input disabled={busy} value={subscription} onChange={e => setSubscription(e.target.value)} /></label>
    <label className="block text-sm">Expiry in UTC (ISO format ending Z)<Input disabled={busy} placeholder="2026-10-15T09:30:00Z" value={expiry} onChange={e => setExpiry(e.target.value)} /></label>
    <label className="block text-sm">Audit reason<Input disabled={busy} value={reason} onChange={e => setReason(e.target.value)} /></label>
    <Button disabled={!valid || busy} onClick={() => setReview(true)}>Review complimentary grant</Button>
    {message && <p role="status">{message}</p>}
    <AlertDialog open={review} onOpenChange={setReview}><AlertDialogContent><AlertDialogHeader>
      <AlertDialogTitle>Grant complimentary access?</AlertDialogTitle><AlertDialogDescription>User #{user}, subscription #{subscription}, expiry {expiry}. Reason: {reason}. This is goodwill access, not a received payment. Recurring billing remains unchanged.</AlertDialogDescription>
    </AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><Button disabled={!valid || busy} onClick={grant}>Confirm complimentary access</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </CardContent></Card>;
}
