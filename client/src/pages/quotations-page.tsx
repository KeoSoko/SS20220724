import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { PageLayout } from "@/components/page-layout";
import { SubscriptionGuard } from "@/lib/subscription-guard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, FileText, Eye, Download, Mail } from "lucide-react";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Quotation, Client, LineItem } from "@shared/schema";

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
  };
  return colors[status] || "bg-gray-100 text-gray-800";
};

export default function QuotationsPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeFilter, setActiveFilter] = useState("all");
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletingQuotationId, setDeletingQuotationId] = useState<number | null>(null);
  const [isEmailPreviewDialogOpen, setIsEmailPreviewDialogOpen] = useState(false);
  const [emailPreviewData, setEmailPreviewData] = useState<{
    subject: string;
    body: string;
    to: string;
    from: string;
    replyTo: string | null;
    attachmentName: string;
  } | null>(null);

  const { data: quotations = [], isLoading } = useQuery<Quotation[]>({
    queryKey: ["/api/quotations"],
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  // Fetch full quotation details with line items when a quotation is selected
  const { data: quotationDetails } = useQuery<Quotation & { lineItems: LineItem[] }>({
    queryKey: [`/api/quotations/${selectedQuotation?.id}`],
    enabled: !!selectedQuotation?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/quotations/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      setIsDeleteDialogOpen(false);
      setDeletingQuotationId(null);
      toast({
        title: "Success",
        description: "Quotation deleted successfully",
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

  const convertToInvoiceMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("POST", `/api/quotations/${id}/convert-to-invoice`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({
        title: "Success",
        description: "Quotation converted to invoice successfully",
      });
      setLocation("/invoices");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const filteredQuotations = quotations.filter((q) => {
    if (activeFilter === "all") return true;
    return q.status === activeFilter;
  });

  const handleViewDetails = (quotation: Quotation) => {
    setSelectedQuotation(quotation);
    setIsDetailDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    setDeletingQuotationId(id);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (deletingQuotationId) {
      deleteMutation.mutate(deletingQuotationId);
    }
  };

  const handleConvertToInvoice = (id: number) => {
    if (confirm("Are you sure you want to convert this quotation to an invoice?")) {
      convertToInvoiceMutation.mutate(id);
    }
  };

  const sendQuotationMutation = useMutation({
    mutationFn: async (quotationId: number) => {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Not authenticated');
      
      const response = await fetch(`/api/quotations/${quotationId}/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        const errorObj: Error & { requiresVerification?: boolean } = new Error(error.error || 'Failed to send quotation');
        if (error.requiresVerification) {
          (errorObj as any).requiresVerification = true;
        }
        throw errorObj;
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Quotation sent successfully to client",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/quotations'] });
      setIsDetailDialogOpen(false);
    },
    onError: (error: Error & { requiresVerification?: boolean }) => {
      if (error.message?.includes("Business email not verified") || error.requiresVerification) {
        toast({
          title: "Email Not Verified",
          description: "Please verify your business email in Business Profile before sending.",
          duration: 10000,
          action: (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setLocation("/business-profile")}
              className="bg-white text-gray-900 hover:bg-gray-50 hover:text-gray-900 border-gray-300"
            >
              Verify Email
            </Button>
          ),
        });
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to send quotation",
          variant: "destructive",
        });
      }
    },
  });

  const handleSendQuotation = (quotationId: number) => {
    if (confirm("Send this quotation to the client via email?")) {
      sendQuotationMutation.mutate(quotationId);
    }
  };

  const previewEmailMutation = useMutation({
    mutationFn: async (quotationId: number) => {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Not authenticated');
      
      const response = await fetch(`/api/quotations/${quotationId}/preview-email`, {
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

  const handlePreviewEmail = (quotationId: number) => {
    previewEmailMutation.mutate(quotationId);
  };

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      return await apiRequest("PATCH", `/api/quotations/${id}`, { status });
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      await queryClient.invalidateQueries({ queryKey: [`/api/quotations/${variables.id}`] });
      // Refetch the updated quotation immediately
      await queryClient.refetchQueries({ queryKey: [`/api/quotations/${variables.id}`] });
      toast({
        title: "Success",
        description: "Quotation status updated successfully",
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
      draft: ['draft', 'sent', 'accepted', 'declined', 'expired'],
      sent: ['draft', 'sent', 'accepted', 'declined', 'expired'],
      accepted: ['accepted', 'declined'],
      declined: ['draft', 'declined'],
      expired: ['draft', 'expired'],
    };
    return statusRules[currentStatus] || [currentStatus];
  };

  const handleStatusChange = (newStatus: string) => {
    if (selectedQuotation && newStatus !== selectedQuotation.status) {
      updateStatusMutation.mutate({ id: selectedQuotation.id, status: newStatus });
    }
  };

  const handleDownloadPDF = async (quotationId: number) => {
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

      const response = await fetch(`/api/quotations/${quotationId}/pdf`, {
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
      link.download = `quotation-${selectedQuotation?.quotationNumber || quotationId}.pdf`;
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

  const quotationLineItems = quotationDetails?.lineItems || [];

  const selectedClient = selectedQuotation
    ? clients.find((c) => c.id === selectedQuotation.clientId)
    : null;

  return (
    <SubscriptionGuard featureName="Quotations">
      <PageLayout
        title="Quotations"
        subtitle="Manage your quotations"
        showBackButton={true}
      >
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">All Quotations</h2>
          <Link href="/quotations/new">
            <Button data-testid="button-new-quotation">
              <Plus className="h-4 w-4 mr-2" />
              New Quotation
            </Button>
          </Link>
        </div>

        <Tabs value={activeFilter} onValueChange={setActiveFilter}>
          <TabsList>
            <TabsTrigger value="all" data-testid="filter-all">All</TabsTrigger>
            <TabsTrigger value="draft" data-testid="filter-draft">Draft</TabsTrigger>
            <TabsTrigger value="sent" data-testid="filter-sent">Sent</TabsTrigger>
            <TabsTrigger value="accepted" data-testid="filter-accepted">Accepted</TabsTrigger>
            <TabsTrigger value="declined" data-testid="filter-declined">Declined</TabsTrigger>
            <TabsTrigger value="expired" data-testid="filter-expired">Expired</TabsTrigger>
          </TabsList>

          <TabsContent value={activeFilter} className="mt-6">
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredQuotations.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-gray-300 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No quotations found
                  </h3>
                  <p className="text-gray-500 mb-4">
                    {activeFilter === "all"
                      ? "Get started by creating your first quotation"
                      : `No ${activeFilter} quotations`}
                  </p>
                  <Link href="/quotations/new">
                    <Button data-testid="button-create-first-quotation">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Quotation
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
                          <TableHead className="whitespace-nowrap">Quote #</TableHead>
                          <TableHead className="whitespace-nowrap">Client</TableHead>
                          <TableHead className="hidden lg:table-cell whitespace-nowrap">Date</TableHead>
                          <TableHead className="whitespace-nowrap">Expiry</TableHead>
                          <TableHead className="whitespace-nowrap">Amount</TableHead>
                          <TableHead className="whitespace-nowrap">Status</TableHead>
                          <TableHead className="text-right whitespace-nowrap">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredQuotations.map((quotation) => {
                          const client = clients.find((c) => c.id === quotation.clientId);
                          return (
                            <TableRow
                              key={quotation.id}
                              className="cursor-pointer hover:bg-gray-50"
                              onClick={() => handleViewDetails(quotation)}
                              data-testid={`quotation-row-${quotation.id}`}
                            >
                              <TableCell className="font-medium whitespace-nowrap">
                                {quotation.quotationNumber}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">{client?.name || "Unknown"}</TableCell>
                              <TableCell className="hidden lg:table-cell whitespace-nowrap">
                                {format(new Date(quotation.date), "MMM dd, yyyy")}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {format(new Date(quotation.expiryDate), "MMM dd, yyyy")}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">{formatCurrency(quotation.total)}</TableCell>
                              <TableCell className="whitespace-nowrap">
                                <Badge className={getStatusBadgeColor(quotation.status)}>
                                  {quotation.status}
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
                                    onClick={() => handleViewDetails(quotation)}
                                    data-testid={`button-view-${quotation.id}`}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setLocation(`/quotations/${quotation.id}/edit`)}
                                    data-testid={`button-edit-${quotation.id}`}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  {quotation.status === "accepted" && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleConvertToInvoice(quotation.id)}
                                      data-testid={`button-convert-${quotation.id}`}
                                      className="hidden md:inline-flex"
                                    >
                                      Convert
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(quotation.id)}
                                    data-testid={`button-delete-${quotation.id}`}
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
              <DialogTitle>Quotation Details</DialogTitle>
            </DialogHeader>
            {selectedQuotation && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Quotation #</h3>
                    <p className="mt-1">{selectedQuotation.quotationNumber}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-2">Status</h3>
                    <Select
                      value={selectedQuotation.status}
                      onValueChange={handleStatusChange}
                      disabled={updateStatusMutation.isPending}
                    >
                      <SelectTrigger data-testid="select-quotation-status" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {getAvailableStatuses(selectedQuotation.status).map((status) => (
                          <SelectItem key={status} value={status}>
                            <div className="flex items-center gap-2">
                              <span className={`inline-block px-2 py-1 rounded text-xs ${getStatusBadgeColor(status)}`}>
                                {status}
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
                      {format(new Date(selectedQuotation.date), "MMM dd, yyyy")}
                    </p>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-gray-500">Expiry Date</h3>
                    <p className="mt-1">
                      {format(new Date(selectedQuotation.expiryDate), "MMM dd, yyyy")}
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
                      {selectedClient.phone && (
                        <p className="text-sm text-gray-600">{selectedClient.phone}</p>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">Line Items</h3>
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Unit Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {quotationLineItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.description}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{formatCurrency(item.unitPrice)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.total)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600">Subtotal</span>
                    <span>{formatCurrency(selectedQuotation.subtotal)}</span>
                  </div>
                  <div className="flex justify-between mb-2">
                    <span className="text-gray-600">VAT (15%)</span>
                    <span>{formatCurrency(selectedQuotation.vatAmount)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span>{formatCurrency(selectedQuotation.total)}</span>
                  </div>
                </div>

                {selectedQuotation.notes && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-2">Notes</h3>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">
                      {selectedQuotation.notes}
                    </p>
                  </div>
                )}

                {selectedQuotation.terms && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-500 mb-2">Terms</h3>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">
                      {selectedQuotation.terms}
                    </p>
                  </div>
                )}

                <div className="flex justify-end gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    onClick={() => handlePreviewEmail(selectedQuotation.id)}
                    disabled={previewEmailMutation.isPending}
                    data-testid="button-preview-email"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    {previewEmailMutation.isPending ? "Loading..." : "Preview Email"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleSendQuotation(selectedQuotation.id)}
                    disabled={sendQuotationMutation.isPending}
                    data-testid="button-send-quotation"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    {sendQuotationMutation.isPending ? "Sending..." : "Send to Client"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleDownloadPDF(selectedQuotation.id)}
                    data-testid="button-download-pdf"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download PDF
                  </Button>
                  {selectedQuotation.status === "accepted" && (
                    <Button
                      onClick={() => handleConvertToInvoice(selectedQuotation.id)}
                      data-testid="button-convert-to-invoice"
                    >
                      Convert to Invoice
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent data-testid="dialog-delete-quotation">
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the quotation.
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
              <DialogTitle>Email Preview</DialogTitle>
              <DialogDescription>
                Preview the AI-generated email before sending to your client
              </DialogDescription>
            </DialogHeader>
            {emailPreviewData && (
              <div className="space-y-4">
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
                <div>
                  <label className="text-sm font-medium text-gray-500">Subject:</label>
                  <p className="text-sm mt-1 font-semibold">{emailPreviewData.subject}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Message:</label>
                  <div className="text-sm mt-1 p-4 bg-gray-50 rounded border whitespace-pre-wrap">
                    {emailPreviewData.body}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Attachment:</label>
                  <p className="text-sm mt-1">{emailPreviewData.attachmentName}</p>
                </div>
              </div>
            )}
            <DialogFooter className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setIsEmailPreviewDialogOpen(false)}
                data-testid="button-close-preview"
              >
                Close
              </Button>
              <Button
                onClick={() => {
                  if (selectedQuotation) {
                    setIsEmailPreviewDialogOpen(false);
                    handleSendQuotation(selectedQuotation.id);
                  }
                }}
                disabled={sendQuotationMutation.isPending}
                data-testid="button-send-from-preview"
              >
                <Mail className="h-4 w-4 mr-2" />
                {sendQuotationMutation.isPending ? "Sending..." : "Send Email"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageLayout>
    </SubscriptionGuard>
  );
}
