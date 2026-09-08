import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertCircle, ArrowLeft, BarChart3, CheckCircle2, Clock3, Info, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Metric = { available: boolean; value: number | null; numerator: number | null; denominator: number | null; unit?: string; note?: string };
type GrowthData = {
  meta: { from: string; to: string; timezone: string; baselineDate: string; incomplete: boolean; notes: string[] };
  summary: Record<string, Metric>;
  funnel: Array<{ key: string; label: string; count: number | null; available: boolean; denominator?: number | null }>;
  retention: Array<{ day: "D1" | "D7" | "D30"; available: boolean; numerator: number | null; denominator: number | null; value: number | null; note?: string }>;
  breakdown: Array<{ source: string; medium: string; campaign: string; visitors: number | null; signups: number; activated: number; paid: number }>;
  paidByReceiptSegment: Array<{ segment: string; available: boolean; value: number | null; numerator: number | null; denominator: number | null; note?: string }>;
  definitions: Array<{ key: string; label: string; definition: string; denominator: string }>;
};

const metricLabels: Record<string, string> = {
  measuredVisitors: "Measured visitors",
  signups: "Sign-ups",
  firstReceiptWithin7Days: "First slip within 7 days",
  thirdReceiptWithin7Days: "Third slip within 7 days",
  verifiedEmail: "Verified email",
  paidConversionOverall: "Paid conversion",
  activationToPaid: "Activation to paid",
  medianTimeToFirstReceiptHours: "Median hours to first slip",
};

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const initialFrom = () => { const d = new Date(); d.setDate(d.getDate() - 29); return isoDate(d); };
const formatMetric = (metric: Metric) => {
  if (!metric.available || metric.value === null) return "Not available";
  if (metric.unit === "percent") return `${metric.value.toFixed(1)}%`;
  return metric.value.toLocaleString();
};
const ratioText = (numerator: number | null, denominator: number | null) =>
  numerator === null || denominator === null ? "Evidence not available" : `${numerator.toLocaleString()} / ${denominator.toLocaleString()}`;

