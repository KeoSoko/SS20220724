import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  AlertCircle, 
  CheckCircle, 
  Users, 
  Mail, 
  CreditCard, 
  AlertTriangle, 
  Search, 
  Loader2,
  Receipt,
  Clock,
  Brain,
  Shield,
  RefreshCw,
  User,
  Calendar,
  XCircle,
  Play,
  FileCheck
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SystemHealth {
  totalUsers: number;
  unverifiedUsers: number;
  stuckTrialUsers: number;
  failedSubscriptions24h: number;
  failedSubscriptions7d: number;
  failedWebhooks24h: number;
  azureFailures7d: number;
  emailFailures7d: number;
}

interface UserSearchResult {
  id: number;
  email: string | null;
  username: string;
  createdAt: string;
  lastLogin: string | null;
  isEmailVerified: boolean;
  subscription: {
    status: string;
    trialEndDate: string | null;
    nextBillingDate: string | null;
  };
  usage: {
    totalReceipts: number;
    receiptsLast30Days: number;
    lastReceiptAt: string | null;
    loginCount: number;
  };
}

interface UserDetail {
  user: {
    id: number;
    email: string | null;
    username: string;
    fullName: string | null;
    createdAt: string;
    lastLogin: string | null;
    isEmailVerified: boolean;
    trialEndDate: string | null;
  };
  subscription: {
    id: number;
    status: string;
    planId: number;
    trialStartDate: string | null;
    trialEndDate: string | null;
    trialRestartedAt: string | null;
    subscriptionStartDate: string | null;
    nextBillingDate: string | null;
    cancelledAt: string | null;
    paystackReference: string | null;
    totalPaid: number | null;
    lastPaymentDate: string | null;
  } | null;
  usage: {
    totalReceipts: number;
    receiptsLast7Days: number;
    receiptsLast30Days: number;
    azureUploadFailures: number;
    lastReceiptAt: string | null;
  };
  billingEvents: Array<{
    id: number;
    eventType: string;
    eventData: any;
    processed: boolean;
    processingError: string | null;
    createdAt: string;
  }>;
  paymentTransactions: Array<{
    id: number;
    amount: number;
    currency: string;
    status: string;
    platform: string;
    description: string | null;
    failureReason: string | null;
    createdAt: string;
  }>;
}

interface AIAnalysis {
  diagnosis: string;
  rootCause: string;
  riskLevel: "low" | "medium" | "high";
  recommendedActions: Array<{
    action: string;
    reason: string;
  }>;
  confidence: "low" | "medium" | "high";
}

interface AIEventSummary {
  summary: string;
  failures: string[];
  currentState: string;
  needsAttention: boolean;
}

type FilterType = 'all' | 'unverified' | 'stuck_trials' | 'failed_24h' | 'failed_7d' | 'webhooks_24h' | 'azure_failures' | 'email_failures' | null;

const FILTER_LABELS: Record<Exclude<FilterType, null>, string> = {
  'all': 'All Users',
  'unverified': 'Unverified Users',
  'stuck_trials': 'Stuck Trials',
  'failed_24h': 'Failed 24h',
  'failed_7d': 'Failed 7d',
  'webhooks_24h': 'Webhook Failures 24h',
  'azure_failures': 'Azure Upload Failures',
  'email_failures': 'Email Delivery Failures'
};

