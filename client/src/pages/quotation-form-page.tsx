import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { PageLayout } from "@/components/page-layout";
import { SubscriptionGuard } from "@/lib/subscription-guard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useRoute, useLocation } from "wouter";
import { Plus, Trash2, Save, Send, Mail } from "lucide-react";
import { format } from "date-fns";
import type { Client, Quotation, LineItem, BusinessProfile } from "@shared/schema";

const quotationFormSchema = z.object({
  clientId: z.number().min(1, "Client is required"),
  quotationNumber: z.string().min(1, "Quotation number is required"),
  date: z.string().min(1, "Date is required"),
  expiryDate: z.string().min(1, "Expiry date is required"),
  notes: z.string().optional(),
  terms: z.string().optional(),
  lineItems: z.array(
    z.object({
      description: z.string().min(1, "Description is required"),
      quantity: z.string().min(1, "Quantity is required"),
      unitPrice: z.string().min(1, "Unit price is required"),
    })
  ).min(1, "At least one line item is required"),
});

type QuotationFormData = z.infer<typeof quotationFormSchema>;

const formatCurrency = (amount: string | number) => {
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  return `R ${numAmount.toFixed(2)}`;
};

const emailFormSchema = z.object({
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Message is required"),
});

type EmailFormData = z.infer<typeof emailFormSchema>;

