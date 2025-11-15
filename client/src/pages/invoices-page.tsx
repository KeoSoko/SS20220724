import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { PageLayout } from "@/components/page-layout";
import { SubscriptionGuard } from "@/lib/subscription-guard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, FileText, Eye, Banknote, Download, Mail } from "lucide-react";
import { Link, useLocation } from "wouter";
import { format, isPast } from "date-fns";
import type { Invoice, Client, LineItem, InvoicePayment } from "@shared/schema";

const paymentFormSchema = z.object({
  amount: z.string().min(1, "Amount is required"),
  paymentDate: z.string().min(1, "Payment date is required"),
  paymentMethod: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type PaymentFormData = z.infer<typeof paymentFormSchema>;

const emailFormSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Message body is required"),
});

type EmailFormData = z.infer<typeof emailFormSchema>;

const formatCurrency = (amount: string | number) => {
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  return `R ${numAmount.toFixed(2)}`;
};

const getStatusBadgeColor = (status: string) => {
  const colors: Record<string, string> = {
    unpaid: "bg-orange-100 text-orange-800",
    partially_paid: "bg-yellow-100 text-yellow-800",
    paid: "bg-green-100 text-green-800",
    overdue: "bg-red-100 text-red-800",
    cancelled: "bg-gray-100 text-gray-600",
  };
  return colors[status] || "bg-gray-100 text-gray-800";
};

