import { useQuery, useMutation } from "@tanstack/react-query";
import { PageLayout } from "@/components/page-layout";
import { SubscriptionGuard } from "@/lib/subscription-guard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Users, FileText, Banknote, Plus, ArrowRight, Calculator, Settings, Bell, Clock, TrendingUp, Mail } from "lucide-react";
import { Link } from "wouter";
import { format, differenceInDays } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { Client, Quotation, Invoice } from "@shared/schema";
import { useState } from "react";

interface InvoiceStats {
  totalUnpaid: number;
  overdueCount: number;
  totalPaid?: number;
  thisMonthRevenue?: number;
}

interface ReminderSuggestion {
  invoice: Invoice;
  client: Client;
  daysOverdue: number;
  daysUntilDue?: number;
  suggestedAction: 'send_reminder' | 'send_final_notice' | 'escalate' | 'wait';
  nextReminderDate: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  aiMessage?: string;
  aiSubject?: string;
  reminderType?: 'pre_due' | 'overdue';
}

interface DashboardStats {
  totalOverdueCount: number;
  totalOverdueAmount: number;
  remindersNeededCount: number;
  criticalCount: number;
  highCount: number;
  reminders: ReminderSuggestion[];
}

const emailFormSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Email body is required"),
});

type EmailFormData = z.infer<typeof emailFormSchema>;

const formatCurrency = (amount: string | number) => {
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  return `R ${numAmount.toFixed(2)}`;
};

const getStatusBadgeColor = (status: string) => {
  const colors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-800",
    sent: "bg-blue-100 text-blue-800",
    accepted: "bg-green-100 text-green-800",
    declined: "bg-red-100 text-red-800",
    expired: "bg-gray-100 text-gray-600",
    unpaid: "bg-orange-100 text-orange-800",
    partially_paid: "bg-yellow-100 text-yellow-800",
    paid: "bg-green-100 text-green-800",
    overdue: "bg-red-100 text-red-800",
    cancelled: "bg-gray-100 text-gray-600",
  };
  return colors[status] || "bg-gray-100 text-gray-800";
};

