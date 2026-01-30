import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  FileCheck,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Circle,
  Eye,
  Send,
  X,
  Info
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

interface PaginatedSearchResponse {
  users: UserSearchResult[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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
  emailHealth: {
    status: 'healthy' | 'warning' | 'failed';
    lastEmailSent: {
      type: string | null;
      status: string;
      at: string;
    } | null;
    lastDelivered: {
      at: string;
    } | null;
    lastFailed: {
      type: string;
      reason: string | null;
      at: string;
    } | null;
    recentEvents: Array<{
      id: number;
      eventType: string;
      emailType: string | null;
      bounceReason: string | null;
      createdAt: string;
    }>;
  };
}

interface EmailPreview {
  subject: string;
  from: string;
  to: string | null;
  templateId: string | null;
  templateName: string;
  previewData: Record<string, any>;
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

const CARD_SUBTITLES: Record<Exclude<FilterType, null>, string> = {
  'all': 'Total registered accounts',
  'unverified': 'Can\'t receive emails',
  'stuck_trials': 'Trial ended, no conversion',
  'failed_24h': 'Urgent - may lose access',
  'failed_7d': 'At risk of churning',
  'webhooks_24h': 'Payment data may be stale',
  'azure_failures': 'Upload experience broken',
  'email_failures': 'Not receiving notifications'
};

const RECOVERY_PLAYBOOKS: Record<Exclude<FilterType, null>, { what: string; actions: string[] }> = {
  'all': { what: 'Overview of all registered users', actions: ['Review high-risk users first', 'Check recent signups'] },
  'unverified': { 
    what: 'These users haven\'t verified their email. They may have typos in their address or emails are being blocked.', 
    actions: ['Resend verification email', 'If older than 7 days, contact via alternative channel'] 
  },
  'stuck_trials': { 
    what: 'Trial period ended but they didn\'t convert. Often due to payment issues or forgotten accounts.', 
    actions: ['Restart trial if engaged user', 'Check if payment was attempted but failed'] 
  },
  'failed_24h': { 
    what: 'Payment failed in the last 24 hours. User may be locked out or frustrated.', 
    actions: ['Activate subscription manually if payment confirmed', 'Contact to resolve payment issue'] 
  },
  'failed_7d': { 
    what: 'Repeated payment failures over a week. High churn risk.', 
    actions: ['Prioritize outreach', 'Consider extending trial while resolving'] 
  },
  'webhooks_24h': { 
    what: 'Paystack webhooks failed to process. Subscription state may be incorrect.', 
    actions: ['Check Paystack dashboard for actual status', 'Manually reconcile if needed'] 
  },
  'azure_failures': { 
    what: 'Receipt uploads are failing for these users. Core functionality is broken.', 
    actions: ['Check Azure Blob Storage status', 'Verify user\'s file sizes/formats'] 
  },
  'email_failures': { 
    what: 'Emails (invoices, reminders, etc.) are bouncing or failing to deliver.', 
    actions: ['Verify email address is correct', 'Check SendGrid for bounce reasons'] 
  }
};

type RiskLevel = 'high' | 'medium' | 'healthy';

function calculateUserRisk(user: UserSearchResult): RiskLevel {
  const now = new Date();
  const createdAt = new Date(user.createdAt);
  const accountAgeHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
  
  // High risk conditions
  if (user.subscription.status === 'expired' || user.subscription.status === 'cancelled') {
    return 'high';
  }
  if (user.subscription.status === 'trial' && user.subscription.trialEndDate) {
    const trialEnd = new Date(user.subscription.trialEndDate);
    if (trialEnd < now) return 'high';
  }
  
  // Medium risk conditions
  if (!user.isEmailVerified && accountAgeHours > 24) {
    return 'medium';
  }
  if (user.subscription.status === 'trial' && user.subscription.trialEndDate) {
    const trialEnd = new Date(user.subscription.trialEndDate);
    const daysLeft = (trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysLeft < 3 && daysLeft > 0) return 'medium';
  }
  
  // Healthy
  if (user.subscription.status === 'active' || (user.subscription.status === 'trial' && user.usage.totalReceipts > 0)) {
    return 'healthy';
  }
  
  return 'medium';
}

const DESTRUCTIVE_ACTIONS = ['activate_subscription', 'cancel_subscription', 'restart_trial'];

type EmailTemplateType = 'trial_recovery' | 'verification' | 'payment_failed';

export default function CommandCenter() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>(null);
  const [confirmAction, setConfirmAction] = useState<{ action: string; reason?: string } | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [showOlderEvents, setShowOlderEvents] = useState(false);
  const [emailPreview, setEmailPreview] = useState<EmailPreview | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplateType | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageLimit = 50;

