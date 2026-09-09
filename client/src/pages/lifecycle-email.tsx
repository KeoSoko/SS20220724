import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertCircle, ArrowLeft, Clock3, Eye, Info, Mail, RefreshCw, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";

type Campaign = {
  key: string; name: string; version?: string | number; classification?: string; enabled: boolean;
  managedExternally?: boolean; trigger?: string; delay?: string; eligible: number; sent: number;
  suppressed: number; failed: number; lastRunAt: string | null; nextRunAt: string | null; definition?: string;
};
type LifecycleData = {
  meta: { masterEnabled: boolean; rolloutBaseline: string; timezone: string; quietHours: string; marketingCap: string; lastRunAt: string | null; nextRunAt: string | null };
  campaigns: Campaign[]; definitions: Array<{ label: string; definition: string }>;
};
type Preview = { subject: string; preheader: string; html: string; text: string; templateMode: string; syntheticDataNotice: string };

const dateLabel = (value: string | null) => value ? `${new Date(value).toISOString().replace("T", " ").replace(".000Z", " UTC")} · Africa/Johannesburg context` : "Not scheduled";
const count = (value: number) => value.toLocaleString();

export default function LifecycleEmailPage() {
  const [previewCampaign, setPreviewCampaign] = useState<Campaign | null>(null);
  const status = useQuery<LifecycleData>({ queryKey: ["/api/admin/lifecycle-email/status"] });
  const preview = useMutation({
    mutationFn: async (campaignKey: string) => await (await apiRequest("POST", "/api/admin/lifecycle-email/preview", { campaignKey })).json() as Preview,
  });
  const openPreview = (campaign: Campaign) => { setPreviewCampaign(campaign); preview.mutate(campaign.key); };
  const data = status.data;

  return (
    <main className="min-h-[100dvh] overflow-x-hidden bg-muted/20">
      <div className="container mx-auto max-w-[1440px] space-y-5 p-4 sm:p-6">
        <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link href="/command-center" className="mb-3 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-2 h-4 w-4" />Command Centre</Link>
            <div className="flex items-center gap-3"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Mail className="h-6 w-6" /></div><div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Lifecycle emails</h1><p className="text-sm text-muted-foreground">Simple Slips aggregate delivery operations — no customer details.</p></div></div>
          </div>
          <Button variant="outline" onClick={() => status.refetch()} disabled={status.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${status.isFetching ? "animate-spin" : ""}`} />Refresh</Button>
        </header>

        {status.isLoading ? <LoadingState /> : status.isError ? <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Lifecycle status could not be loaded</AlertTitle><AlertDescription>Try again when the admin service is available.<Button className="ml-3" size="sm" variant="outline" onClick={() => status.refetch()}>Retry</Button></AlertDescription></Alert> : !data ? <EmptyState /> : <>
          <Alert className="border-amber-300 bg-amber-50/70 text-amber-950"><ShieldCheck className="h-4 w-4" /><AlertTitle>Lifecycle email master switch <Badge variant="destructive" className="ml-2">DISABLED</Badge></AlertTitle><AlertDescription className="mt-1">Sending is globally disabled. This read-only control cannot enable sending from the dashboard.</AlertDescription></Alert>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetaCard label="Rollout baseline" value={data.meta.rolloutBaseline} />
            <MetaCard label="Quiet hours" value={data.meta.quietHours} />
            <MetaCard label="Marketing cap" value={data.meta.marketingCap} />
            <MetaCard label="Timezone" value={`${data.meta.timezone} (UTC context)`} />
          </section>
          <Card><CardHeader><CardTitle>Campaign status</CardTitle><p className="text-sm text-muted-foreground">Counts are aggregate-only. Test sends are prepared but unavailable while the master switch is disabled.</p></CardHeader><CardContent>
            {!data.campaigns.length ? <p className="py-8 text-sm text-muted-foreground">No lifecycle campaigns are configured.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[930px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-muted-foreground"><th className="pb-3 pr-4">Campaign</th><th className="pb-3 pr-4">Trigger / delay</th><th className="pb-3 pr-4">Status</th><th className="pb-3 pr-4 text-right">Eligible</th><th className="pb-3 pr-4 text-right">Sent</th><th className="pb-3 pr-4 text-right">Suppressed</th><th className="pb-3 pr-4 text-right">Failed</th><th className="pb-3 pr-4">Last / next run</th><th className="pb-3">Actions</th></tr></thead><tbody>{data.campaigns.map(campaign => <tr key={campaign.key} className="border-b align-top last:border-0"><td className="py-4 pr-4"><p className="font-medium">{campaign.name}</p><p className="text-xs text-muted-foreground">{campaign.key}{campaign.version ? ` · v${campaign.version}` : ""}{campaign.classification ? ` · ${campaign.classification}` : ""}</p></td><td className="py-4 pr-4"><p>{campaign.trigger || "—"}</p><p className="text-xs text-muted-foreground">{campaign.delay || "No delay specified"}</p></td><td className="py-4 pr-4"><Badge variant="outline">OFF</Badge>{campaign.managedExternally && <p className="mt-1 text-xs text-muted-foreground">Managed externally</p>}</td><td className="py-4 pr-4 text-right font-mono">{count(campaign.eligible)}</td><td className="py-4 pr-4 text-right font-mono">{count(campaign.sent)}</td><td className="py-4 pr-4 text-right font-mono">{count(campaign.suppressed)}</td><td className="py-4 pr-4 text-right font-mono">{count(campaign.failed)}</td><td className="py-4 pr-4 text-xs text-muted-foreground"><div>{dateLabel(campaign.lastRunAt)}</div><div>{dateLabel(campaign.nextRunAt)}</div></td><td className="py-4"><div className="flex flex-col gap-2"><Button size="sm" variant="outline" onClick={() => openPreview(campaign)}><Eye className="mr-1 h-3.5 w-3.5" />Preview</Button><Button size="sm" disabled title="Test sends are unavailable while lifecycle email sending is disabled">Test send</Button><span className="max-w-[130px] text-[11px] text-muted-foreground">Unavailable while disabled</span></div></td></tr>)}</tbody></table></div>}
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Run timing</CardTitle></CardHeader><CardContent className="grid gap-3 text-sm sm:grid-cols-2"><p><span className="text-muted-foreground">Last aggregate run:</span> {dateLabel(data.meta.lastRunAt)}</p><p><span className="text-muted-foreground">Next aggregate run:</span> {dateLabel(data.meta.nextRunAt)}</p><p className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />Labels show UTC with {data.meta.timezone || "Africa/Johannesburg"} context.</p></CardContent></Card>
          <Card><CardHeader><CardTitle>Definitions</CardTitle></CardHeader><CardContent>{data.definitions.length ? <div className="grid gap-3 md:grid-cols-2">{data.definitions.map(item => <div key={item.label} className="rounded-lg border bg-muted/20 p-3"><p className="font-medium">{item.label}</p><p className="mt-1 text-sm text-muted-foreground">{item.definition}</p></div>)}</div> : <p className="text-sm text-muted-foreground">No definitions supplied.</p>}</CardContent></Card>
        </>}
      </div>
      <Dialog open={!!previewCampaign} onOpenChange={open => !open && setPreviewCampaign(null)}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Synthetic preview{previewCampaign ? ` · ${previewCampaign.name}` : ""}</DialogTitle><DialogDescription>Preview only. No customer data or live send is involved.</DialogDescription></DialogHeader>{preview.isPending ? <Skeleton className="h-56 w-full" /> : preview.data ? <div className="space-y-4"><Alert><Info className="h-4 w-4" /><AlertDescription>{preview.data.syntheticDataNotice}</AlertDescription></Alert><div className="rounded-lg border p-4"><p className="text-xs text-muted-foreground">Subject</p><p className="font-medium">{preview.data.subject}</p><p className="mt-3 text-xs text-muted-foreground">Preheader</p><p>{preview.data.preheader}</p></div><pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-4 text-xs">{preview.data.text}</pre><p className="text-xs text-muted-foreground">Template mode: {preview.data.templateMode}</p></div> : <p className="text-sm text-muted-foreground">Preview could not be loaded. Try again.</p>}</DialogContent></Dialog>
    </main>
  );
}
function MetaCard({ label, value }: { label: string; value: string }) { return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words font-medium">{value || "Not supplied"}</p></CardContent></Card>; }
function LoadingState() { return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>; }
function EmptyState() { return <Card><CardContent className="flex flex-col items-center gap-2 py-16 text-center"><Mail className="h-10 w-10 text-muted-foreground" /><h2 className="font-semibold">No lifecycle status yet</h2><p className="text-sm text-muted-foreground">There is no aggregate lifecycle email evidence to display.</p></CardContent></Card>; }