export default function GrowthDashboard() {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(isoDate(new Date()));
  const [cohort, setCohort] = useState("all");
  const params = useMemo(() => ({ from, to, timezone: "Africa/Johannesburg", cohort }), [from, to, cohort]);
  const query = useQuery<GrowthData>({
    queryKey: ["/api/admin/growth-dashboard", params],
    enabled: Boolean(from && to && from <= to),
  });
  const data = query.data;

  return (
    <main className="min-h-[100dvh] bg-muted/20">
      <div className="container mx-auto max-w-[1440px] space-y-5 p-4 sm:p-6">
        <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/command-center" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-2 h-4 w-4" />Command Center</Link>
            <div className="flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><BarChart3 className="h-6 w-6" /></div><div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Growth dashboard</h1><p className="text-sm text-muted-foreground">Acquisition, activation and paid conversion — operational view.</p></div></div>
          </div>
          <Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />Refresh evidence</Button>
        </header>

        <section className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-end">
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">From<input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground" /></label>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground">To<input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm text-foreground" /></label>
          <div className="flex flex-wrap gap-2 sm:ml-2">
            {[7, 30, 90].map(days => <Button key={days} size="sm" variant={days === 30 && isoDate(new Date(new Date(to).getTime() - 29 * 86400000)) === from ? "default" : "outline"} onClick={() => { const d = new Date(to); d.setDate(d.getDate() - days + 1); setFrom(isoDate(d)); }}>{days}d</Button>)}
          </div>
          <label className="grid gap-1 text-xs font-medium text-muted-foreground sm:ml-auto">Cohort<select value={cohort} onChange={e => setCohort(e.target.value)} className="h-9 min-w-[180px] rounded-md border bg-background px-2 text-sm text-foreground"><option value="all">All users</option><option value="attributed">Attribution captured</option><option value="unattributed">No captured attribution</option></select></label>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />Africa/Johannesburg</div>
        </section>

        {query.isLoading ? <LoadingState /> : query.isError ? <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Growth evidence could not be loaded</AlertTitle><AlertDescription className="flex flex-wrap items-center gap-3">Check the date range or try again.<Button size="sm" variant="outline" onClick={() => query.refetch()}>Retry</Button></AlertDescription></Alert> : !data ? <EmptyState /> : <div className="space-y-5">
          {(data.meta.incomplete || data.meta.notes.length > 0) && <Alert className="border-amber-300 bg-amber-50/70 text-amber-950"><Info className="h-4 w-4" /><AlertTitle>Read the gaps before the graph</AlertTitle><AlertDescription>{data.meta.notes.length ? data.meta.notes.join(" ") : "Some measures are incomplete for this range."} Baseline: {data.meta.baselineDate}.</AlertDescription></Alert>}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Object.entries(data.summary).map(([key, metric]) => <MetricCard key={key} label={metricLabels[key] ?? key} metric={metric} />)}</section>
          <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
            <Card><CardHeader className="flex-row items-start justify-between space-y-0"><div><CardTitle>Conversion funnel</CardTitle><p className="mt-1 text-sm text-muted-foreground">Counts are shown as supplied; no inferred totals.</p></div><Badge variant="outline">No PII</Badge></CardHeader><CardContent><div className="space-y-3">{data.funnel.length ? data.funnel.map((step, index) => <div key={step.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"><div><div className="mb-1 flex justify-between gap-2 text-sm"><span className="font-medium">{index + 1}. {step.label}</span><span className="font-mono text-muted-foreground">{step.available && step.count !== null ? step.count.toLocaleString() : "Unavailable"}</span></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${step.available && step.count !== null && step.denominator ? Math.min(100, (step.count / step.denominator) * 100) : step.available ? 100 : 0}%` }} /></div></div><span className="text-xs text-muted-foreground">{step.denominator !== undefined && step.denominator !== null ? `${step.count ?? "—"} / ${step.denominator}` : step.available ? "count" : "pre-instrumentation"}</span></div>) : <EmptyInline text="No funnel data for this range." />}</div></CardContent></Card>
            <Card><CardHeader><CardTitle>Retention checkpoints</CardTitle><p className="text-sm text-muted-foreground">Cohort return rate by day.</p></CardHeader><CardContent><div className="divide-y">{data.retention.map(item => <div key={item.day} className="flex items-center justify-between gap-3 py-3"><div><p className="font-medium">{item.day} retention</p><p className="text-xs text-muted-foreground">{item.note ?? "Numerator / denominator"}</p></div><div className="text-right"><p className="font-mono font-semibold">{item.available && item.value !== null ? `${item.value.toFixed(1)}%` : "Unavailable"}</p><p className="text-xs text-muted-foreground">{ratioText(item.numerator, item.denominator)}</p></div></div>)}</div></CardContent></Card>
          </div>
          <Card><CardHeader><CardTitle>Paid conversion by receipt depth</CardTitle><p className="text-sm text-muted-foreground">Each rate uses the users in that receipt segment as its denominator.</p></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-3">{data.paidByReceiptSegment.map(item => <div key={item.segment} className="rounded-lg border bg-muted/20 p-4"><p className="text-sm font-medium">{item.segment}</p><p className="mt-2 text-2xl font-semibold">{item.available && item.value !== null ? `${item.value.toFixed(1)}%` : "Unavailable"}</p><p className="mt-1 text-xs text-muted-foreground">{ratioText(item.numerator, item.denominator)}</p></div>)}</div></CardContent></Card>
          <Card><CardHeader><CardTitle>Source breakdown</CardTitle><p className="text-sm text-muted-foreground">Attributed acquisition only where campaign evidence exists.</p></CardHeader><CardContent><BreakdownTable rows={data.breakdown} /></CardContent></Card>
          <Card><CardHeader><CardTitle>Metric definitions</CardTitle></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-2">{data.definitions.map(item => <div key={item.key} className="rounded-lg border bg-muted/20 p-3"><div className="flex items-start justify-between gap-2"><p className="font-medium">{item.label}</p><Badge variant="secondary" className="shrink-0">Definition</Badge></div><p className="mt-1 text-sm text-muted-foreground">{item.definition}</p><p className="mt-2 text-xs text-muted-foreground"><strong>Denominator:</strong> {item.denominator}</p></div>)}</div></CardContent></Card>
        </div>}
      </div>
    </main>
  );
}

function MetricCard({ label, metric }: { label: string; metric: Metric }) {
  return <Card className={!metric.available ? "border-dashed" : ""}><CardContent className="p-4"><div className="flex items-center justify-between gap-2"><p className="text-sm text-muted-foreground">{label}</p>{metric.available ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Badge variant="outline">Unavailable</Badge>}</div><p className="mt-2 text-2xl font-semibold tracking-tight">{formatMetric(metric)}</p><p className="mt-1 text-xs text-muted-foreground">{metric.numerator !== null && metric.denominator !== null ? `${metric.numerator.toLocaleString()} / ${metric.denominator.toLocaleString()}` : metric.note ?? "Evidence not available"}</p></CardContent></Card>;
}
function BreakdownTable({ rows }: { rows: GrowthData["breakdown"] }) {
  if (!rows.length) return <EmptyInline text="No source evidence for this range." />;
  return <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-muted-foreground"><th className="pb-3 pr-4">Source / medium</th><th className="pb-3 pr-4">Campaign</th><th className="pb-3 pr-4 text-right">Visitors</th><th className="pb-3 pr-4 text-right">Sign-ups</th><th className="pb-3 pr-4 text-right">Activated</th><th className="pb-3 text-right">Paid</th></tr></thead><tbody>{rows.map((row, i) => <tr key={`${row.source}-${row.medium}-${row.campaign}-${i}`} className="border-b last:border-0"><td className="py-3 pr-4 font-medium">{row.source} <span className="font-normal text-muted-foreground">/ {row.medium}</span></td><td className="py-3 pr-4 text-muted-foreground">{row.campaign || "—"}</td><td className="py-3 pr-4 text-right font-mono">{row.visitors?.toLocaleString() ?? "—"}</td><td className="py-3 pr-4 text-right font-mono">{row.signups.toLocaleString()}</td><td className="py-3 pr-4 text-right font-mono">{row.activated.toLocaleString()}</td><td className="py-3 text-right font-mono">{row.paid.toLocaleString()}</td></tr>)}</tbody></table></div>;
}
function LoadingState() { return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>; }
function EmptyState() { return <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center"><Users className="h-10 w-10 text-muted-foreground" /><h2 className="font-semibold">No growth evidence yet</h2><p className="max-w-md text-sm text-muted-foreground">Try a wider date range, or confirm that growth instrumentation is enabled.</p></CardContent></Card>; }
function EmptyInline({ text }: { text: string }) { return <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4" />{text}</div>; }