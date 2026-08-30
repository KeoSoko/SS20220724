import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, ArrowLeft, CheckCircle, Images, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";

type Severity = "critical" | "high" | "medium";

interface ImageHealthItem {
  receiptId: number;
  userId: number;
  username: string;
  email: string | null;
  storeName: string;
  receiptDate: string;
  createdAt: string;
  reason: string;
  severity: Severity;
  explanation: string;
  recommendedAction: string;
}

interface ImageHealthData {
  generatedAt: string;
  summary: {
    attachmentsScanned: number;
    findings: number;
    affectedUsers: number;
    critical: number;
    high: number;
    medium: number;
  };
  items: ImageHealthItem[];
  scan: {
    readOnly: boolean;
    metadataOnly: boolean;
    providerObjectExistenceChecked: boolean;
    historyScope: string;
    scanTruncated: boolean;
    resultsTruncated: boolean;
  };
}

type ProviderStatus = "available" | "archived" | "rehydrating" | "missing" | "inaccessible" | "temporarily_unavailable";
interface ProviderInspectionItem {
  receiptId: number;
  userId: number;
  username: string;
  email: string | null;
  storeName: string;
  receiptDate: string;
  blobName: string;
  status: ProviderStatus;
  accessTier: string | null;
  archiveStatus: string | null;
}
interface ProviderScanBatch {
  totalProviderReferences: number;
  inspectedCount: number;
  nextCursor: number;
  done: boolean;
  results: ProviderInspectionItem[];
}

const severityLabels: Record<Severity, string> = {
  critical: "Broken access likely",
  high: "Durability risk",
  medium: "Local storage risk",
};

