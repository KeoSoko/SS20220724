import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, ArrowLeft, CheckCircle, CreditCard, RefreshCw, Search, ShieldAlert, UserRoundSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Queue = "urgent" | "identity" | "superseded" | "failed" | "review";
interface BillingItem { eventId?: number; userId: number; username: string; email: string | null; planName?: string | null; queue: Queue; severity: string; title: string; recommendedAction: string; nextBillingDate?: string | null; entitlementExpiresAt?: string | null; reference?: string | null; subscriptionCode?: string | null; customerCode?: string | null; planCode?: string | null; }
interface BillingOperationsData { generatedAt: string; summary: Record<Queue, number> & { activeAccounts: number }; items: BillingItem[]; recentlyRepaired: Array<{ eventId: number; userId: number; username: string; email: string | null; eventType: string; createdAt: string; reference: string | null }>; capabilities: { readOnly: boolean; settlement: boolean; cancellation: boolean; providerMutation: string }; }
interface SubscriptionCandidate { subscriptionCode: string; customerCode: string | null; planCode: string | null; status: string; providerCreatedAt: string | null; nextPaymentDate: string | null; providerLookupFailed: boolean; }
interface CandidateInspection { userId: number; customerCode: string; expectedPlanCode: string | null; activeSubscriptionCode: string | null; candidates: SubscriptionCandidate[]; }

const labels: Record<Queue, string> = { urgent: "Verified paid renewals", identity: "Identity repair", superseded: "Old subscriptions", failed: "Payment failed", review: "Needs investigation" };

