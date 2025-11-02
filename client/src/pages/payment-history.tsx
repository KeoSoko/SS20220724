import { PageLayout } from "@/components/page-layout";
import { ContentCard, Section } from "@/components/design-system";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { Calendar, Download, Receipt, Search, Filter, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

interface PaymentTransaction {
  id: number;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  platform: string;
  platformTransactionId: string;
  createdAt: string;
}

export default function PaymentHistory() {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");

  // Fetch payment transactions
  const { data: transactionsData, isLoading, error } = useQuery({
    queryKey: ['/api/billing/transactions'],
    retry: 2,
    enabled: !!user,
  });

  const transactions: PaymentTransaction[] = (transactionsData as any)?.transactions || [];

  // Format currency with cents conversion
  const formatCurrency = (amount: number, currency: string = 'ZAR') => {
    const amountInCurrency = amount / 100;
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: currency,
    }).format(amountInCurrency);
  };

  const formatDate = (dateString: string) => {
    return format(parseISO(dateString), 'dd MMM yyyy');
  };

  const formatDateTime = (dateString: string) => {
    return format(parseISO(dateString), 'dd MMM yyyy, HH:mm');
  };

  // Filter transactions based on search and filters
  const filteredTransactions = useMemo(() => {
    return transactions.filter(transaction => {
      const matchesSearch = searchTerm === "" || 
        transaction.platformTransactionId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        transaction.platform.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === "all" || transaction.status === statusFilter;
      const matchesMethod = methodFilter === "all" || transaction.paymentMethod === methodFilter;
      
      return matchesSearch && matchesStatus && matchesMethod;
    });
  }, [transactions, searchTerm, statusFilter, methodFilter]);

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return <Badge variant="default" className="bg-green-100 text-green-800">Completed</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPaymentMethodIcon = (method: string) => {
    if (!method) return '💳'; // Default icon for undefined methods
    switch (method.toLowerCase()) {
      case 'paystack':
        return '💳';
      case 'google_play':
        return '🤖';
      case 'apple':
        return '🍎';
      default:
        return '💰';
    }
  };

  const handleExportCSV = () => {
    const csvContent = [
      ['Date', 'Amount', 'Currency', 'Status', 'Payment Method', 'Transaction ID'],
      ...filteredTransactions.map(t => [
        formatDate(t.createdAt), // Use date only, not datetime
        (t.amount / 100).toString(), // Convert from cents to currency
        t.currency,
        t.status,
        t.paymentMethod || 'Unknown',
        t.platformTransactionId
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simple-slips-payment-history-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Calculate summary stats
  const totalPaid = transactions.reduce((sum, t) => sum + (t.status === 'completed' ? t.amount : 0), 0);
  const successfulPayments = transactions.filter(t => t.status === 'completed').length;

  if (isLoading) {
    return (
      <PageLayout title="Payment History">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout title="Payment History">
        <ContentCard>
          <div className="text-center py-8">
            <Receipt className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Unable to load payment history</p>
            <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </div>
        </ContentCard>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Payment History">
      {/* Back to Subscription */}
      <div className="mb-6">
        <Link href="/subscription">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Subscription
          </Button>
        </Link>
      </div>

      {/* Summary Cards */}
      <Section>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Paid</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(totalPaid)}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Successful Payments</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{successfulPayments}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Average Payment</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {successfulPayments > 0 ? formatCurrency(totalPaid / successfulPayments) : formatCurrency(0)}
              </div>
            </CardContent>
          </Card>
        </div>
      </Section>

      {/* Filters and Search */}
      <ContentCard>
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by transaction ID or payment method..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={methodFilter} onValueChange={setMethodFilter}>
            <SelectTrigger className="w-full md:w-40">
              <SelectValue placeholder="Method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Methods</SelectItem>
              <SelectItem value="paystack">Paystack</SelectItem>
              <SelectItem value="google_play">Google Play</SelectItem>
              <SelectItem value="apple">Apple</SelectItem>
            </SelectContent>
          </Select>
          
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Transaction Table */}
        {filteredTransactions.length === 0 ? (
          <div className="text-center py-12">
            <Receipt className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No transactions found</h3>
            <p className="text-gray-600">
              {transactions.length === 0 
                ? "You haven't made any payments yet."
                : "No transactions match your current filters."
              }
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Payment Method</TableHead>
                  <TableHead>Transaction ID</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-2 text-gray-400" />
                        {formatDateTime(transaction.createdAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold">
                        {formatCurrency(transaction.amount, transaction.currency)}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(transaction.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <span className="mr-2">{getPaymentMethodIcon(transaction.paymentMethod)}</span>
                        <span className="capitalize">{transaction.paymentMethod?.replace('_', ' ') || 'Unknown'}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {transaction.platformTransactionId}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">
                        <Receipt className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </ContentCard>
    </PageLayout>
  );
}