export default function QuotationFormPage() {
  const { toast } = useToast();
  const [, params] = useRoute("/quotations/:id/edit");
  const [, setLocation] = useLocation();
  const quotationId = params?.id ? parseInt(params.id) : null;
  const isEditing = quotationId !== null;
  const [isEmailPreviewDialogOpen, setIsEmailPreviewDialogOpen] = useState(false);
  const [emailPreviewData, setEmailPreviewData] = useState<{
    subject: string;
    body: string;
    to: string;
    from: string;
    replyTo: string | null;
    attachmentName: string;
    quotationId: number;
  } | null>(null);

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: businessProfile } = useQuery<BusinessProfile>({
    queryKey: ["/api/business-profile"],
  });

  const { data: existingQuotation } = useQuery<Quotation & { lineItems: LineItem[] }>({
    queryKey: [`/api/quotations/${quotationId}`],
    enabled: !!quotationId,
  });

  const form = useForm<QuotationFormData>({
    resolver: zodResolver(quotationFormSchema),
    defaultValues: {
      clientId: 0,
      quotationNumber: "Auto-generated",
      date: format(new Date(), "yyyy-MM-dd"),
      expiryDate: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
      notes: "",
      terms: "Payment due within 30 days of acceptance.",
      lineItems: [{ description: "", quantity: "1", unitPrice: "0" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lineItems",
  });

  const emailForm = useForm<EmailFormData>({
    resolver: zodResolver(emailFormSchema),
    defaultValues: {
      subject: "",
      body: "",
    },
  });

  // Load existing quotation data
  useEffect(() => {
    if (existingQuotation) {
      const quotationLineItems = existingQuotation.lineItems || [];
      form.reset({
        clientId: existingQuotation.clientId,
        quotationNumber: existingQuotation.quotationNumber,
        date: format(new Date(existingQuotation.date), "yyyy-MM-dd"),
        expiryDate: format(new Date(existingQuotation.expiryDate), "yyyy-MM-dd"),
        notes: existingQuotation.notes || "",
        terms: existingQuotation.terms || "",
        lineItems: quotationLineItems.length > 0 
          ? quotationLineItems.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            }))
          : [{ description: "", quantity: "1", unitPrice: "0" }],
      });
    }
  }, [existingQuotation, form]);

  const lineItems = form.watch("lineItems");

  const calculateLineTotal = (quantity: string, unitPrice: string) => {
    const qty = parseFloat(quantity) || 0;
    const price = parseFloat(unitPrice) || 0;
    return qty * price;
  };

  const subtotal = lineItems.reduce((sum, item) => {
    return sum + calculateLineTotal(item.quantity, item.unitPrice);
  }, 0);

  const isVatRegistered = businessProfile?.isVatRegistered || false;
  const vatAmount = isVatRegistered ? subtotal * 0.15 : 0;
  const total = subtotal + vatAmount;

  const createMutation = useMutation({
    mutationFn: async (data: QuotationFormData & { status: string }) => {
      // Calculate totals fresh from the current form data
      const formSubtotal = data.lineItems.reduce((sum, item) => {
        const qty = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.unitPrice) || 0;
        return sum + (qty * price);
      }, 0);
      
      const formVatAmount = isVatRegistered ? formSubtotal * 0.15 : 0;
      const formTotal = formSubtotal + formVatAmount;
      
      console.log('[QuotationForm] Creating with subtotal:', formSubtotal, 'vatAmount:', formVatAmount, 'total:', formTotal);
      const quotationData = {
        ...data,
        date: new Date(data.date),
        expiryDate: new Date(data.expiryDate),
        subtotal: formSubtotal.toString(),
        vatAmount: formVatAmount.toString(),
        total: formTotal.toString(),
      };
      console.log('[QuotationForm] Sending data:', quotationData);
      return await apiRequest("POST", "/api/quotations", quotationData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      toast({
        title: "Success",
        description: "Quotation created successfully",
      });
      setLocation("/quotations");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: QuotationFormData & { status: string }) => {
      // Calculate totals fresh from the current form data
      const formSubtotal = data.lineItems.reduce((sum, item) => {
        const qty = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.unitPrice) || 0;
        return sum + (qty * price);
      }, 0);
      
      const formVatAmount = isVatRegistered ? formSubtotal * 0.15 : 0;
      const formTotal = formSubtotal + formVatAmount;
      
      const quotationData = {
        ...data,
        date: new Date(data.date),
        expiryDate: new Date(data.expiryDate),
        subtotal: formSubtotal.toString(),
        vatAmount: formVatAmount.toString(),
        total: formTotal.toString(),
      };
      return await apiRequest("PUT", `/api/quotations/${quotationId}`, quotationData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
      queryClient.invalidateQueries({ queryKey: [`/api/quotations/${quotationId}`] });
      toast({
        title: "Success",
        description: "Quotation updated successfully",
      });
      setLocation("/quotations");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const previewEmailMutation = useMutation({
    mutationFn: async (quotationId: number) => {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Not authenticated');
      
      const response = await fetch(`/api/quotations/${quotationId}/preview-email`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || 'Failed to preview email');
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

  const sendQuotationMutation = useMutation({
    mutationFn: async ({ quotationId, subject, body }: { quotationId: number; subject: string; body: string }) => {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Not authenticated');
      
      const response = await fetch(`/api/quotations/${quotationId}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ subject, body }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || 'Failed to send email');
      }

      return response.json();
    },
    onSuccess: () => {
      setIsEmailPreviewDialogOpen(false);
      setEmailPreviewData(null);
      toast({
        title: "Success",
        description: "Quotation sent successfully to client",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/quotations'] });
      setLocation("/quotations");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send email",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: QuotationFormData, status: string) => {
    const formData = { ...data, status };
    if (isEditing) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleCreateAndSend = (data: QuotationFormData) => {
    // Create quotation as draft first
    const formData = { ...data, status: "draft" };
    
    // Calculate totals
    const formSubtotal = data.lineItems.reduce((sum, item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.unitPrice) || 0;
      return sum + (qty * price);
    }, 0);
    
    const formVatAmount = isVatRegistered ? formSubtotal * 0.15 : 0;
    const formTotal = formSubtotal + formVatAmount;
    
    const quotationData = {
      ...formData,
      date: new Date(data.date),
      expiryDate: new Date(data.expiryDate),
      subtotal: formSubtotal.toString(),
      vatAmount: formVatAmount.toString(),
      total: formTotal.toString(),
    };

    apiRequest("POST", "/api/quotations", quotationData)
      .then((result: any) => {
        queryClient.invalidateQueries({ queryKey: ["/api/quotations"] });
        // Immediately preview email for the newly created quotation
        previewEmailMutation.mutate(result.id);
      })
      .catch((error: Error) => {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive",
        });
      });
  };

  return (
    <SubscriptionGuard featureName="Quotations">
      <PageLayout
        title={isEditing ? "Edit Quotation" : "Create Quotation"}
        subtitle={isEditing ? "Update quotation details" : "Create a new quotation"}
        showBackButton={true}
      >
      <div className="p-6">
        <Form {...form}>
          <form className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Quotation Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="clientId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Client *</FormLabel>
                        <Select
                          value={field.value?.toString()}
                          onValueChange={(value) => field.onChange(parseInt(value))}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-client">
                              <SelectValue placeholder="Select client" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {clients.map((client) => (
                              <SelectItem key={client.id} value={client.id.toString()}>
                                {client.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="quotationNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quotation Number</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            data-testid="input-quotation-number"
                            disabled={!isEditing}
                            placeholder={isEditing ? "" : "Auto-generated (e.g., QUO-20251102-001)"}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date *</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="expiryDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Expiry Date *</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-expiry-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Line Items</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ description: "", quantity: "1", unitPrice: "0" })}
                  data-testid="button-add-line-item"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40%]">Description</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Unit Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, index) => (
                      <TableRow key={field.id}>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`lineItems.${index}.description`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input
                                    {...field}
                                    placeholder="Item description"
                                    data-testid={`input-description-${index}`}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`lineItems.${index}.quantity`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input
                                    {...field}
                                    type="number"
                                    step="0.01"
                                    data-testid={`input-quantity-${index}`}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`lineItems.${index}.unitPrice`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input
                                    {...field}
                                    type="number"
                                    step="0.01"
                                    data-testid={`input-unit-price-${index}`}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(
                            calculateLineTotal(
                              lineItems[index].quantity,
                              lineItems[index].unitPrice
                            )
                          )}
                        </TableCell>
                        <TableCell>
                          {fields.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => remove(index)}
                              data-testid={`button-remove-line-${index}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="mt-6 flex justify-end">
                  <div className="w-64 space-y-2">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span>{formatCurrency(subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>VAT (15%):</span>
                      <span>{formatCurrency(vatAmount)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg border-t pt-2">
                      <span>Total:</span>
                      <span>{formatCurrency(total)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Additional Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} data-testid="input-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="terms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Terms and Conditions</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} data-testid="input-terms" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setLocation("/quotations")}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={form.handleSubmit((data) => handleSubmit(data, "draft"))}
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-save-draft"
              >
                <Save className="h-4 w-4 mr-2" />
                Save as Draft
              </Button>
              {!isEditing && (
                <Button
                  type="button"
                  onClick={form.handleSubmit(handleCreateAndSend)}
                  disabled={createMutation.isPending || updateMutation.isPending || previewEmailMutation.isPending}
                  data-testid="button-create-and-send"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {previewEmailMutation.isPending ? "Loading..." : "Create & Send"}
                </Button>
              )}
              {isEditing && (
                <Button
                  type="button"
                  onClick={form.handleSubmit((data) => handleSubmit(data, "draft"))}
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </Button>
              )}
            </div>
          </form>
        </Form>
      </div>

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
                if (emailPreviewData) {
                  sendQuotationMutation.mutate({
                    quotationId: emailPreviewData.quotationId,
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
                        <Textarea {...field} rows={10} data-testid="input-email-body" />
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
                    disabled={sendQuotationMutation.isPending}
                    data-testid="button-send-from-preview"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    {sendQuotationMutation.isPending ? "Sending..." : "Send Email"}
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
