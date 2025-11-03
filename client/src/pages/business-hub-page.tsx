import { useQuery, useMutation } from "@tanstack/react-query";
import { PageLayout } from "@/components/page-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, FileText, Banknote, Plus, ArrowRight, Calculator, Settings, Bell, Clock, TrendingUp, Mail } from "lucide-react";
import { Link } from "wouter";
import { format, differenceInDays } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { Client, Quotation, Invoice } from "@shared/schema";

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
  suggestedAction: 'send_reminder' | 'send_final_notice' | 'escalate' | 'wait';
  nextReminderDate: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  aiMessage?: string;
  aiSubject?: string;
}

interface DashboardStats {
  totalOverdueCount: number;
  totalOverdueAmount: number;
  remindersNeededCount: number;
  criticalCount: number;
  highCount: number;
  reminders: ReminderSuggestion[];
}

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

  const sendReminderMutation = useMutation({
    mutationFn: async (invoiceId: number) => {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Not authenticated');
      
      const response = await fetch(`/api/invoices/${invoiceId}/send-reminder`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send reminder');
      }

      return response.json();
    },
    onSuccess: () => {
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
            </div>
          </CardContent>
        </Card>

        {/* Sales Report Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card data-testid="stat-total-clients">
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
        </div>

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
                      <div key={reminder.invoice.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <p className="font-medium">{reminder.client.name}</p>
                            <Badge className={urgencyColor}>
                              {reminder.urgency}
                            </Badge>
                            <Badge variant="outline">
                              {reminder.daysOverdue} days overdue
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Invoice {reminder.invoice.invoiceNumber} • {formatCurrency(balance)} outstanding
                          </p>
                          {reminder.aiSubject && (
                            <p className="text-xs text-muted-foreground mt-1 italic">
                              "{reminder.aiSubject}"
                            </p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          onClick={() => {
                            if (confirm(`Send payment reminder to ${reminder.client.name}?`)) {
                              sendReminderMutation.mutate(reminder.invoice.id);
                            }
                          }}
                          disabled={sendReminderMutation.isPending}
                          data-testid={`button-send-reminder-${reminder.invoice.id}`}
                        >
                          <Mail className="h-4 w-4 mr-2" />
                          Send Reminder
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentInvoices.map((invoice) => {
                    const client = clients.find((c) => c.id === invoice.clientId);
                    return (
                      <TableRow key={invoice.id} data-testid={`invoice-row-${invoice.id}`}>
                        <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                        <TableCell>{client?.name || "Unknown"}</TableCell>
                        <TableCell>{formatCurrency(invoice.total)}</TableCell>
                        <TableCell>{format(new Date(invoice.dueDate), "MMM dd, yyyy")}</TableCell>
                        <TableCell>
                          <Badge className={getStatusBadgeColor(invoice.status)}>
                            {invoice.status.replace("_", " ")}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quote #</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentQuotations.map((quotation) => {
                    const client = clients.find((c) => c.id === quotation.clientId);
                    return (
                      <TableRow key={quotation.id} data-testid={`quotation-row-${quotation.id}`}>
                        <TableCell className="font-medium">{quotation.quotationNumber}</TableCell>
                        <TableCell>{client?.name || "Unknown"}</TableCell>
                        <TableCell>{formatCurrency(quotation.total)}</TableCell>
                        <TableCell>{format(new Date(quotation.expiryDate), "MMM dd, yyyy")}</TableCell>
                        <TableCell>
                          <Badge className={getStatusBadgeColor(quotation.status)}>
                            {quotation.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