export default function BusinessHubPage() {
  const { toast } = useToast();
  const [emailPreview, setEmailPreview] = useState<{
    invoiceId: number;
    subject: string;
    body: string;
    to: string;
    from: string;
    replyTo: string | null;
    attachmentName: string;
    reminderType: 'overdue' | 'pre_due';
  } | null>(null);

  const emailForm = useForm<EmailFormData>({
    resolver: zodResolver(emailFormSchema),
    defaultValues: {
      subject: "",
      body: "",
    },
  });

  const { data: clients = [], isLoading: loadingClients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: quotations = [], isLoading: loadingQuotations } = useQuery<Quotation[]>({
    queryKey: ["/api/quotations"],
  });

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const { data: invoiceStats } = useQuery<InvoiceStats>({
    queryKey: ["/api/invoices/stats"],
  });

  const { data: dashboardStats, isLoading: loadingDashboardStats } = useQuery<DashboardStats>({
    queryKey: ["/api/business-hub/dashboard-stats"],
  });

  // Fetch current month P&L data for summary widget
  const { data: plData } = useQuery({
    queryKey: ['/api/profit-loss', { period: 'monthly' }],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Not authenticated');
      
      const params = new URLSearchParams({ period: 'monthly' });
      const response = await fetch(`/api/profit-loss?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error('Failed to fetch P&L');
      return response.json();
    }
  });

  const { data: preDueReminders = [], isLoading: loadingPreDueReminders } = useQuery<ReminderSuggestion[]>({
    queryKey: ["/api/business-hub/pre-due-reminders"],
  });

  const previewReminderMutation = useMutation({
    mutationFn: async (invoiceId: number) => {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Not authenticated');
      
      const response = await fetch(`/api/invoices/${invoiceId}/preview-email`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to load email preview');
      }

      return response.json();
    },
    onSuccess: (data, invoiceId) => {
      setEmailPreview({ ...data, invoiceId, reminderType: 'overdue' });
      emailForm.reset({
        subject: data.subject,
        body: data.body,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to load email preview",
        variant: "destructive",
      });
    },
  });

  const sendReminderMutation = useMutation({
    mutationFn: async ({ invoiceId, subject, body }: { invoiceId: number; subject: string; body: string }) => {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Not authenticated');
      
      const response = await fetch(`/api/invoices/${invoiceId}/send-reminder`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ subject, body }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send reminder');
      }

      return response.json();
    },
    onSuccess: () => {
      setEmailPreview(null);
      toast({
        title: "Success",
        description: "Payment reminder sent successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/business-hub/dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send reminder",
        variant: "destructive",
      });
    },
  });

  const previewPreDueReminderMutation = useMutation({
    mutationFn: async (invoiceId: number) => {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Not authenticated');
      
      const response = await fetch(`/api/invoices/${invoiceId}/preview-email`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to load email preview');
      }

      return response.json();
    },
    onSuccess: (data, invoiceId) => {
      setEmailPreview({ ...data, invoiceId, reminderType: 'pre_due' });
      emailForm.reset({
        subject: data.subject,
        body: data.body,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to load email preview",
        variant: "destructive",
      });
    },
  });

  const sendPreDueReminderMutation = useMutation({
    mutationFn: async ({ invoiceId, subject, body }: { invoiceId: number; subject: string; body: string }) => {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Not authenticated');
      
      const response = await fetch(`/api/invoices/${invoiceId}/send-pre-due-reminder`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ subject, body }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send pre-due reminder');
      }

      return response.json();
    },
    onSuccess: () => {
      setEmailPreview(null);
      toast({
        title: "Success",
        description: "Pre-due reminder sent successfully",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/business-hub/pre-due-reminders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send pre-due reminder",
        variant: "destructive",
      });
    },
  });

  const recentQuotations = quotations.slice(0, 5);
  const recentInvoices = invoices.slice(0, 5);

  // Calculate sales metrics
  const totalSales = invoices
    .filter((inv) => inv.status === "paid")
    .reduce((sum, inv) => sum + parseFloat(inv.total), 0);

  const thisMonth = new Date();
  const thisMonthRevenue = invoices
    .filter((inv) => {
      const invDate = new Date(inv.date);
      return (
        inv.status === "paid" &&
        invDate.getMonth() === thisMonth.getMonth() &&
        invDate.getFullYear() === thisMonth.getFullYear()
      );
    })
    .reduce((sum, inv) => sum + parseFloat(inv.total), 0);

  const isLoading = loadingClients || loadingQuotations || loadingInvoices;

  return (
    <SubscriptionGuard featureName="Business Hub">
      <PageLayout
        title="Business Hub"
        subtitle="Manage clients, quotations, and invoices"
        showBackButton={true}
      >
      <div className="p-6 space-y-6">
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Link href="/clients">
                <Button data-testid="button-new-client">
                  <Plus className="h-4 w-4 mr-2" />
                  New Client
                </Button>
              </Link>
              <Link href="/quotations/new">
                <Button data-testid="button-new-quotation">
                  <Plus className="h-4 w-4 mr-2" />
                  New Quotation
                </Button>
              </Link>
              <Link href="/invoices/new">
                <Button data-testid="button-new-invoice">
                  <Plus className="h-4 w-4 mr-2" />
                  New Invoice
                </Button>
              </Link>
              <Link href="/tax-dashboard">
                <Button variant="outline" data-testid="button-tax-dashboard">
                  <Calculator className="h-4 w-4 mr-2" />
                  Tax Dashboard
                </Button>
              </Link>
              <Link href="/business-profile">
                <Button variant="outline" data-testid="button-business-profile">
                  <Settings className="h-4 w-4 mr-2" />
                  Business Profile
                </Button>
              </Link>
              <Link href="/profit-loss">
                <Button variant="outline" data-testid="button-profit-loss">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  P&L Report
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Sales Report Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Link href="/clients" className="no-underline">
            <Card data-testid="stat-total-clients" className="cursor-pointer hover:bg-gray-50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <div className="text-2xl font-bold">{clients.length}</div>
                )}
                <p className="text-xs text-muted-foreground mt-1">Active clients</p>
              </CardContent>
            </Card>
          </Link>

          <Card data-testid="stat-total-sales">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
              <Banknote className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">
                  {formatCurrency(totalSales)}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">All paid invoices</p>
            </CardContent>
          </Card>

          <Card data-testid="stat-this-month-revenue">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
              <Banknote className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">
                  {formatCurrency(thisMonthRevenue)}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">Revenue this month</p>
            </CardContent>
          </Card>

          <Card data-testid="stat-unpaid-invoices">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">
                  {formatCurrency(invoiceStats?.totalUnpaid || 0)}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {invoiceStats?.overdueCount || 0} overdue
              </p>
            </CardContent>
          </Card>

          <Link href="/profit-loss" className="no-underline">
            <Card data-testid="stat-net-profit" className="cursor-pointer hover:bg-gray-50 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {!plData?.profit ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <>
                    <div className={`text-2xl font-bold ${parseFloat(plData.profit.netProfit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(plData.profit.netProfit)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {plData.profit.profitMargin}% margin
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Pre-Due Reminders Section */}
        {preDueReminders.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-600" />
                  Upcoming Payment Reminders
                </CardTitle>
                <CardDescription>Friendly reminders for invoices approaching due dates</CardDescription>
              </div>
              <Badge className="bg-blue-100 text-blue-800">
                {preDueReminders.length} {preDueReminders.length === 1 ? 'reminder' : 'reminders'}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {preDueReminders.slice(0, 5).map((reminder) => {
                  const daysText = reminder.daysUntilDue === 0 
                    ? "due today" 
                    : `due in ${reminder.daysUntilDue} days`;

                  return (
                    <div key={reminder.invoice.id} className="flex items-start justify-between gap-3 p-4 border border-blue-200 rounded-sm bg-blue-50/30 hover:bg-blue-50/50">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                          <p className="font-medium">{reminder.client.name}</p>
                          <Badge className="bg-blue-100 text-blue-800 rounded-none w-fit">
                            {daysText}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground break-words">
                          Invoice {reminder.invoice.invoiceNumber}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {formatCurrency(reminder.invoice.total)}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white shrink-0"
                        onClick={() => previewPreDueReminderMutation.mutate(reminder.invoice.id)}
                        disabled={previewPreDueReminderMutation.isPending}
                        data-testid={`button-send-pre-due-reminder-${reminder.invoice.id}`}
                      >
                        <Mail className="h-4 w-4 md:mr-2" />
                        <span className="hidden md:inline">{previewPreDueReminderMutation.isPending ? 'Loading...' : 'Send Reminder'}</span>
                      </Button>
                    </div>
                  );
                })}
              </div>

              {preDueReminders.length > 5 && (
                <div className="text-center pt-2">
                  <Link href="/invoices">
                    <Button variant="outline" size="sm">
                      View all {preDueReminders.length} upcoming reminders
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Smart Reminders Section */}
        {dashboardStats && dashboardStats.remindersNeededCount > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Smart Reminders
                </CardTitle>
                <CardDescription>AI-powered payment reminders ready to send</CardDescription>
              </div>
              <Badge variant="secondary">
                {dashboardStats.remindersNeededCount} {dashboardStats.remindersNeededCount === 1 ? 'reminder' : 'reminders'}
              </Badge>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {dashboardStats.criticalCount > 0 && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      <strong>{dashboardStats.criticalCount}</strong> critical overdue {dashboardStats.criticalCount === 1 ? 'invoice' : 'invoices'} need immediate attention
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-3">
                  {dashboardStats.reminders.slice(0, 5).map((reminder) => {
                    const balance = (parseFloat(reminder.invoice.total) - parseFloat(reminder.invoice.amountPaid)).toFixed(2);
                    const urgencyColor = {
                      low: "bg-blue-100 text-blue-800",
                      medium: "bg-yellow-100 text-yellow-800",
                      high: "bg-orange-100 text-orange-800",
                      critical: "bg-red-100 text-red-800"
                    }[reminder.urgency];

                    return (
                      <div key={reminder.invoice.id} className="flex items-start justify-between gap-3 p-4 border rounded-sm hover:bg-gray-50">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
                            <p className="font-medium">{reminder.client.name}</p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge className={urgencyColor}>
                                {reminder.urgency}
                              </Badge>
                              <Badge variant="outline">
                                {reminder.daysOverdue} days overdue
                              </Badge>
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground break-words">
                            Invoice {reminder.invoice.invoiceNumber}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatCurrency(balance)} outstanding
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => previewReminderMutation.mutate(reminder.invoice.id)}
                          disabled={previewReminderMutation.isPending}
                          data-testid={`button-send-reminder-${reminder.invoice.id}`}
                          className="shrink-0"
                        >
                          <Mail className="h-4 w-4 md:mr-2" />
                          <span className="hidden md:inline">{previewReminderMutation.isPending ? 'Loading...' : 'Send Reminder'}</span>
                        </Button>
                      </div>
                    );
                  })}
                </div>

                {dashboardStats.remindersNeededCount > 5 && (
                  <div className="text-center pt-2">
                    <Link href="/invoices">
                      <Button variant="outline" size="sm">
                        View all {dashboardStats.remindersNeededCount} reminders
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Overdue Invoices Summary */}
        {dashboardStats && dashboardStats.totalOverdueCount > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Overdue Invoices</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{dashboardStats.totalOverdueCount}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Total amount: {formatCurrency(dashboardStats.totalOverdueAmount)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Critical Priority</CardTitle>
                <Bell className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{dashboardStats.criticalCount}</div>
                <p className="text-xs text-muted-foreground mt-1">Requires immediate action</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">High Priority</CardTitle>
                <Bell className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{dashboardStats.highCount}</div>
                <p className="text-xs text-muted-foreground mt-1">Send reminders soon</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Recent Invoices */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Invoices</CardTitle>
            <Link href="/invoices">
              <Button variant="ghost" size="sm" data-testid="link-view-all-invoices">
                View All <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : recentInvoices.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No invoices yet. Create your first invoice to get started.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Invoice #</TableHead>
                      <TableHead className="whitespace-nowrap">Client</TableHead>
                      <TableHead className="whitespace-nowrap">Amount</TableHead>
                      <TableHead className="whitespace-nowrap">Due Date</TableHead>
                      <TableHead className="whitespace-nowrap">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentInvoices.map((invoice) => {
                      const client = clients.find((c) => c.id === invoice.clientId);
                      return (
                        <TableRow 
                          key={invoice.id} 
                          data-testid={`invoice-row-${invoice.id}`}
                          className="cursor-pointer hover:bg-gray-50"
                          onClick={() => window.location.href = '/invoices'}
                        >
                          <TableCell className="font-medium whitespace-nowrap">{invoice.invoiceNumber}</TableCell>
                          <TableCell className="whitespace-nowrap">{client?.name || "Unknown"}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatCurrency(invoice.total)}</TableCell>
                          <TableCell className="whitespace-nowrap">{format(new Date(invoice.dueDate), "MMM dd, yyyy")}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            <Badge className={getStatusBadgeColor(invoice.status)}>
                              {invoice.status.replace("_", " ")}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Quotations */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Quotations</CardTitle>
            <Link href="/quotations">
              <Button variant="ghost" size="sm" data-testid="link-view-all-quotations">
                View All <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : recentQuotations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No quotations yet. Create your first quotation to get started.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Quote #</TableHead>
                      <TableHead className="whitespace-nowrap">Client</TableHead>
                      <TableHead className="whitespace-nowrap">Amount</TableHead>
                      <TableHead className="whitespace-nowrap">Expiry</TableHead>
                      <TableHead className="whitespace-nowrap">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentQuotations.map((quotation) => {
                      const client = clients.find((c) => c.id === quotation.clientId);
                      return (
                        <TableRow 
                          key={quotation.id} 
                          data-testid={`quotation-row-${quotation.id}`}
                          className="cursor-pointer hover:bg-gray-50"
                          onClick={() => window.location.href = '/quotations'}
                        >
                          <TableCell className="font-medium whitespace-nowrap">{quotation.quotationNumber}</TableCell>
                          <TableCell className="whitespace-nowrap">{client?.name || "Unknown"}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatCurrency(quotation.total)}</TableCell>
                          <TableCell className="whitespace-nowrap">{format(new Date(quotation.expiryDate), "MMM dd, yyyy")}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            <Badge className={getStatusBadgeColor(quotation.status)}>
                              {quotation.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Email Preview Dialog */}
      <Dialog open={!!emailPreview} onOpenChange={() => setEmailPreview(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-email-preview">
          <DialogHeader>
            <DialogTitle>Review & Edit Email</DialogTitle>
            <DialogDescription>
              Review and edit the AI-generated email before sending to your client
            </DialogDescription>
          </DialogHeader>
          
          {emailPreview && (
            <Form {...emailForm}>
              <form onSubmit={emailForm.handleSubmit((data) => {
                if (emailPreview) {
                  if (emailPreview.reminderType === 'pre_due') {
                    sendPreDueReminderMutation.mutate({
                      invoiceId: emailPreview.invoiceId,
                      subject: data.subject,
                      body: data.body,
                    });
                  } else {
                    sendReminderMutation.mutate({
                      invoiceId: emailPreview.invoiceId,
                      subject: data.subject,
                      body: data.body,
                    });
                  }
                }
              })} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">From:</label>
                  <p className="text-sm mt-1">{emailPreview.from}</p>
                </div>
                {emailPreview.replyTo && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Reply-To:</label>
                    <p className="text-sm mt-1">{emailPreview.replyTo}</p>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium text-gray-500">To:</label>
                  <p className="text-sm mt-1">{emailPreview.to}</p>
                </div>
                <FormField
                  control={emailForm.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-500">Subject</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Email subject" data-testid="input-email-subject" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={emailForm.control}
                  name="body"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-500">Message</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Email message"
                          className="min-h-[300px]"
                          data-testid="textarea-email-body"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div>
                  <label className="text-sm font-medium text-gray-500">Attachment:</label>
                  <p className="text-sm mt-1 text-blue-600">{emailPreview.attachmentName}</p>
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setEmailPreview(null)}
                    data-testid="button-close-preview"
                  >
                    Close
                  </Button>
                  <Button
                    type="submit"
                    disabled={sendReminderMutation.isPending || sendPreDueReminderMutation.isPending}
                    data-testid="button-send-from-preview"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    {(sendReminderMutation.isPending || sendPreDueReminderMutation.isPending) ? 'Sending...' : 'Send Email'}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>
    </PageLayout>
    </SubscriptionGuard>
  );
}