function IdentityRepairPanel({ item, onRepaired }: { item: BillingItem; onRepaired: () => Promise<unknown> }) {
  const [inspection, setInspection] = useState<CandidateInspection | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const inspect = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", `/api/admin/users/${item.userId}/paystack-subscription-candidates`);
      return response.json() as Promise<CandidateInspection>;
    },
    onSuccess: (result) => {
      setInspection(result);
      setSelectedCode(result.candidates.length === 1 ? result.candidates[0].subscriptionCode : null);
    },
    onError: (error: Error) => toast({ title: "Provider inspection stopped safely", description: error.message, variant: "destructive" }),
  });

  const execute = useMutation({
    mutationFn: async (subscriptionCode: string) => {
      const response = await apiRequest("POST", `/api/admin/users/${item.userId}/paystack-subscription-resolution`, {
        subscriptionCode,
        confirmed: true,
      });
      return response.json();
    },
    onSuccess: async () => {
      setConfirmOpen(false);
      toast({ title: "Identity repaired", description: `${item.username}'s verified Paystack identity is now recorded.` });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/command-center/billing-operations"] });
      await onRepaired();
    },
    onError: (error: Error) => toast({ title: "Repair was not applied", description: error.message, variant: "destructive" }),
  });

  const selected = inspection?.candidates.find(candidate => candidate.subscriptionCode === selectedCode) ?? null;
  const hasOneCandidate = inspection?.candidates.length === 1;
  const selectedIsExact = !!selected
    && hasOneCandidate
    && !selected.providerLookupFailed
    && selected.status === "active"
    && selected.customerCode === inspection?.customerCode
    && selected.planCode === inspection?.expectedPlanCode;

  if (!inspection) {
    return <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
      <p className="text-sm text-blue-900">Read-only provider inspection checks the stored customer and plan before showing any subscription.</p>
      <Button className="mt-3" size="sm" variant="outline" disabled={inspect.isPending} onClick={() => inspect.mutate()}>
        <UserRoundSearch className="mr-2 h-4 w-4" />{inspect.isPending ? "Inspecting…" : "Inspect Paystack"}
      </Button>
    </div>;
  }

  return <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
    <div className="text-sm text-blue-950">
      <p><strong>Expected:</strong> {inspection.customerCode} · {inspection.expectedPlanCode ?? "No local plan code"}</p>
      <p className="text-xs text-blue-800">Provider inspection is read-only. Each repair is revalidated by the server after confirmation.</p>
    </div>
    {inspection.candidates.length === 0 ? <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">No exact active provider relationship was found. This account remains unchanged and needs manual review.</div> : <div className="space-y-2">
      {inspection.candidates.length > 1 && <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">Multiple plausible subscriptions were found. No repair can be confirmed here; inspect the account manually.</div>}
      {inspection.candidates.map(candidate => {
        const exact = inspection.candidates.length === 1 && !candidate.providerLookupFailed && candidate.status === "active" && candidate.customerCode === inspection.customerCode && candidate.planCode === inspection.expectedPlanCode;
        return <label key={candidate.subscriptionCode} className={`flex gap-3 rounded border bg-white p-3 ${exact ? "cursor-pointer" : "cursor-not-allowed opacity-80"} ${selectedCode === candidate.subscriptionCode && exact ? "border-primary ring-1 ring-primary" : ""}`}>
          <input type="radio" name={`identity-${item.userId}`} disabled={!exact} checked={selectedCode === candidate.subscriptionCode && exact} onChange={() => setSelectedCode(candidate.subscriptionCode)} />
          <span className="min-w-0 flex-1 text-sm">
            <span className="flex flex-wrap items-center gap-2"><strong className="font-mono">{candidate.subscriptionCode}</strong><Badge variant={exact ? "secondary" : "destructive"}>{exact ? "Exact identity match" : "Blocked"}</Badge><Badge variant="outline">{candidate.status}</Badge></span>
            <span className="mt-1 block break-all text-xs text-muted-foreground">CUS: {candidate.customerCode ?? "missing"} · PLN: {candidate.planCode ?? "missing"}</span>
            <span className="block text-xs text-muted-foreground">Next charge: {candidate.nextPaymentDate ? new Date(candidate.nextPaymentDate).toLocaleString() : "Not supplied by Paystack"}</span>
          </span>
        </label>;
      })}
    </div>}
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={!selectedIsExact} onClick={() => setConfirmOpen(true)}>Review selected repair</Button>
      <Button size="sm" variant="ghost" disabled={inspect.isPending} onClick={() => inspect.mutate()}>Refresh provider evidence</Button>
    </div>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm identity repair</AlertDialogTitle>
          <AlertDialogDescription>This records one verified local identity for {item.username}. It does not charge, cancel, settle a payment, or change entitlement.</AlertDialogDescription>
        </AlertDialogHeader>
        {selected && <div className="rounded bg-muted p-3 font-mono text-xs space-y-1"><p>{selected.subscriptionCode}</p><p>{selected.customerCode}</p><p>{selected.planCode}</p><p>Status: {selected.status}</p></div>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={execute.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={!selectedIsExact || execute.isPending} onClick={(event) => { event.preventDefault(); if (selectedCode) execute.mutate(selectedCode); }}>{execute.isPending ? "Revalidating…" : "Confirm identity repair"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

export default function BillingOperations() {
  const [queue, setQueue] = useState<Queue | "all">("all");
  const [search, setSearch] = useState("");
  const { data, isLoading, refetch, isFetching } = useQuery<BillingOperationsData>({ queryKey: ["/api/admin/command-center/billing-operations"] });
  const items = useMemo(() => (data?.items ?? []).filter(item => {
    const matchesQueue = queue === "all" || item.queue === queue;
    const term = search.trim().toLowerCase();
    return matchesQueue && (!term || `${item.username} ${item.email ?? ""} ${item.userId}`.toLowerCase().includes(term));
  }), [data, queue, search]);

  return <div className="container mx-auto p-6 space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <Link href="/command-center"><Button variant="ghost" className="mb-2 -ml-3"><ArrowLeft className="h-4 w-4 mr-2" />Control Center</Button></Link>
        <h1 className="text-3xl font-bold flex items-center gap-2"><ShieldAlert className="h-8 w-8 text-primary" />Billing Operations</h1>
        <p className="text-muted-foreground">Customers who need attention, ordered by billing risk.</p>
      </div>
      <Button variant="outline" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />Refresh</Button>
    </div>
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><strong>Queue discovery is read-only.</strong> Provider inspection cannot charge or change Paystack. Identity repair requires individual confirmation and changes only the verified local identity plus its audit trail—never payments or customer access.</div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {(Object.keys(labels) as Queue[]).map(key => <Card key={key} className={`cursor-pointer ${queue === key ? "ring-2 ring-primary" : ""}`} onClick={() => setQueue(key)}><CardContent className="p-4"><p className="text-sm text-muted-foreground">{labels[key]}</p><p className="text-3xl font-bold mt-1">{data?.summary[key] ?? 0}</p></CardContent></Card>)}
    </div>
    <div className="flex flex-wrap gap-3">
      <Button variant={queue === "all" ? "default" : "outline"} onClick={() => setQueue("all")}>All queues</Button>
      <div className="relative flex-1 min-w-[240px]"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search name, email or user ID" value={search} onChange={event => setSearch(event.target.value)} /></div>
    </div>
    <Card><CardHeader><CardTitle>Accounts requiring attention</CardTitle></CardHeader><CardContent className="space-y-3">
      {isLoading ? <p className="text-muted-foreground">Loading billing evidence…</p> : items.length === 0 ? <div className="py-10 text-center"><CheckCircle className="h-10 w-10 mx-auto text-green-600 mb-2" /><p className="font-medium">No accounts in this queue</p></div> : items.map((item, index) => <div key={`${item.queue}-${item.userId}-${item.eventId ?? index}`} className="rounded-lg border p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{item.username} <span className="text-muted-foreground font-normal">#{item.userId}</span></p><p className="text-sm text-muted-foreground">{item.email ?? "No email"} · {item.planName ?? "Plan unavailable"}</p></div><Badge variant={item.severity === "critical" ? "destructive" : "secondary"}>{labels[item.queue]}</Badge></div>
        <div><p className="font-medium flex items-center gap-2">{item.queue === "identity" ? <UserRoundSearch className="h-4 w-4" /> : item.queue === "failed" ? <CreditCard className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{item.title}</p><p className="text-sm text-muted-foreground mt-1">Next safe action: {item.recommendedAction}</p></div>
        {item.queue === "identity" && <IdentityRepairPanel item={item} onRepaired={refetch} />}
        <details className="text-sm"><summary className="cursor-pointer text-primary">View technical details</summary><div className="mt-2 grid gap-1 rounded bg-muted p-3 font-mono text-xs"><span>Reference: {item.reference ?? "—"}</span><span>SUB: {item.subscriptionCode ?? "—"}</span><span>CUS: {item.customerCode ?? "—"}</span><span>PLN: {item.planCode ?? "—"}</span><span>Next billing: {item.nextBillingDate ? new Date(item.nextBillingDate).toLocaleString() : "—"}</span><span>Access expiry: {item.entitlementExpiresAt ? new Date(item.entitlementExpiresAt).toLocaleString() : "—"}</span></div></details>
      </div>)}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Recently repaired</CardTitle></CardHeader><CardContent>{(data?.recentlyRepaired ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No recent repair events.</p> : <div className="space-y-2">{data!.recentlyRepaired.map(item => <div key={item.eventId} className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm"><span>{item.username} #{item.userId} · {item.eventType.replaceAll("_", " ")}</span><span className="text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</span></div>)}</div>}</CardContent></Card>
  </div>;
}