export default function CommandCenter() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>(null);

  const { data: health, isLoading: healthLoading, refetch: refetchHealth } = useQuery<SystemHealth>({
    queryKey: ['/api/admin/command-center/health'],
  });

  const { data: searchResults, isLoading: searchLoading, refetch: refetchSearch } = useQuery<UserSearchResult[]>({
    queryKey: activeFilter 
      ? ['/api/admin/users/search', { filter: activeFilter }]
      : ['/api/admin/users/search', { query: searchQuery }],
    enabled: activeFilter !== null || searchQuery.length >= 2,
  });

  const handleFilterClick = (filter: FilterType) => {
    setActiveFilter(filter);
    setSearchQuery("");
    setSelectedUserId(null);
  };

  const clearFilter = () => {
    setActiveFilter(null);
  };

  const { data: userDetail, isLoading: userDetailLoading, refetch: refetchUserDetail } = useQuery<UserDetail>({
    queryKey: [`/api/admin/users/${selectedUserId}`],
    enabled: !!selectedUserId,
  });

  const { data: aiAnalysis, isLoading: aiAnalysisLoading, refetch: analyzeUser } = useQuery<AIAnalysis>({
    queryKey: ['/api/admin/ai/analyze-user', selectedUserId],
    enabled: false,
  });

  const { data: eventSummary, isLoading: eventSummaryLoading, refetch: summarizeEvents } = useQuery<AIEventSummary>({
    queryKey: ['/api/admin/ai/summarize-events', selectedUserId],
    enabled: false,
  });

  const analyzeUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await apiRequest("POST", "/api/admin/ai/analyze-user", { userId });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/admin/ai/analyze-user', selectedUserId], data);
    },
    onError: (error: any) => {
      toast({ title: "Analysis failed", description: error.message, variant: "destructive" });
    }
  });

  const summarizeEventsMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await apiRequest("POST", "/api/admin/ai/summarize-events", { userId });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['/api/admin/ai/summarize-events', selectedUserId], data);
    },
    onError: (error: any) => {
      toast({ title: "Summary failed", description: error.message, variant: "destructive" });
    }
  });

  const actionMutation = useMutation({
    mutationFn: async ({ userId, action, reason, reference }: { userId: number; action: string; reason?: string; reference?: string }) => {
      const response = await apiRequest("POST", `/api/admin/users/${userId}/actions`, { action, reason, reference });
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: "Action completed", description: data.message });
      if (selectedUserId) {
        refetchUserDetail();
      }
    },
    onError: (error: any) => {
      toast({ title: "Action failed", description: error.message, variant: "destructive" });
    }
  });

  const handleSearch = () => {
    if (searchQuery.length >= 2) {
      refetchSearch();
    }
  };

  const handleSelectUser = (userId: number) => {
    setSelectedUserId(userId);
    queryClient.removeQueries({ queryKey: ['/api/admin/ai/analyze-user', selectedUserId] });
    queryClient.removeQueries({ queryKey: ['/api/admin/ai/summarize-events', selectedUserId] });
  };

  const handleAction = (action: string, reason?: string) => {
    if (!selectedUserId) return;
    
    if (!confirm(`Are you sure you want to ${action.replace(/_/g, ' ')}?`)) {
      return;
    }
    
    actionMutation.mutate({ userId: selectedUserId, action, reason });
  };

  const getRiskBadgeColor = (risk: string) => {
    switch (risk) {
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'default';
      default: return 'outline';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'active': return 'default';
      case 'trial': return 'secondary';
      case 'expired': return 'destructive';
      case 'cancelled': return 'outline';
      default: return 'outline';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            Command Center
          </h1>
          <p className="text-muted-foreground">Operational dashboard for user diagnosis and recovery</p>
        </div>
        <Button variant="outline" onClick={() => refetchHealth()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* System Health Panel - Clickable Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <Card 
          className={`cursor-pointer hover:bg-muted/50 transition-colors ${activeFilter === 'all' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => handleFilterClick('all')}
        >
          <CardContent className="p-4 text-center">
            <Users className="h-6 w-6 mx-auto mb-2 text-blue-500" />
            <div className="text-2xl font-bold">{healthLoading ? <Skeleton className="h-8 w-12 mx-auto" /> : health?.totalUsers || 0}</div>
            <div className="text-xs text-muted-foreground">Total Users</div>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer hover:bg-muted/50 transition-colors ${health?.unverifiedUsers && health.unverifiedUsers > 0 ? "border-yellow-500" : ""} ${activeFilter === 'unverified' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => handleFilterClick('unverified')}
        >
          <CardContent className="p-4 text-center">
            <Mail className="h-6 w-6 mx-auto mb-2 text-yellow-500" />
            <div className="text-2xl font-bold">{healthLoading ? <Skeleton className="h-8 w-12 mx-auto" /> : health?.unverifiedUsers || 0}</div>
            <div className="text-xs text-muted-foreground">Unverified</div>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer hover:bg-muted/50 transition-colors ${health?.stuckTrialUsers && health.stuckTrialUsers > 0 ? "border-orange-500" : ""} ${activeFilter === 'stuck_trials' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => handleFilterClick('stuck_trials')}
        >
          <CardContent className="p-4 text-center">
            <Clock className="h-6 w-6 mx-auto mb-2 text-orange-500" />
            <div className="text-2xl font-bold">{healthLoading ? <Skeleton className="h-8 w-12 mx-auto" /> : health?.stuckTrialUsers || 0}</div>
            <div className="text-xs text-muted-foreground">Stuck Trials</div>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer hover:bg-muted/50 transition-colors ${health?.failedSubscriptions24h && health.failedSubscriptions24h > 0 ? "border-red-500" : ""} ${activeFilter === 'failed_24h' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => handleFilterClick('failed_24h')}
        >
          <CardContent className="p-4 text-center">
            <CreditCard className="h-6 w-6 mx-auto mb-2 text-red-500" />
            <div className="text-2xl font-bold">{healthLoading ? <Skeleton className="h-8 w-12 mx-auto" /> : health?.failedSubscriptions24h || 0}</div>
            <div className="text-xs text-muted-foreground">Failed 24h</div>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer hover:bg-muted/50 transition-colors ${activeFilter === 'failed_7d' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => handleFilterClick('failed_7d')}
        >
          <CardContent className="p-4 text-center">
            <CreditCard className="h-6 w-6 mx-auto mb-2 text-orange-500" />
            <div className="text-2xl font-bold">{healthLoading ? <Skeleton className="h-8 w-12 mx-auto" /> : health?.failedSubscriptions7d || 0}</div>
            <div className="text-xs text-muted-foreground">Failed 7d</div>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer hover:bg-muted/50 transition-colors ${health?.failedWebhooks24h && health.failedWebhooks24h > 0 ? "border-red-500" : ""} ${activeFilter === 'webhooks_24h' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => handleFilterClick('webhooks_24h')}
        >
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-red-500" />
            <div className="text-2xl font-bold">{healthLoading ? <Skeleton className="h-8 w-12 mx-auto" /> : health?.failedWebhooks24h || 0}</div>
            <div className="text-xs text-muted-foreground">Webhooks 24h</div>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer hover:bg-muted/50 transition-colors ${health?.azureFailures7d && health.azureFailures7d > 0 ? "border-orange-500" : ""} ${activeFilter === 'azure_failures' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => handleFilterClick('azure_failures')}
        >
          <CardContent className="p-4 text-center">
            <Receipt className="h-6 w-6 mx-auto mb-2 text-orange-500" />
            <div className="text-2xl font-bold">{healthLoading ? <Skeleton className="h-8 w-12 mx-auto" /> : health?.azureFailures7d || 0}</div>
            <div className="text-xs text-muted-foreground">Azure Fail 7d</div>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer hover:bg-muted/50 transition-colors ${activeFilter === 'email_failures' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => handleFilterClick('email_failures')}
        >
          <CardContent className="p-4 text-center">
            <Mail className="h-6 w-6 mx-auto mb-2 text-purple-500" />
            <div className="text-2xl font-bold">{healthLoading ? <Skeleton className="h-8 w-12 mx-auto" /> : health?.emailFailures7d || 0}</div>
            <div className="text-xs text-muted-foreground">Email Fail 7d</div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      {/* User Search */}
      <div className="flex gap-4">
        <div className="flex-1">
          <div className="flex gap-2">
            <Input
              placeholder="Search by email, username, or user ID..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value.length > 0) {
                  clearFilter();
                }
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={searchLoading || searchQuery.length < 2}>
              {searchLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>

          {activeFilter && (
            <div className="mt-2 flex items-center gap-2">
              <Badge variant="secondary" className="text-sm">
                Filtered: {FILTER_LABELS[activeFilter]}
              </Badge>
              <Button variant="ghost" size="sm" onClick={clearFilter} className="h-6 px-2">
                <XCircle className="h-3 w-3 mr-1" /> Clear
              </Button>
            </div>
          )}

          {(searchResults && searchResults.length > 0) && (
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {activeFilter ? `${FILTER_LABELS[activeFilter]} (${searchResults.length})` : `Search Results (${searchResults.length})`}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[200px]">
                  {searchResults.map((user) => (
                    <div
                      key={user.id}
                      className={`p-3 border-b cursor-pointer hover:bg-muted transition-colors ${selectedUserId === user.id ? 'bg-muted' : ''}`}
                      onClick={() => handleSelectUser(user.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            <User className="h-4 w-4" />
                            {user.username}
                            {user.isEmailVerified ? (
                              <CheckCircle className="h-3 w-3 text-green-500" />
                            ) : (
                              <XCircle className="h-3 w-3 text-red-500" />
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">{user.email || 'No email'}</div>
                        </div>
                        <div className="text-right">
                          <Badge variant={getStatusBadgeColor(user.subscription.status)}>
                            {user.subscription.status}
                          </Badge>
                          <div className="text-xs text-muted-foreground mt-1">
                            {user.usage.totalReceipts} receipts
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {activeFilter && searchResults && searchResults.length === 0 && !searchLoading && (
            <Card className="mt-4">
              <CardContent className="p-6 text-center text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <p>No users match the "{FILTER_LABELS[activeFilter]}" filter.</p>
                <p className="text-sm mt-1">This is good news!</p>
              </CardContent>
            </Card>
          )}

          {searchLoading && (
            <Card className="mt-4">
              <CardContent className="p-6 text-center">
                <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-2">Loading users...</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* User Detail Panel */}
      {selectedUserId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* User Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                User Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              {userDetailLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : userDetail ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Username:</span>
                      <div className="font-medium">{userDetail.user.username}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Email:</span>
                      <div className="font-medium flex items-center gap-1">
                        {userDetail.user.email || 'None'}
                        {userDetail.user.isEmailVerified ? (
                          <CheckCircle className="h-3 w-3 text-green-500" />
                        ) : (
                          <XCircle className="h-3 w-3 text-red-500" />
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Created:</span>
                      <div className="font-medium">{format(new Date(userDetail.user.createdAt), 'PPp')}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Last Login:</span>
                      <div className="font-medium">
                        {userDetail.user.lastLogin 
                          ? formatDistanceToNow(new Date(userDetail.user.lastLogin), { addSuffix: true })
                          : 'Never'
                        }
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h4 className="font-medium mb-2">Subscription</h4>
                    {userDetail.subscription ? (
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>Status: <Badge variant={getStatusBadgeColor(userDetail.subscription.status)}>{userDetail.subscription.status}</Badge></div>
                        <div>Total Paid: R{((userDetail.subscription.totalPaid || 0) / 100).toFixed(2)}</div>
                        {userDetail.subscription.nextBillingDate && (
                          <div className="col-span-2">Next Billing: {format(new Date(userDetail.subscription.nextBillingDate), 'PPP')}</div>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">No subscription record</div>
                    )}
                  </div>

                  <Separator />

                  <div>
                    <h4 className="font-medium mb-2">Usage</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>Total Receipts: <strong>{userDetail.usage.totalReceipts}</strong></div>
                      <div>Last 7 Days: <strong>{userDetail.usage.receiptsLast7Days}</strong></div>
                      <div>Last 30 Days: <strong>{userDetail.usage.receiptsLast30Days}</strong></div>
                      <div className={userDetail.usage.azureUploadFailures > 0 ? 'text-red-500' : ''}>
                        Upload Failures: <strong>{userDetail.usage.azureUploadFailures}</strong>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h4 className="font-medium mb-2">Quick Actions</h4>
                    <div className="flex flex-wrap gap-2">
                      {!userDetail.user.isEmailVerified && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => handleAction('verify_email')} disabled={actionMutation.isPending}>
                            <CheckCircle className="h-3 w-3 mr-1" /> Verify Email
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleAction('resend_verification_email')} disabled={actionMutation.isPending}>
                            <Mail className="h-3 w-3 mr-1" /> Resend Verification
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="outline" onClick={() => handleAction('restart_trial')} disabled={actionMutation.isPending}>
                        <Play className="h-3 w-3 mr-1" /> Restart Trial
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleAction('activate_subscription')} disabled={actionMutation.isPending}>
                        <CreditCard className="h-3 w-3 mr-1" /> Activate Sub
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* AI Insights Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                AI Insights
              </CardTitle>
              <CardDescription>AI-powered diagnosis and recommendations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-2">
                  <Button 
                    onClick={() => analyzeUserMutation.mutate(selectedUserId)} 
                    disabled={analyzeUserMutation.isPending}
                    size="sm"
                  >
                    {analyzeUserMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
                    Analyze User
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={() => summarizeEventsMutation.mutate(selectedUserId)} 
                    disabled={summarizeEventsMutation.isPending}
                    size="sm"
                  >
                    {summarizeEventsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <FileCheck className="h-4 w-4 mr-2" />}
                    Summarize Events
                  </Button>
                </div>

                {analyzeUserMutation.data && (
                  <div className="space-y-3 p-4 bg-muted rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Risk Level</span>
                      <Badge variant={getRiskBadgeColor(analyzeUserMutation.data.riskLevel)}>
                        {analyzeUserMutation.data.riskLevel.toUpperCase()}
                      </Badge>
                    </div>
                    <div>
                      <span className="font-medium">Diagnosis</span>
                      <p className="text-sm text-muted-foreground mt-1">{analyzeUserMutation.data.diagnosis}</p>
                    </div>
                    {analyzeUserMutation.data.rootCause && (
                      <div>
                        <span className="font-medium">Root Cause</span>
                        <p className="text-sm text-muted-foreground mt-1">{analyzeUserMutation.data.rootCause}</p>
                      </div>
                    )}
                    {analyzeUserMutation.data.recommendedActions && analyzeUserMutation.data.recommendedActions.length > 0 && (
                      <div>
                        <span className="font-medium">Recommended Actions</span>
                        <div className="space-y-2 mt-2">
                          {analyzeUserMutation.data.recommendedActions.map((rec: { action: string; reason: string }, idx: number) => (
                            <div key={idx} className="flex items-center justify-between p-2 bg-background rounded">
                              <div className="text-sm">
                                <div className="font-medium">{rec.action.replace(/_/g, ' ')}</div>
                                <div className="text-xs text-muted-foreground">{rec.reason}</div>
                              </div>
                              {rec.action !== 'no_action' && (
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => handleAction(rec.action, rec.reason)}
                                  disabled={actionMutation.isPending}
                                >
                                  Execute
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {summarizeEventsMutation.data && (
                  <div className="space-y-3 p-4 bg-muted rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Event Summary</span>
                      {summarizeEventsMutation.data.needsAttention && (
                        <Badge variant="destructive">Needs Attention</Badge>
                      )}
                    </div>
                    <p className="text-sm">{summarizeEventsMutation.data.summary}</p>
                    {summarizeEventsMutation.data.failures && summarizeEventsMutation.data.failures.length > 0 && (
                      <div>
                        <span className="font-medium text-red-500">Failures</span>
                        <ul className="list-disc list-inside text-sm text-muted-foreground">
                          {summarizeEventsMutation.data.failures.map((f: string, idx: number) => (
                            <li key={idx}>{f}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div>
                      <span className="font-medium">Current State</span>
                      <p className="text-sm text-muted-foreground">{summarizeEventsMutation.data.currentState}</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Event Timeline */}
      {selectedUserId && userDetail && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Event Timeline
            </CardTitle>
            <CardDescription>Recent billing events and payment transactions</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-3">
                {[...userDetail.billingEvents, ...userDetail.paymentTransactions.map(p => ({
                  id: `payment-${p.id}`,
                  eventType: `payment_${p.status}`,
                  eventData: { amount: p.amount, currency: p.currency, platform: p.platform },
                  processed: true,
                  processingError: p.failureReason,
                  createdAt: p.createdAt
                }))]
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .map((event, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 border rounded-lg">
                      <div className={`p-2 rounded-full ${
                        event.processingError ? 'bg-red-100' : 
                        event.eventType.includes('success') || event.eventType.includes('completed') ? 'bg-green-100' : 
                        'bg-gray-100'
                      }`}>
                        {event.processingError ? (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        ) : event.eventType.includes('payment') ? (
                          <CreditCard className="h-4 w-4 text-blue-500" />
                        ) : (
                          <Clock className="h-4 w-4 text-gray-500" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{event.eventType.replace(/_/g, ' ')}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                        {event.eventData && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {typeof event.eventData === 'object' ? JSON.stringify(event.eventData).slice(0, 100) : event.eventData}
                          </div>
                        )}
                        {event.processingError && (
                          <div className="text-xs text-red-500 mt-1">Error: {event.processingError}</div>
                        )}
                      </div>
                    </div>
                  ))
                }
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