export default function ReceiptImageHealth() {
  const [severity, setSeverity] = useState<Severity | "all">("all");
  const [search, setSearch] = useState("");
  const [providerCursor, setProviderCursor] = useState(0);
  const [providerInspected, setProviderInspected] = useState(0);
  const [providerTotal, setProviderTotal] = useState(0);
  const [providerDone, setProviderDone] = useState(false);
  const [providerScanning, setProviderScanning] = useState(false);
  const [providerFindings, setProviderFindings] = useState<ProviderInspectionItem[]>([]);
  const [providerError, setProviderError] = useState<string | null>(null);
  const { data, isLoading, isFetching, refetch } = useQuery<ImageHealthData>({
    queryKey: ["/api/admin/command-center/receipt-image-health"],
  });

  const items = useMemo(() => (data?.items ?? []).filter((item) => {
    if (severity !== "all" && item.severity !== severity) return false;
    const term = search.trim().toLowerCase();
    return !term || `${item.username} ${item.email ?? ""} ${item.userId} ${item.receiptId} ${item.storeName}`.toLowerCase().includes(term);
  }), [data, search, severity]);

  const scanNextProviderBatch = async () => {
    setProviderScanning(true);
    setProviderError(null);
    try {
      const response = await apiRequest("GET", `/api/admin/command-center/receipt-image-health/provider-scan?afterReceiptId=${providerCursor}&limit=50`);
      const batch = await response.json() as ProviderScanBatch;
      const findings = batch.results.filter(item => item.status !== "available");
      setProviderFindings(current => [...current, ...findings]);
      setProviderCursor(batch.nextCursor);
      setProviderInspected(current => current + batch.inspectedCount);
      setProviderTotal(batch.totalProviderReferences);
      setProviderDone(batch.done);
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : "Provider inspection failed");
    } finally {
      setProviderScanning(false);
    }
  };

  const restartProviderScan = () => {
    setProviderCursor(0);
    setProviderInspected(0);
    setProviderTotal(0);
    setProviderDone(false);
    setProviderFindings([]);
    setProviderError(null);
  };

  return <div className="container mx-auto p-6 space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <Link href="/command-center"><Button variant="ghost" className="mb-2 -ml-3"><ArrowLeft className="h-4 w-4 mr-2" />Control Center</Button></Link>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Images className="h-8 w-8 text-primary" />Receipt Image Health</h1>
        <p className="text-muted-foreground">Customers whose legacy receipt attachments may need attention.</p>
      </div>
      <Button variant="outline" onClick={() => refetch()} disabled={isFetching}><RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />Refresh scan</Button>
    </div>

    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
      <strong>Full-history metadata scan:</strong> this page searches the entire database for risky attachment metadata. It does not contact or change Azure storage, edit receipts, delete images, or contact customers. A durable blob name is treated as renewable evidence; provider object existence is not claimed here.
    </div>

    <Card><CardHeader><CardTitle>Azure object existence check</CardTitle></CardHeader><CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Manual, read-only batches of 50. This checks Azure metadata only; it does not download images, generate access links, change storage tiers, or initiate archive rehydration.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={scanNextProviderBatch} disabled={providerScanning || providerDone}>
          <RefreshCw className={`h-4 w-4 mr-2 ${providerScanning ? "animate-spin" : ""}`} />
          {providerScanning ? "Checking Azure…" : providerDone ? "Provider scan complete" : "Scan next 50"}
        </Button>
        {(providerCursor > 0 || providerDone) && <Button variant="outline" onClick={restartProviderScan} disabled={providerScanning}>Restart provider scan</Button>}
        <span className="text-sm text-muted-foreground">Progress: {providerInspected}{providerTotal > 0 ? ` of ${providerTotal}` : ""} references checked</span>
      </div>
      {providerError && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{providerError}. No receipt or storage data was changed.</div>}
      {providerFindings.length > 0 && <div className="space-y-2"><p className="font-medium">Provider findings from this browser session</p>{providerFindings.map((item, index) => <div key={`${item.receiptId}-${index}`} className="rounded border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span><strong>{item.username}</strong> #{item.userId} · Receipt #{item.receiptId} · {item.storeName}</span><Badge variant={item.status === "missing" ? "destructive" : "secondary"}>{item.status.replaceAll("_", " ")}</Badge></div><p className="mt-1 text-xs text-muted-foreground">Blob: {item.blobName} · Tier: {item.accessTier ?? "unavailable"}</p></div>)}</div>}
      {providerDone && providerFindings.length === 0 && <div className="rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">Provider scan completed with no missing, archived, inaccessible, or temporarily unavailable objects.</div>}
    </CardContent></Card>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Attachments scanned</p><p className="text-3xl font-bold mt-1">{data?.summary.attachmentsScanned ?? 0}</p></CardContent></Card>
      <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Affected customers</p><p className="text-3xl font-bold mt-1">{data?.summary.affectedUsers ?? 0}</p></CardContent></Card>
      {(["critical", "high", "medium"] as Severity[]).map(key => <Card key={key} className={`cursor-pointer ${severity === key ? "ring-2 ring-primary" : ""}`} onClick={() => setSeverity(key)}><CardContent className="p-4"><p className="text-sm text-muted-foreground">{severityLabels[key]}</p><p className="text-3xl font-bold mt-1">{data?.summary[key] ?? 0}</p></CardContent></Card>)}
    </div>

    {(data?.scan.scanTruncated || data?.scan.resultsTruncated) && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">The queue is larger than the safe dashboard response limit. Counts describe the scanned set; displayed rows are capped.</div>}

    <div className="flex flex-wrap gap-3">
      <Button variant={severity === "all" ? "default" : "outline"} onClick={() => setSeverity("all")}>All findings</Button>
      <div className="relative flex-1 min-w-[240px]"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search customer, email, user or receipt ID" value={search} onChange={event => setSearch(event.target.value)} /></div>
    </div>

    <Card><CardHeader><CardTitle>Receipt attachments requiring review</CardTitle></CardHeader><CardContent className="space-y-3">
      {isLoading ? <p className="text-muted-foreground">Inspecting receipt metadata…</p> : items.length === 0 ? <div className="py-10 text-center"><CheckCircle className="h-10 w-10 mx-auto text-green-600 mb-2" /><p className="font-medium">No findings in this view</p></div> : items.map(item => <div key={item.receiptId} className="rounded-lg border p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{item.username} <span className="font-normal text-muted-foreground">#{item.userId}</span></p><p className="text-sm text-muted-foreground">{item.email ?? "No email"} · Receipt #{item.receiptId} · {item.storeName}</p></div><Badge variant={item.severity === "critical" ? "destructive" : "secondary"}>{severityLabels[item.severity]}</Badge></div>
        <div><p className="font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{item.reason.replaceAll("_", " ")}</p><p className="text-sm text-muted-foreground mt-1">{item.explanation}</p><p className="text-sm mt-2"><strong>Safe next action:</strong> {item.recommendedAction}</p></div>
        <p className="text-xs text-muted-foreground">Receipt date: {new Date(item.receiptDate).toLocaleDateString()} · Record created: {new Date(item.createdAt).toLocaleString()}</p>
      </div>)}
    </CardContent></Card>
  </div>;
}
