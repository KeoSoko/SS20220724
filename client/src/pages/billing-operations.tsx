import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, ArrowLeft, CheckCircle, CreditCard, RefreshCw, Search, ShieldAlert, UserRoundSearch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Queue = "urgent" | "identity" | "superseded" | "failed" | "review";
interface BillingItem { eventId?: number; userId: number; username: string; email: string | null; planName?: string | null; queue: Queue; severity: string; title: string; recommendedAction: string; nextBillingDate?: string | null; entitlementExpiresAt?: string | null; reference?: string | null; subscriptionCode?: string | null; customerCode?: string | null; planCode?: string | null; }
interface BillingOperationsData { generatedAt: string; summary: Record<Queue, number> & { activeAccounts: number }; items: BillingItem[]; recentlyRepaired: Array<{ eventId: number; userId: number; username: string; email: string | null; eventType: string; createdAt: string; reference: string | null }>; capabilities: { readOnly: boolean; settlement: boolean; cancellation: boolean; providerMutation: string }; }

const labels: Record<Queue, string> = { urgent: "Urgent paid renewals", identity: "Identity repair", superseded: "Old subscriptions", failed: "Payment failed", review: "Manual review" };

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
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">Read-only safety mode: this page cannot charge, settle, cancel, or change customer access.</div>
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
        <details className="text-sm"><summary className="cursor-pointer text-primary">View technical details</summary><div className="mt-2 grid gap-1 rounded bg-muted p-3 font-mono text-xs"><span>Reference: {item.reference ?? "—"}</span><span>SUB: {item.subscriptionCode ?? "—"}</span><span>CUS: {item.customerCode ?? "—"}</span><span>PLN: {item.planCode ?? "—"}</span><span>Next billing: {item.nextBillingDate ? new Date(item.nextBillingDate).toLocaleString() : "—"}</span><span>Access expiry: {item.entitlementExpiresAt ? new Date(item.entitlementExpiresAt).toLocaleString() : "—"}</span></div></details>
      </div>)}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Recently repaired</CardTitle></CardHeader><CardContent>{(data?.recentlyRepaired ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No recent repair events.</p> : <div className="space-y-2">{data!.recentlyRepaired.map(item => <div key={item.eventId} className="flex flex-wrap justify-between gap-2 border-b py-2 text-sm"><span>{item.username} #{item.userId} · {item.eventType.replaceAll("_", " ")}</span><span className="text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</span></div>)}</div>}</CardContent></Card>
  </div>;
}
