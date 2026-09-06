import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "wouter";
import { BarChart3, BriefcaseBusiness, ChevronRight, ReceiptText, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

export function ActivationCard() {
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const { data, isLoading, isError } = useQuery<ActivationResponse>({
    queryKey: ["/api/growth/activation"],
    // Growth milestones are recorded by the destination pages, so refresh
    // when the user returns to Home rather than holding the first snapshot.
    staleTime: 0,
    refetchOnMount: "always",
  });
  const dismiss = useMutation({
    mutationFn: () => apiRequest("POST", "/api/growth/events", { eventName: "activation_journey_dismissed" }),
    onSuccess: () => {
      setDismissed(true);
      queryClient.setQueryData(["/api/growth/activation"], (old: ActivationResponse | undefined) => ({
        ...old,
        dismissed: true,
      }));
    },
  });

  if (isLoading || isError || dismissed || data?.dismissed) return null;
  const snapshot: ActivationSnapshot = {
    receiptCount: data?.receiptCount ?? 0,
    timestamps: data?.timestamps ?? data?.events ?? {},
  };
  // Dismissal is represented in the server timestamp map (the endpoint does
  // not need a separate client-owned flag), so this survives new sessions.
  if (snapshot.timestamps.activation_journey_dismissed) return null;
  const action = getActivationAction(snapshot);
  const stage = getActivationStage(snapshot);
  if (!action || !stage) return null;
  const meta = stageMeta[stage];
  const Icon = meta.icon;

  return (
    <Card className="mt-6 overflow-hidden border-[#d9d0c5] bg-[#fffdf8] text-left shadow-[0_8px_24px_rgba(77,58,42,0.07)]" data-testid="activation-card">
      <CardContent className="p-0">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex min-w-0 gap-4">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${meta.tint}`}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8c6f54]">{meta.eyebrow}</p>
                <span className="text-xs text-[#9b8a7a]">Step {stage} of 3</span>
              </div>
              <h2 className="mt-1 text-lg font-semibold text-[#3e3026]">{meta.title}</h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-[#76685d]">
                One small step now keeps your records ready when you need them.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href={action.href} className="inline-flex items-center gap-2 rounded-md bg-[#365b52] px-4 py-2 text-sm font-medium text-white hover:bg-[#294a42]" data-testid={`activation-cta-${action.stage}`}>
              {action.label}<ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Button
              variant="ghost"
              size="icon"
              className="text-[#88796c] hover:bg-[#f2ece4] hover:text-[#3e3026]"
              aria-label="Dismiss activation guide"
              onClick={() => dismiss.mutate()}
              disabled={dismiss.isPending}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-[#eee7de] px-5 py-3 sm:px-6">
          {[1, 2, 3].map((item) => (
            <span key={item} className={`h-1.5 flex-1 rounded-full ${item <= stage ? "bg-[#365b52]" : "bg-[#e8e0d6]"}`} aria-hidden="true" />
          ))}
          <span className="sr-only">Activation stage {stage} of 3</span>
        </div>
      </CardContent>
    </Card>
  );
}