import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { BarChart3, BriefcaseBusiness, ChevronRight, Eye, ReceiptText, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getActivationAction, getActivationStage, ActivationSnapshot } from "@/utils/activation-journey";

type ActivationResponse = {
  receiptCount?: number;
  timestamps?: Record<string, string | null>;
  events?: Record<string, string | null>;
  dismissed?: boolean;
};

const stageMeta = {
  1: { eyebrow: "Get started", title: "Build a useful picture of your spending", icon: ReceiptText, tint: "bg-amber-50 text-amber-800" },
  2: { eyebrow: "See the value", title: "Turn your slips into a clear view", icon: BarChart3, tint: "bg-sky-50 text-sky-800" },
  3: { eyebrow: "Run the business", title: "Put your business tools to work", icon: BriefcaseBusiness, tint: "bg-violet-50 text-violet-800" },
} as const;

const collapseKey = "simple-slips:activation-collapsed";

export function ActivationCard() {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem(collapseKey) === "true"; } catch { return false; }
  });
  const { data, isLoading, isError } = useQuery<ActivationResponse>({
    queryKey: ["/api/growth/activation"], staleTime: 0, refetchOnMount: "always",
  });
  const dismiss = useMutation({
    mutationFn: () => apiRequest("POST", "/api/growth/events", { eventName: "activation_journey_dismissed" }),
    onSuccess: () => {
      setDismissed(true);
      queryClient.setQueryData(["/api/growth/activation"], (old: ActivationResponse | undefined) => ({ ...old, dismissed: true }));
    },
  });
  const expand = () => {
    setCollapsed(false);
    try { window.localStorage.removeItem(collapseKey); } catch { /* unavailable storage */ }
  };
  const collapse = () => {
    setCollapsed(true);
    try { window.localStorage.setItem(collapseKey, "true"); } catch { /* unavailable storage */ }
  };

  if (isLoading || isError || dismissed || data?.dismissed) return null;
  const snapshot: ActivationSnapshot = { receiptCount: data?.receiptCount ?? 0, timestamps: data?.timestamps ?? data?.events ?? {} };
  if (snapshot.timestamps.activation_journey_dismissed) return null;
  const action = getActivationAction(snapshot);
  const stage = getActivationStage(snapshot);
  if (!action || !stage) return null;
  const meta = stageMeta[stage];
  const Icon = meta.icon;

  if (collapsed) return (
    <Card className="mt-6 border-[#d9d0c5] bg-[#fffdf8] text-left shadow-[0_8px_24px_rgba(77,58,42,0.06)]" data-testid="activation-card-collapsed">
      <CardContent className="flex items-center justify-between gap-3 p-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${meta.tint}`}><Icon className="h-4 w-4" aria-hidden="true" /></div>
          <div className="min-w-0"><p className="text-sm font-semibold text-[#3e3026]">Setup guide paused</p><p className="truncate text-xs text-[#76685d]">Step {stage} of 3 is ready when you are.</p></div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={expand} className="shrink-0 border-[#cfc2b4] text-[#365b52]"><Eye className="h-4 w-4" aria-hidden="true" />Continue setup</Button>
      </CardContent>
    </Card>
  );

  return (
    <Card className="mt-6 overflow-hidden border-[#d9d0c5] bg-[#fffdf8] text-left shadow-[0_8px_24px_rgba(77,58,42,0.07)]" data-testid="activation-card">
      <CardContent className="p-0">
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 gap-4">
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${meta.tint}`}><Icon className="h-5 w-5" aria-hidden="true" /></div>
              <div className="min-w-0">
                <div className="flex items-center gap-2"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8c6f54]">{meta.eyebrow}</p><span className="text-xs text-[#9b8a7a]">Step {stage} of 3</span></div>
                <h2 className="mt-1 text-lg font-semibold text-[#3e3026]">{meta.title}</h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-[#76685d]">{stage === 1 ? "Open one of your saved slips and confirm its category to continue." : "One small step now keeps your records ready when you need them."}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button asChild data-testid={`activation-cta-${action.stage}`}><Link href={action.href}>{action.label}<ChevronRight className="h-4 w-4" aria-hidden="true" /></Link></Button>
              <Button variant="ghost" size="icon" className="text-[#88796c] hover:bg-[#f2ece4] hover:text-[#3e3026]" aria-label="Collapse setup guide" onClick={collapse}><X className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-[#eee7de] pt-3">
            {[1, 2, 3].map((item) => <span key={item} className={`h-1.5 flex-1 rounded-full ${item <= stage ? "bg-[#365b52]" : "bg-[#e8e0d6]"}`} aria-hidden="true" />)}
            <span className="sr-only">Activation stage {stage} of 3</span>
          </div>
          <div className="flex justify-end border-t border-[#eee7de] pt-2"><Button type="button" variant="link" className="h-auto px-0 text-xs font-medium text-[#8c6f54]" onClick={() => setConfirmOpen(true)}>Hide setup guide</Button></div>
        </div>
      </CardContent>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Hide the setup guide?</AlertDialogTitle><AlertDialogDescription>You can restore the setup guide later from Profile settings. Hiding it will not change your progress.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep guide</AlertDialogCancel><AlertDialogAction onClick={() => dismiss.mutate()} disabled={dismiss.isPending}>{dismiss.isPending ? "Hiding…" : "Hide setup guide"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}