  const { data: health, isLoading: healthLoading, refetch: refetchHealth } = useQuery<SystemHealth>({
    queryKey: ['/api/admin/command-center/health'],
  });

  const { data: searchResponse, isLoading: searchLoading, refetch: refetchSearch } = useQuery<PaginatedSearchResponse>({
    queryKey: activeFilter 
      ? ['/api/admin/users/search', { filter: activeFilter, page: currentPage, limit: pageLimit }]
      : ['/api/admin/users/search', { query: searchQuery, page: currentPage, limit: pageLimit }],
    enabled: activeFilter !== null || searchQuery.length >= 2,
  });

  const searchResults = searchResponse?.users || [];
  const totalUsers = searchResponse?.total || 0;
  const totalPages = searchResponse?.totalPages || 1;

  const handleFilterClick = (filter: FilterType) => {
    setActiveFilter(filter);
    setSearchQuery("");
    setSelectedUserId(null);
    setCurrentPage(1);
  };

  const clearFilter = () => {
    setActiveFilter(null);
    setCurrentPage(1);
  };

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      setSelectedUserId(null);
    }
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

  const recoveryEmailMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await apiRequest("POST", `/api/admin/users/${userId}/send-recovery-email`, {});
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: "Email sent", description: data.message });
      if (selectedUserId) {
        refetchUserDetail();
      }
    },
    onError: (error: any) => {
      toast({ title: "Failed to send email", description: error.message, variant: "destructive" });
    }
  });

  const emailPreviewMutation = useMutation({
    mutationFn: async ({ userId, template }: { userId: number; template: EmailTemplateType }) => {
      const response = await apiRequest("POST", "/api/admin/email/preview", { userId, template });
      return response.json();
    },
    onSuccess: (data: EmailPreview) => {
      setEmailPreview(data);
    },
    onError: (error: any) => {
      toast({ title: "Failed to load preview", description: error.message, variant: "destructive" });
    }
  });

  const handlePreviewEmail = (template: EmailTemplateType) => {
    if (!selectedUserId) return;
    setPreviewTemplate(template);
    emailPreviewMutation.mutate({ userId: selectedUserId, template });
  };

  const closeEmailPreview = () => {
    setEmailPreview(null);
    setPreviewTemplate(null);
  };

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
    
    // Destructive actions require typing CONFIRM
    if (DESTRUCTIVE_ACTIONS.includes(action)) {
      setConfirmAction({ action, reason });
      setConfirmInput("");
      return;
    }
    
    // Non-destructive actions use simple confirmation
    if (!confirm(`Are you sure you want to ${action.replace(/_/g, ' ')}?`)) {
      return;
    }
    
    actionMutation.mutate({ userId: selectedUserId, action, reason });
  };

  const executeConfirmedAction = () => {
    if (!selectedUserId || !confirmAction || confirmInput !== 'CONFIRM') return;
    actionMutation.mutate({ userId: selectedUserId, action: confirmAction.action, reason: confirmAction.reason });
    setConfirmAction(null);
    setConfirmInput("");
  };

  const cancelConfirmAction = () => {
    setConfirmAction(null);
    setConfirmInput("");
  };

  const getRiskBadgeColor = (risk: string) => {
    switch (risk) {
      case 'high': return 'destructive';
      case 'medium': return 'secondary';
      case 'low': return 'default';
      default: return 'outline';
    }
  };

  const getRecoveryEmailStatus = () => {
    if (!userDetail) return { canSend: false, reason: 'No user selected' };
    if (!userDetail.user.email) return { canSend: false, reason: 'No email address' };
    
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentRecoveryEmail = userDetail.billingEvents.find(
      event => event.eventType === 'admin_recovery_email_sent' && new Date(event.createdAt) > sevenDaysAgo
    );
    
    if (recentRecoveryEmail) {
      return { 
        canSend: false, 
        reason: `Email sent ${formatDistanceToNow(new Date(recentRecoveryEmail.createdAt), { addSuffix: true })}` 
      };
    }
    
    return { canSend: true, reason: 'Ready to send' };
  };

  const recoveryEmailStatus = getRecoveryEmailStatus();

  const handleSendRecoveryEmail = () => {
    if (!selectedUserId || !recoveryEmailStatus.canSend) return;
    
    if (!confirm("Send a recovery email to this user? This action will be logged.")) {
      return;
    }
    
    recoveryEmailMutation.mutate(selectedUserId);
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

      {/* Today's Attention Strip */}
      {!healthLoading && health && (
        <div className="flex flex-wrap gap-3">
          {(health.failedSubscriptions24h > 0 || (health.stuckTrialUsers > 0 && health.unverifiedUsers > 0)) && (
            <Alert 
              variant="destructive" 
              className="flex-1 min-w-[200px] cursor-pointer hover:bg-destructive/90 transition-colors"
              onClick={() => handleFilterClick('failed_24h')}
            >
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-sm font-medium">
                {health.failedSubscriptions24h + health.stuckTrialUsers} users likely to churn today
              </AlertTitle>
              <AlertDescription className="text-xs">
                Payment failures and stuck trials need urgent attention
              </AlertDescription>
            </Alert>
          )}
          
          {health.emailFailures7d > 0 && (
            <Alert 
              className="flex-1 min-w-[200px] cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors border-orange-300"
              onClick={() => handleFilterClick('email_failures')}
            >
              <Mail className="h-4 w-4 text-orange-500" />
              <AlertTitle className="text-sm font-medium text-orange-700 dark:text-orange-400">
                {health.emailFailures7d} users blocked by email delivery
              </AlertTitle>
              <AlertDescription className="text-xs text-orange-600 dark:text-orange-500">
                These users aren't receiving notifications
              </AlertDescription>
            </Alert>
          )}
          
          {health.failedSubscriptions24h === 0 && (
            <Alert className="flex-1 min-w-[200px] border-green-300 bg-green-50 dark:bg-green-950/20">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <AlertTitle className="text-sm font-medium text-green-700 dark:text-green-400">
                Payments healthy (0 failures last 24h)
              </AlertTitle>
              <AlertDescription className="text-xs text-green-600 dark:text-green-500">
                All payment processing is working normally
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* System Health Panel - Clickable Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <Card 
          className={`cursor-pointer hover:bg-muted/50 transition-colors ${activeFilter === 'all' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => handleFilterClick('all')}
        >
          <CardContent className="p-4 text-center">
            <Users className="h-6 w-6 mx-auto mb-2 text-blue-500" />
            <div className="text-2xl font-bold">{healthLoading ? <Skeleton className="h-8 w-12 mx-auto" /> : health?.totalUsers || 0}</div>
            <div className="text-xs font-medium">Total Users</div>
            <div className="text-[10px] text-muted-foreground mt-1">{CARD_SUBTITLES['all']}</div>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer hover:bg-muted/50 transition-colors ${health?.unverifiedUsers && health.unverifiedUsers > 0 ? "border-yellow-500" : ""} ${activeFilter === 'unverified' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => handleFilterClick('unverified')}
        >
          <CardContent className="p-4 text-center">
            <Mail className="h-6 w-6 mx-auto mb-2 text-yellow-500" />
            <div className="text-2xl font-bold">{healthLoading ? <Skeleton className="h-8 w-12 mx-auto" /> : health?.unverifiedUsers || 0}</div>
            <div className="text-xs font-medium">Unverified</div>
            <div className="text-[10px] text-muted-foreground mt-1">{CARD_SUBTITLES['unverified']}</div>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer hover:bg-muted/50 transition-colors ${health?.stuckTrialUsers && health.stuckTrialUsers > 0 ? "border-orange-500" : ""} ${activeFilter === 'stuck_trials' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => handleFilterClick('stuck_trials')}
        >
          <CardContent className="p-4 text-center">
            <Clock className="h-6 w-6 mx-auto mb-2 text-orange-500" />
            <div className="text-2xl font-bold">{healthLoading ? <Skeleton className="h-8 w-12 mx-auto" /> : health?.stuckTrialUsers || 0}</div>
            <div className="text-xs font-medium">Stuck Trials</div>
            <div className="text-[10px] text-muted-foreground mt-1">{CARD_SUBTITLES['stuck_trials']}</div>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer hover:bg-muted/50 transition-colors ${health?.failedSubscriptions24h && health.failedSubscriptions24h > 0 ? "border-red-500" : ""} ${activeFilter === 'failed_24h' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => handleFilterClick('failed_24h')}
        >
          <CardContent className="p-4 text-center">
            <CreditCard className="h-6 w-6 mx-auto mb-2 text-red-500" />
            <div className="text-2xl font-bold">{healthLoading ? <Skeleton className="h-8 w-12 mx-auto" /> : health?.failedSubscriptions24h || 0}</div>
            <div className="text-xs font-medium">Failed 24h</div>
            <div className="text-[10px] text-muted-foreground mt-1">{CARD_SUBTITLES['failed_24h']}</div>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer hover:bg-muted/50 transition-colors ${activeFilter === 'failed_7d' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => handleFilterClick('failed_7d')}
        >
          <CardContent className="p-4 text-center">
            <CreditCard className="h-6 w-6 mx-auto mb-2 text-orange-500" />
            <div className="text-2xl font-bold">{healthLoading ? <Skeleton className="h-8 w-12 mx-auto" /> : health?.failedSubscriptions7d || 0}</div>
            <div className="text-xs font-medium">Failed 7d</div>
            <div className="text-[10px] text-muted-foreground mt-1">{CARD_SUBTITLES['failed_7d']}</div>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer hover:bg-muted/50 transition-colors ${health?.failedWebhooks24h && health.failedWebhooks24h > 0 ? "border-red-500" : ""} ${activeFilter === 'webhooks_24h' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => handleFilterClick('webhooks_24h')}
        >
          <CardContent className="p-4 text-center">
            <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-red-500" />
            <div className="text-2xl font-bold">{healthLoading ? <Skeleton className="h-8 w-12 mx-auto" /> : health?.failedWebhooks24h || 0}</div>
            <div className="text-xs font-medium">Webhooks 24h</div>
            <div className="text-[10px] text-muted-foreground mt-1">{CARD_SUBTITLES['webhooks_24h']}</div>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer hover:bg-muted/50 transition-colors ${health?.azureFailures7d && health.azureFailures7d > 0 ? "border-orange-500" : ""} ${activeFilter === 'azure_failures' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => handleFilterClick('azure_failures')}
        >
          <CardContent className="p-4 text-center">
            <Receipt className="h-6 w-6 mx-auto mb-2 text-orange-500" />
            <div className="text-2xl font-bold">{healthLoading ? <Skeleton className="h-8 w-12 mx-auto" /> : health?.azureFailures7d || 0}</div>
            <div className="text-xs font-medium">Azure Fail 7d</div>
            <div className="text-[10px] text-muted-foreground mt-1">{CARD_SUBTITLES['azure_failures']}</div>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer hover:bg-muted/50 transition-colors ${activeFilter === 'email_failures' ? 'ring-2 ring-primary' : ''}`}
          onClick={() => handleFilterClick('email_failures')}
        >
          <CardContent className="p-4 text-center">
            <Mail className="h-6 w-6 mx-auto mb-2 text-purple-500" />
            <div className="text-2xl font-bold">{healthLoading ? <Skeleton className="h-8 w-12 mx-auto" /> : health?.emailFailures7d || 0}</div>
            <div className="text-xs font-medium">Email Fail 7d</div>
            <div className="text-[10px] text-muted-foreground mt-1">{CARD_SUBTITLES['email_failures']}</div>
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

          {/* Recovery Playbook */}
          {activeFilter && activeFilter !== 'all' && (
            <Alert className="mt-4 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200">
              <Brain className="h-4 w-4 text-blue-500" />
              <AlertTitle className="text-sm font-medium text-blue-700 dark:text-blue-400">Recovery Guide</AlertTitle>
              <AlertDescription className="text-xs text-blue-600 dark:text-blue-500">
                <p className="mb-2">{RECOVERY_PLAYBOOKS[activeFilter].what}</p>
                <ul className="list-disc list-inside space-y-1">
                  {RECOVERY_PLAYBOOKS[activeFilter].actions.map((action, idx) => (
                    <li key={idx}>{action}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {(searchResults && searchResults.length > 0) && (
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">
                    {activeFilter ? `${FILTER_LABELS[activeFilter]}` : `Search Results`}
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">
                    Showing {((currentPage - 1) * pageLimit) + 1}-{Math.min(currentPage * pageLimit, totalUsers)} of {totalUsers}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[300px]">
                  {searchResults.map((user) => {
                    const riskLevel = calculateUserRisk(user);
                    return (
                      <div
                        key={user.id}
                        className={`p-3 border-b cursor-pointer hover:bg-muted transition-colors ${selectedUserId === user.id ? 'bg-muted' : ''}`}
                        onClick={() => handleSelectUser(user.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {/* Risk Indicator */}
                            <Circle 
                              className={`h-3 w-3 flex-shrink-0 ${
                                riskLevel === 'high' ? 'fill-red-500 text-red-500' : 
                                riskLevel === 'medium' ? 'fill-orange-400 text-orange-400' : 
                                'fill-green-500 text-green-500'
                              }`} 
                            />
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
                    );
                  })}
                </ScrollArea>
                
                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between p-3 border-t bg-muted/30">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage <= 1}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    
                    <div className="flex items-center gap-1">
                      {/* First page */}
                      {currentPage > 2 && (
                        <>
                          <Button 
                            variant={currentPage === 1 ? "default" : "ghost"} 
                            size="sm"
                            className="w-8 h-8 p-0"
                            onClick={() => goToPage(1)}
                          >
                            1
                          </Button>
                          {currentPage > 3 && <span className="text-muted-foreground px-1">...</span>}
                        </>
                      )}
                      
                      {/* Pages around current */}
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        
                        if (pageNum < 1 || pageNum > totalPages) return null;
                        if (pageNum === 1 && currentPage > 2) return null;
                        if (pageNum === totalPages && currentPage < totalPages - 1) return null;
                        
                        return (
                          <Button 
                            key={pageNum}
                            variant={currentPage === pageNum ? "default" : "ghost"} 
                            size="sm"
                            className="w-8 h-8 p-0"
                            onClick={() => goToPage(pageNum)}
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                      
                      {/* Last page */}
                      {currentPage < totalPages - 1 && totalPages > 5 && (
                        <>
                          {currentPage < totalPages - 2 && <span className="text-muted-foreground px-1">...</span>}
                          <Button 
                            variant={currentPage === totalPages ? "default" : "ghost"} 
                            size="sm"
                            className="w-8 h-8 p-0"
                            onClick={() => goToPage(totalPages)}
                          >
                            {totalPages}
                          </Button>
                        </>
                      )}
                    </div>
                    
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage >= totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                )}
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
                      <>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>Status: <Badge variant={getStatusBadgeColor(userDetail.subscription.status)}>{userDetail.subscription.status}</Badge></div>
                          <div>Total Paid: R{((userDetail.subscription.totalPaid || 0) / 100).toFixed(2)}</div>
                          {userDetail.subscription.nextBillingDate && (
                            <div className="col-span-2">Next Billing: {format(new Date(userDetail.subscription.nextBillingDate), 'PPP')}</div>
                          )}
                        </div>
                        
                        {/* Paystack recurring subscription info banner */}
                        {(userDetail.subscription.status === 'active' || userDetail.subscription.status === 'trial') && 
                         userDetail.subscription.planId && 
                         userDetail.subscription.paystackReference && (
                          <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                            <div className="flex items-start gap-2">
                              <Info className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                              <div className="text-sm">
                                <p className="font-medium text-blue-700 dark:text-blue-400">Why QR / EFT may be unavailable</p>
                                <p className="text-blue-600 dark:text-blue-500 mt-1">
                                  This user is on a recurring Paystack subscription. Paystack limits some payment methods (such as QR and EFT) when a subscription plan is used, because those channels can't always support automatic renewals.
                                </p>
                                <p className="text-blue-600 dark:text-blue-500 mt-1">
                                  Card and Apple Pay are prioritized to ensure uninterrupted billing.
                                </p>
                                <p className="text-xs text-blue-500 dark:text-blue-600 mt-2 italic">
                                  This is expected Paystack behavior — not an error.
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
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
                    <h4 className="font-medium mb-2 flex items-center gap-2">
                      Email Health
                      <Badge 
                        variant={
                          userDetail.emailHealth?.status === 'healthy' ? 'default' : 
                          userDetail.emailHealth?.status === 'warning' ? 'secondary' : 
                          'destructive'
                        }
                        className={
                          userDetail.emailHealth?.status === 'healthy' ? 'bg-green-500' : 
                          userDetail.emailHealth?.status === 'warning' ? 'bg-orange-500' : 
                          ''
                        }
                      >
                        {userDetail.emailHealth?.status === 'healthy' ? 'Delivered' : 
                         userDetail.emailHealth?.status === 'warning' ? 'Deferred' : 
                         userDetail.emailHealth?.status === 'failed' ? 'Blocked/Bounced' : 'Unknown'}
                      </Badge>
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {userDetail.emailHealth?.lastEmailSent && (
                        <div>
                          Last Email: <span className="text-muted-foreground">
                            {userDetail.emailHealth.lastEmailSent.status} {formatDistanceToNow(new Date(userDetail.emailHealth.lastEmailSent.at), { addSuffix: true })}
                          </span>
                        </div>
                      )}
                      {userDetail.emailHealth?.lastDelivered && (
                        <div>
                          Last Delivered: <span className="text-muted-foreground">
                            {formatDistanceToNow(new Date(userDetail.emailHealth.lastDelivered.at), { addSuffix: true })}
                          </span>
                        </div>
                      )}
                      {userDetail.emailHealth?.lastFailed && (
                        <div className="col-span-2 text-red-500">
                          Last Failed: {userDetail.emailHealth.lastFailed.type} 
                          {userDetail.emailHealth.lastFailed.reason && (
                            <span className="text-xs"> - {userDetail.emailHealth.lastFailed.reason}</span>
                          )}
                        </div>
                      )}
                      {!userDetail.emailHealth?.lastEmailSent && (
                        <div className="col-span-2 text-muted-foreground">No email events recorded</div>
                      )}
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
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => handleAction('resend_verification_email')} disabled={actionMutation.isPending}>
                              <Mail className="h-3 w-3 mr-1" /> Resend Verification
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              onClick={() => handlePreviewEmail('verification')} 
                              disabled={emailPreviewMutation.isPending}
                              title="Preview verification email"
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                          </div>
                        </>
                      )}
                      <Button size="sm" variant="outline" onClick={() => handleAction('restart_trial')} disabled={actionMutation.isPending}>
                        <Play className="h-3 w-3 mr-1" /> Restart Trial
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleAction('activate_subscription')} disabled={actionMutation.isPending}>
                        <CreditCard className="h-3 w-3 mr-1" /> Activate Sub
                      </Button>
                      <div className="flex gap-1">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={handleSendRecoveryEmail} 
                          disabled={!recoveryEmailStatus.canSend || recoveryEmailMutation.isPending}
                          title={recoveryEmailStatus.reason}
                        >
                          {recoveryEmailMutation.isPending ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Mail className="h-3 w-3 mr-1" />
                          )}
                          Send Recovery Email
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => handlePreviewEmail('trial_recovery')} 
                          disabled={emailPreviewMutation.isPending}
                          title="Preview recovery email"
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                      </div>
                      {!recoveryEmailStatus.canSend && userDetail?.user.email && (
                        <span className="text-xs text-muted-foreground self-center">
                          {recoveryEmailStatus.reason}
                        </span>
                      )}
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
            <CardDescription>Recent billing events and payment transactions (last 7 days)</CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const now = new Date();
              const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
              
              const allEvents = [...userDetail.billingEvents, ...userDetail.paymentTransactions.map(p => ({
                id: `payment-${p.id}`,
                eventType: `payment_${p.status}`,
                eventData: { amount: p.amount, currency: p.currency, platform: p.platform },
                processed: true,
                processingError: p.failureReason,
                createdAt: p.createdAt
              }))].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              
              const recentEvents = allEvents.filter(e => new Date(e.createdAt) >= sevenDaysAgo);
              const olderEvents = allEvents.filter(e => new Date(e.createdAt) < sevenDaysAgo);
              
              const categorizeEvent = (eventType: string): 'Billing' | 'Email' | 'Uploads' | 'Admin' | 'Other' => {
                if (eventType.includes('payment') || eventType.includes('subscription') || eventType.includes('invoice')) return 'Billing';
                if (eventType.includes('email') || eventType.includes('verification')) return 'Email';
                if (eventType.includes('upload') || eventType.includes('receipt') || eventType.includes('azure')) return 'Uploads';
                if (eventType.includes('admin') || eventType.includes('action')) return 'Admin';
                return 'Other';
              };
              
              const groupedEvents = recentEvents.reduce((acc, event) => {
                const category = categorizeEvent(event.eventType);
                if (!acc[category]) acc[category] = [];
                acc[category].push(event);
                return acc;
              }, {} as Record<string, typeof recentEvents>);
              
              const categoryOrder = ['Billing', 'Email', 'Uploads', 'Admin', 'Other'];
              
              return (
                <>
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-4">
                      {categoryOrder.map(category => {
                        const events = groupedEvents[category];
                        if (!events || events.length === 0) return null;
                        return (
                          <div key={category}>
                            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                              {category} ({events.length})
                            </div>
                            <div className="space-y-2">
                              {events.map((event, idx) => (
                                <div key={idx} className="flex items-start gap-3 p-3 border rounded-lg">
                                  <div className={`p-2 rounded-full ${
                                    event.processingError ? 'bg-red-100 dark:bg-red-950' : 
                                    event.eventType.includes('success') || event.eventType.includes('completed') ? 'bg-green-100 dark:bg-green-950' : 
                                    'bg-gray-100 dark:bg-gray-800'
                                  }`}>
                                    {event.processingError ? (
                                      <AlertCircle className="h-4 w-4 text-red-500" />
                                    ) : event.eventType.includes('payment') ? (
                                      <CreditCard className="h-4 w-4 text-blue-500" />
                                    ) : event.eventType.includes('email') ? (
                                      <Mail className="h-4 w-4 text-purple-500" />
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
                              ))}
                            </div>
                          </div>
                        );
                      })}
                      
                      {recentEvents.length === 0 && (
                        <div className="text-center text-muted-foreground py-8">
                          No events in the last 7 days
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                  
                  {olderEvents.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setShowOlderEvents(!showOlderEvents)}
                        className="w-full"
                      >
                        {showOlderEvents ? (
                          <>
                            <ChevronUp className="h-4 w-4 mr-2" />
                            Hide older events ({olderEvents.length})
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-4 w-4 mr-2" />
                            Show older events ({olderEvents.length})
                          </>
                        )}
                      </Button>
                      
                      {showOlderEvents && (
                        <ScrollArea className="h-[200px] mt-2">
                          <div className="space-y-2">
                            {olderEvents.map((event, idx) => (
                              <div key={idx} className="flex items-start gap-3 p-3 border rounded-lg opacity-60">
                                <div className={`p-2 rounded-full ${
                                  event.processingError ? 'bg-red-100 dark:bg-red-950' : 'bg-gray-100 dark:bg-gray-800'
                                }`}>
                                  {event.processingError ? (
                                    <AlertCircle className="h-4 w-4 text-red-500" />
                                  ) : (
                                    <Clock className="h-4 w-4 text-gray-500" />
                                  )}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium text-sm">{event.eventType.replace(/_/g, ' ')}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {format(new Date(event.createdAt), 'PP')}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Safer Confirmation Dialog for Destructive Actions */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-orange-600">
                <AlertTriangle className="h-5 w-5" />
                Confirm Destructive Action
              </CardTitle>
              <CardDescription>
                This will immediately affect the user's access.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-200 rounded-lg">
                <p className="font-medium text-sm">Action: {confirmAction.action.replace(/_/g, ' ')}</p>
                {confirmAction.reason && (
                  <p className="text-xs text-muted-foreground mt-1">Reason: {confirmAction.reason}</p>
                )}
              </div>
              
              <div>
                <label className="text-sm font-medium">Type CONFIRM to proceed:</label>
                <Input 
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder="Type CONFIRM"
                  className="mt-2"
                  autoFocus
                />
              </div>
              
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={cancelConfirmAction}>
                  Cancel
                </Button>
                <Button 
                  variant="destructive"
                  onClick={executeConfirmedAction}
                  disabled={confirmInput !== 'CONFIRM' || actionMutation.isPending}
                >
                  {actionMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Execute Action
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Email Preview Modal */}
      {emailPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-lg mx-4">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-blue-500" />
                  Email Preview: {emailPreview.templateName}
                </div>
                <Button variant="ghost" size="sm" onClick={closeEmailPreview}>
                  <X className="h-4 w-4" />
                </Button>
              </CardTitle>
              <CardDescription>
                This shows what will be sent. No email has been sent yet.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <span className="font-medium text-muted-foreground w-20">From:</span>
                  <span>{emailPreview.from}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-medium text-muted-foreground w-20">To:</span>
                  <span>{emailPreview.to || 'No email address'}</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="font-medium text-muted-foreground w-20">Subject:</span>
                  <span>{emailPreview.subject}</span>
                </div>
                {emailPreview.templateId && (
                  <div className="flex items-start gap-2">
                    <span className="font-medium text-muted-foreground w-20">Template:</span>
                    <span className="font-mono text-xs bg-muted px-2 py-1 rounded">{emailPreview.templateId}</span>
                  </div>
                )}
              </div>
              
              <Separator />
              
              <div>
                <h4 className="font-medium mb-2">Template Variables</h4>
                <div className="bg-muted rounded-lg p-3 font-mono text-xs overflow-x-auto">
                  <pre>{JSON.stringify(emailPreview.previewData, null, 2)}</pre>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={closeEmailPreview}>
                  Cancel
                </Button>
                {previewTemplate === 'trial_recovery' && (
                  <Button 
                    onClick={() => {
                      closeEmailPreview();
                      handleSendRecoveryEmail();
                    }}
                    disabled={!recoveryEmailStatus.canSend || recoveryEmailMutation.isPending}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send Email
                  </Button>
                )}
                {previewTemplate === 'verification' && (
                  <Button 
                    onClick={() => {
                      closeEmailPreview();
                      handleAction('resend_verification_email');
                    }}
                    disabled={actionMutation.isPending}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send Email
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