export default function InvoicesPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeFilter, setActiveFilter] = useState("all");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<number | null>(null);
  const [isEmailPreviewDialogOpen, setIsEmailPreviewDialogOpen] = useState(false);
  const [emailPreviewData, setEmailPreviewData] = useState<{
    subject: string;
    body: string;
    to: string;
    from: string;
    replyTo: string | null;
    attachmentName: string;
  } | null>(null);

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  // Fetch full invoice details with line items and payments when an invoice is selected
  const { data: invoiceDetails } = useQuery<Invoice & { lineItems: LineItem[], payments: InvoicePayment[] }>({
    queryKey: [`/api/invoices/${selectedInvoice?.id}`],
    enabled: !!selectedInvoice?.id,
  });

  const paymentForm = useForm<PaymentFormData>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      amount: "",
      paymentDate: format(new Date(), "yyyy-MM-dd"),
      paymentMethod: "",
      reference: "",
      notes: "",
    },
  });

  const emailForm = useForm<EmailFormData>({
    resolver: zodResolver(emailFormSchema),
    defaultValues: {
      subject: "",
      body: "",
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/invoices/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      setIsDeleteDialogOpen(false);
      setDeletingInvoiceId(null);
      toast({
        title: "Success",
        description: "Invoice deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const recordPaymentMutation = useMutation({
    mutationFn: async (data: PaymentFormData & { invoiceId: number }) => {
      const { invoiceId, ...paymentData } = data;
      return await apiRequest("POST", `/api/invoices/${invoiceId}/payments`, paymentData);
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      await queryClient.invalidateQueries({ queryKey: [`/api/invoices/${variables.invoiceId}`] });
      // Refetch the updated invoice immediately
      await queryClient.refetchQueries({ queryKey: [`/api/invoices/${variables.invoiceId}`] });
      setIsPaymentDialogOpen(false);
      paymentForm.reset();
      toast({
        title: "Success",
        description: "Payment recorded successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getInvoiceStatus = (invoice: Invoice) => {
    if (invoice.status === "cancelled") return "cancelled";
    if (invoice.status === "paid") return "paid";
    const isOverdue = isPast(new Date(invoice.dueDate)) && invoice.status !== "paid";
    if (isOverdue) return "overdue";
    return invoice.status;
  };

  const filteredInvoices = invoices.filter((inv) => {
    const status = getInvoiceStatus(inv);
    if (activeFilter === "all") return true;
    return status === activeFilter;
  });

  const handleViewDetails = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setIsDetailDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    setDeletingInvoiceId(id);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (deletingInvoiceId) {
      deleteMutation.mutate(deletingInvoiceId);
    }
  };

  const handleRecordPayment = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    const balance = parseFloat(invoice.total) - parseFloat(invoice.amountPaid);
    paymentForm.reset({
      amount: balance.toString(),
      paymentDate: format(new Date(), "yyyy-MM-dd"),
      paymentMethod: "",
      reference: "",
      notes: "",
    });
    setIsPaymentDialogOpen(true);
  };

  const submitPayment = (data: PaymentFormData) => {
    if (selectedInvoice) {
      recordPaymentMutation.mutate({ ...data, invoiceId: selectedInvoice.id });
    }
  };

  const sendInvoiceMutation = useMutation({
    mutationFn: async ({ invoiceId, subject, body }: { invoiceId: number; subject: string; body: string }) => {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Not authenticated');
      
      const response = await fetch(`/api/invoices/${invoiceId}/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ subject, body }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to send invoice');
      }

      return response.json();
    },
    onSuccess: () => {
      setIsEmailPreviewDialogOpen(false);
      toast({
        title: "Success",
        description: "Invoice sent successfully to client",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/invoices'] });
      setIsDetailDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send invoice",
        variant: "destructive",
      });
    },
  });

  const previewEmailMutation = useMutation({
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
        throw new Error(error.error || 'Failed to preview email');
      }

      return response.json();
    },
    onSuccess: (data) => {
      setEmailPreviewData(data);
      emailForm.reset({
        subject: data.subject,
        body: data.body,
      });
      setIsEmailPreviewDialogOpen(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to preview email",
        variant: "destructive",
      });
    },
  });

  const handlePreviewEmail = (invoiceId: number) => {
    previewEmailMutation.mutate(invoiceId);
  };

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      return await apiRequest("PATCH", `/api/invoices/${id}`, { status });
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      await queryClient.invalidateQueries({ queryKey: [`/api/invoices/${variables.id}`] });
      // Refetch the updated invoice immediately
      await queryClient.refetchQueries({ queryKey: [`/api/invoices/${variables.id}`] });
      toast({
        title: "Success",
        description: "Invoice status updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getAvailableStatuses = (currentStatus: string) => {
    const statusRules: Record<string, string[]> = {
      draft: ['draft', 'unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled'],
      unpaid: ['draft', 'unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled'],
      partially_paid: ['unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled'],
      paid: ['unpaid', 'paid', 'cancelled'],
      overdue: ['draft', 'unpaid', 'partially_paid', 'paid', 'overdue', 'cancelled'],
      cancelled: ['draft', 'cancelled'],
    };
    return statusRules[currentStatus] || [currentStatus];
  };

  const handleStatusChange = (newStatus: string) => {
    if (selectedInvoice && newStatus !== selectedInvoice.status) {
      updateStatusMutation.mutate({ id: selectedInvoice.id, status: newStatus });
    }
  };

  const handleDownloadPDF = async (invoiceId: number) => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        toast({
          title: "Error",
          description: "Please log in to download PDF",
          variant: "destructive",
        });
        return;
      }

      const response = await fetch(`/api/invoices/${invoiceId}/pdf`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `invoice-${selectedInvoice?.invoiceNumber || invoiceId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: "PDF downloaded successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download PDF",
        variant: "destructive",
      });
    }
  };

  const invoiceLineItems = invoiceDetails?.lineItems || [];
  const invoicePayments = invoiceDetails?.payments || [];

  const displayInvoice = invoiceDetails || selectedInvoice;

  const selectedClient = displayInvoice
    ? clients.find((c) => c.id === displayInvoice.clientId)
    : null;

  const balance = displayInvoice
    ? parseFloat(displayInvoice.total) - parseFloat(displayInvoice.amountPaid)
    : 0;

  return (
    <SubscriptionGuard featureName="Invoices">
      <PageLayout
        title="Invoices"
        subtitle="Manage your invoices and payments"
        showBackButton={true}
      >
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <h2 className="text-xl md:text-2xl font-bold">All Invoices</h2>
          <Link href="/invoices/new">
            <Button data-testid="button-new-invoice" className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              New Invoice
            </Button>
          </Link>
        </div>

        <Tabs value={activeFilter} onValueChange={setActiveFilter}>
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            <TabsList className="inline-flex min-w-full sm:min-w-0">
              <TabsTrigger value="all" data-testid="filter-all">All</TabsTrigger>
              <TabsTrigger value="unpaid" data-testid="filter-unpaid">Unpaid</TabsTrigger>
              <TabsTrigger value="partially_paid" data-testid="filter-partially-paid">Part. Paid</TabsTrigger>
              <TabsTrigger value="paid" data-testid="filter-paid">Paid</TabsTrigger>
              <TabsTrigger value="overdue" data-testid="filter-overdue">Overdue</TabsTrigger>
              <TabsTrigger value="cancelled" data-testid="filter-cancelled">Cancelled</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value={activeFilter} className="mt-6">
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredInvoices.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-gray-300 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No invoices found
                  </h3>
                  <p className="text-gray-500 mb-4">
                    {activeFilter === "all"
                      ? "Get started by creating your first invoice"
                      : `No ${activeFilter} invoices`}
                  </p>
                  <Link href="/invoices/new">
                    <Button data-testid="button-create-first-invoice">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Invoice
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">Invoice #</TableHead>
                          <TableHead className="whitespace-nowrap">Client</TableHead>
                          <TableHead className="hidden lg:table-cell whitespace-nowrap">Date</TableHead>
                          <TableHead className="whitespace-nowrap">Due Date</TableHead>
                          <TableHead className="whitespace-nowrap">Amount</TableHead>
                          <TableHead className="hidden md:table-cell whitespace-nowrap">Paid</TableHead>
                          <TableHead className="hidden md:table-cell whitespace-nowrap">Balance</TableHead>
                          <TableHead className="whitespace-nowrap">Status</TableHead>
                          <TableHead className="text-right whitespace-nowrap">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredInvoices.map((invoice) => {
                          const client = clients.find((c) => c.id === invoice.clientId);
                          const status = getInvoiceStatus(invoice);
                          const balance = parseFloat(invoice.total) - parseFloat(invoice.amountPaid);
                          return (
                            <TableRow
                              key={invoice.id}
                              className={`cursor-pointer hover:bg-gray-50 ${
                                status === "overdue" ? "bg-red-50" : ""
                              }`}
                              onClick={() => handleViewDetails(invoice)}
                              data-testid={`invoice-row-${invoice.id}`}
                            >
                              <TableCell className="font-medium whitespace-nowrap">
                                {invoice.invoiceNumber}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">{client?.name || "Unknown"}</TableCell>
                              <TableCell className="hidden lg:table-cell whitespace-nowrap">
                                {format(new Date(invoice.date), "MMM dd, yyyy")}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {format(new Date(invoice.dueDate), "MMM dd, yyyy")}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">{formatCurrency(invoice.total)}</TableCell>
                              <TableCell className="hidden md:table-cell whitespace-nowrap">{formatCurrency(invoice.amountPaid)}</TableCell>
                              <TableCell className="hidden md:table-cell whitespace-nowrap">{formatCurrency(balance)}</TableCell>
                              <TableCell className="whitespace-nowrap">
                                <Badge className={getStatusBadgeColor(status)}>
                                  {status.replace("_", " ")}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right whitespace-nowrap">
                                <div
                                  className="flex justify-end gap-1 md:gap-2"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleViewDetails(invoice)}
                                    data-testid={`button-view-${invoice.id}`}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setLocation(`/invoices/${invoice.id}/edit`)}
                                    data-testid={`button-edit-${invoice.id}`}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  {status !== "paid" && status !== "cancelled" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleRecordPayment(invoice)}
                                      data-testid={`button-record-payment-${invoice.id}`}
                                    >
                                      <Banknote className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(invoice.id)}
                                    data-testid={`button-delete-${invoice.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Detail Dialog */}
        <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Invoice Details</DialogTitle>
            </DialogHeader>
            {displayInvoice && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Invoice #</h3>
                    <p className="mt-1">{displayInvoice.invoiceNumber}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-2">Status</h3>
                    <Select
                      value={displayInvoice.status}
                      onValueChange={handleStatusChange}
                      disabled={updateStatusMutation.isPending}
                    >
                      <SelectTrigger data-testid="select-invoice-status" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {getAvailableStatuses(displayInvoice.status).map((status) => (
                          <SelectItem key={status} value={status}>
                            <div className="flex items-center gap-2">
                              <span className={`inline-block px-2 py-1 rounded text-xs ${getStatusBadgeColor(status)}`}>
                                {status.replace("_", " ")}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Date</h3>
                    <p className="mt-1">
                      {format(new Date(displayInvoice.date), "MMM dd, yyyy")}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Due Date</h3>
                    <p className="mt-1">
                      {format(new Date(displayInvoice.dueDate), "MMM dd, yyyy")}
                    </p>
                  </div>
                </div>

                {selectedClient && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-2">Client</h3>
                    <div className="border rounded-lg p-4">
                      <p className="font-medium">{selectedClient.name}</p>
                      {selectedClient.companyName && (
                        <p className="text-sm text-gray-600">{selectedClient.companyName}</p>
                      )}
                      {selectedClient.email && (
                        <p className="text-sm text-gray-600">{selectedClient.email}</p>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Line Items</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40%]">Description</TableHead>
                        <TableHead className="w-[15%]">Quantity</TableHead>
                        <TableHead className="w-[20%]">Unit Price</TableHead>
                        <TableHead className="w-[25%] text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoiceLineItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="break-words">{item.description}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{formatCurrency(item.unitPrice)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="border-t pt-4">
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600">Subtotal</span>
                    <span>{formatCurrency(displayInvoice.subtotal)}</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600">VAT (15%)</span>
                    <span>{formatCurrency(displayInvoice.vatAmount)}</span>
                  </div>
                  <div className="flex justify-between mb-2 font-bold">
                    <span>Total</span>
                    <span>{formatCurrency(displayInvoice.total)}</span>
                  </div>
                  <div className="flex justify-between mb-2 text-green-600">
                    <span>Amount Paid</span>
                    <span>{formatCurrency(displayInvoice.amountPaid)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg border-t pt-2">
                    <span>Balance Due</span>
                    <span>{formatCurrency(balance)}</span>
                  </div>
                </div>

                {invoicePayments.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-2">Payment History</h3>
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Reference</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoicePayments.map((payment) => (
                          <TableRow key={payment.id}>
                            <TableCell>
                              {format(new Date(payment.paymentDate), "MMM dd, yyyy")}
                            </TableCell>
                            <TableCell>{formatCurrency(payment.amount)}</TableCell>
                            <TableCell>{payment.paymentMethod || "-"}</TableCell>
                            <TableCell>{payment.reference || "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    onClick={() => handlePreviewEmail(displayInvoice.id)}
                    disabled={previewEmailMutation.isPending}
                    data-testid="button-send-invoice"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    {previewEmailMutation.isPending ? "Loading..." : "Send to Client"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleDownloadPDF(displayInvoice.id)}
                    data-testid="button-download-pdf"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Record Payment Dialog */}
        <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Payment</DialogTitle>
              <DialogDescription>
                Record a payment for invoice {selectedInvoice?.invoiceNumber}
              </DialogDescription>
            </DialogHeader>
            <Form {...paymentForm}>
              <form onSubmit={paymentForm.handleSubmit(submitPayment)} className="space-y-4">
                <FormField
                  control={paymentForm.control}
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount *</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} data-testid="input-payment-amount" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={paymentForm.control}
                  name="paymentDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Date *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-payment-date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={paymentForm.control}
                  name="paymentMethod"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Method</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger data-testid="select-payment-method">
                            <SelectValue placeholder="Select method" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="eft">EFT</SelectItem>
                          <SelectItem value="card">Card</SelectItem>
                          <SelectItem value="cheque">Cheque</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={paymentForm.control}
                  name="reference"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reference</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-payment-reference" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={paymentForm.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-payment-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsPaymentDialogOpen(false)}
                    data-testid="button-cancel-payment"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={recordPaymentMutation.isPending}
                    data-testid="button-submit-payment"
                  >
                    {recordPaymentMutation.isPending ? "Recording..." : "Record Payment"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent data-testid="dialog-delete-invoice">
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the invoice.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-red-600 hover:bg-red-700"
                data-testid="button-confirm-delete"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Email Preview Dialog */}
        <Dialog open={isEmailPreviewDialogOpen} onOpenChange={setIsEmailPreviewDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-email-preview">
            <DialogHeader>
              <DialogTitle>Review & Edit Email</DialogTitle>
              <DialogDescription>
                Review and edit the AI-generated email before sending to your client
              </DialogDescription>
            </DialogHeader>
            {emailPreviewData && (
              <Form {...emailForm}>
                <form onSubmit={emailForm.handleSubmit((data) => {
                  if (selectedInvoice) {
                    sendInvoiceMutation.mutate({
                      invoiceId: selectedInvoice.id,
                      subject: data.subject,
                      body: data.body,
                    });
                  }
                })} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">From:</label>
                    <p className="text-sm mt-1">{emailPreviewData.from}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Reply-To:</label>
                    <p className="text-sm mt-1">{emailPreviewData.replyTo || 'Not set'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">To:</label>
                    <p className="text-sm mt-1">{emailPreviewData.to}</p>
                  </div>
                  <FormField
                    control={emailForm.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subject</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-email-subject" />
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
                        <FormLabel>Message</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={12}
                            className="font-mono text-sm"
                            data-testid="textarea-email-body"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div>
                    <label className="text-sm font-medium text-gray-500">Attachment:</label>
                    <p className="text-sm mt-1">{emailPreviewData.attachmentName}</p>
                  </div>
                  <DialogFooter className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsEmailPreviewDialogOpen(false)}
                      data-testid="button-close-preview"
                    >
                      Close
                    </Button>
                    <Button
                      type="submit"
                      disabled={sendInvoiceMutation.isPending}
                      data-testid="button-send-from-preview"
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      {sendInvoiceMutation.isPending ? "Sending..." : "Send Email"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </PageLayout>
    </SubscriptionGuard>
  );
}
