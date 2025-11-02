import { useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/page-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, FileText, Banknote, Plus, ArrowRight, Calculator } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";
import type { Client, Quotation, Invoice } from "@shared/schema";

interface InvoiceStats {
  totalUnpaid: number;
  overdueCount: number;
  totalPaid?: number;
  thisMonthRevenue?: number;
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
            </div>
          </CardContent>
        </Card>

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
