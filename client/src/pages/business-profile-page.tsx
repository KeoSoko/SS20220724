import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState, useRef } from "react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { PageLayout } from "@/components/page-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { Save, Upload, X, Image as ImageIcon, Mail, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import type { BusinessProfile } from "@shared/schema";
import { format } from "date-fns";

const businessProfileSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  tradingName: z.string().optional(),
  registrationNumber: z.string().optional(),
  vatNumber: z.string().optional(),
  isVatRegistered: z.boolean().default(false),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  website: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  province: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().default("South Africa"),
  bankName: z.string().optional(),
  accountHolder: z.string().optional(),
  accountNumber: z.string().optional(),
  branchCode: z.string().optional(),
  swiftCode: z.string().optional(),
});

type BusinessProfileFormData = z.infer<typeof businessProfileSchema>;

export default function BusinessProfilePage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [logoPreview, setLogoPreview] = useState<string>("");
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: businessProfile, isLoading } = useQuery<BusinessProfile>({
    queryKey: ["/api/business-profile"],
    retry: false,
  });

  // Email verification status query
  const { data: emailVerificationStatus, isLoading: isLoadingEmailStatus } = useQuery<{
    hasIdentity: boolean;
    isVerified: boolean;
    email: string | null;
    verifiedAt: string | null;
    lastError: string | null;
  }>({
    queryKey: ["/api/business-email/status"],
    retry: false,
  });

  // Initiate email verification mutation
  const initiateVerificationMutation = useMutation({
    mutationFn: async (email: string) => {
      return await apiRequest("POST", "/api/business-email/initiate-verification", { email });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-email/status"] });
      toast({
        title: "Verification Initiated",
        description: "Please verify this email in SendGrid: Settings → Sender Authentication → Verify Single Sender",
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

  // Mark email as verified mutation
  const markVerifiedMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/business-email/mark-verified");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-email/status"] });
      toast({
        title: "Email Verified",
        description: "Your email is now verified! You can send quotations and invoices.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Verification Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Set logo preview from existing profile
  useEffect(() => {
    if (businessProfile?.logoUrl) {
      setLogoPreview(businessProfile.logoUrl);
    }
  }, [businessProfile]);

  const form = useForm<BusinessProfileFormData>({
    resolver: zodResolver(businessProfileSchema),
    defaultValues: {
      companyName: "",
      tradingName: "",
      registrationNumber: "",
      vatNumber: "",
      isVatRegistered: false,
      email: "",
      phone: "",
      website: "",
      address: "",
      city: "",
      province: "",
      postalCode: "",
      country: "South Africa",
      bankName: "",
      accountHolder: "",
      accountNumber: "",
      branchCode: "",
      swiftCode: "",
    },
  });

  // Load existing profile data when query resolves
  useEffect(() => {
    if (businessProfile) {
      // Auto-populate email with login email if business email is empty
      const emailToUse = businessProfile.email || (businessProfile as any).loginEmail || "";
      
      form.reset({
        companyName: businessProfile.companyName || "",
        tradingName: businessProfile.tradingName || "",
        registrationNumber: businessProfile.registrationNumber || "",
        vatNumber: businessProfile.vatNumber || "",
        isVatRegistered: businessProfile.isVatRegistered || false,
        email: emailToUse,
        phone: businessProfile.phone || "",
        website: businessProfile.website || "",
        address: businessProfile.address || "",
        city: businessProfile.city || "",
        province: businessProfile.province || "",
        postalCode: businessProfile.postalCode || "",
        country: businessProfile.country || "South Africa",
        bankName: businessProfile.bankName || "",
        accountHolder: businessProfile.accountHolder || "",
        accountNumber: businessProfile.accountNumber || "",
        branchCode: businessProfile.branchCode || "",
        swiftCode: businessProfile.swiftCode || "",
      });
      
      // If we auto-populated with login email, just update the form
      // Don't save yet - wait for user to fill required fields and click save
      // But do initiate verification check so it's ready when they save
      if (!businessProfile.email && (businessProfile as any).loginEmail && emailToUse) {
        // Trigger verification check in background
        setTimeout(() => {
          initiateVerificationMutation.mutate(emailToUse);
          
          // After initiating, test if it's already verified
          setTimeout(() => {
            markVerifiedMutation.mutate();
          }, 1500);
        }, 500);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessProfile]);

  // Auto-trigger email verification when email changes
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === "email" && value.email) {
        const newEmail = value.email;
        const verifiedEmail = emailVerificationStatus?.email;
        
        // Only trigger if email is valid and different from verified email
        if (newEmail && newEmail !== verifiedEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
          initiateVerificationMutation.mutate(newEmail);
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form, emailVerificationStatus, initiateVerificationMutation]);

  const saveMutation = useMutation({
    mutationFn: async (data: BusinessProfileFormData) => {
      return await apiRequest("POST", "/api/business-profile", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-profile"] });
      toast({
        title: "Success",
        description: "Business profile saved successfully",
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

  const uploadLogoMutation = useMutation({
    mutationFn: async (logoData: string) => {
      return await apiRequest("POST", "/api/business-profile/logo", { logoData });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-profile"] });
      setLogoPreview(data.logoUrl);
      toast({
        title: "Success",
        description: "Logo uploaded successfully",
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

  const removeLogoMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", "/api/business-profile/logo");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-profile"] });
      setLogoPreview("");
      toast({
        title: "Success",
        description: "Logo removed successfully",
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

  const onSubmit = (data: BusinessProfileFormData) => {
    saveMutation.mutate(data);
  };

  const handleLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Error",
        description: "Please select an image file",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "Logo must be smaller than 5MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingLogo(true);

    try {
      // Convert to base64
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64Data = event.target?.result as string;
        setLogoPreview(base64Data);
        
        // Upload to server
        uploadLogoMutation.mutate(base64Data);
        setIsUploadingLogo(false);
      };
      reader.onerror = () => {
        toast({
          title: "Error",
          description: "Failed to read file",
          variant: "destructive",
        });
        setIsUploadingLogo(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to process image",
        variant: "destructive",
      });
      setIsUploadingLogo(false);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = () => {
    if (confirm("Are you sure you want to remove your logo?")) {
      removeLogoMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <PageLayout title="Business Profile" subtitle="Set up your business information" showBackButton={true}>
        <div className="p-6">Loading...</div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title="Business Profile"
      subtitle="Manage your business information for quotations and invoices"
      showBackButton={true}
    >
      <div className="p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Company Logo */}
            <Card>
              <CardHeader>
                <CardTitle>Company Logo</CardTitle>
                <CardDescription>Upload your business logo for quotations and invoices</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col items-center space-y-4">
                  {logoPreview ? (
                    <div className="relative">
                      <div className="w-32 h-32 border-2 border-gray-200 rounded-lg overflow-hidden bg-white flex items-center justify-center">
                        <img
                          src={logoPreview}
                          alt="Company logo"
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0"
                        onClick={handleRemoveLogo}
                        disabled={removeLogoMutation.isPending}
                        data-testid="button-remove-logo"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
                      <ImageIcon className="h-12 w-12 text-gray-400" />
                    </div>
                  )}
                  
                  <div className="flex flex-col items-center space-y-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleLogoSelect}
                      className="hidden"
                      data-testid="input-logo-file"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingLogo || uploadLogoMutation.isPending}
                      data-testid="button-upload-logo"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {isUploadingLogo || uploadLogoMutation.isPending ? "Uploading..." : logoPreview ? "Change Logo" : "Upload Logo"}
                    </Button>
                    <p className="text-xs text-gray-500">PNG, JPG or WEBP. Max 5MB.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Email Sending Identity */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Email Sending Identity
                </CardTitle>
                <CardDescription>Verify your business email to send quotations and invoices to clients</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoadingEmailStatus ? (
                  <div className="text-sm text-muted-foreground">Loading verification status...</div>
                ) : (
                  <>
                    {/* Current Email Display */}
                    {businessProfile?.email && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">Business Email</p>
                            <p className="text-sm text-muted-foreground">{businessProfile.email}</p>
                          </div>
                          
                          {/* Verification Status Badge */}
                          {emailVerificationStatus?.isVerified ? (
                            <Badge className="bg-green-500 hover:bg-green-600" data-testid="badge-verified">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Verified
                            </Badge>
                          ) : emailVerificationStatus?.hasIdentity ? (
                            <Badge className="bg-yellow-500 hover:bg-yellow-600" data-testid="badge-pending">
                              <Clock className="h-3 w-3 mr-1" />
                              Pending Verification
                            </Badge>
                          ) : (
                            <Badge variant="destructive" data-testid="badge-not-configured">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Not Configured
                            </Badge>
                          )}
                        </div>

                        {/* Verified Date */}
                        {emailVerificationStatus?.isVerified && emailVerificationStatus?.verifiedAt && (
                          <p className="text-xs text-green-600" data-testid="text-verified-date">
                            Verified on {format(new Date(emailVerificationStatus.verifiedAt), "PPP")}
                          </p>
                        )}

                        {/* Error Message */}
                        {emailVerificationStatus?.lastError && !emailVerificationStatus?.isVerified && (
                          <div className="rounded-md bg-destructive/10 p-3" data-testid="alert-error">
                            <p className="text-xs text-destructive font-medium">Verification Error:</p>
                            <p className="text-xs text-destructive">{emailVerificationStatus.lastError}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Instructions */}
                    <div className="rounded-md bg-blue-50 dark:bg-blue-950 p-3 border border-blue-200 dark:border-blue-800">
                      <p className="text-xs text-blue-900 dark:text-blue-100">
                        <strong>Instructions:</strong> To send quotations/invoices, verify your email in SendGrid: 
                        Settings → Sender Authentication → Verify Single Sender
                      </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      {(!emailVerificationStatus?.hasIdentity || 
                        (businessProfile?.email && businessProfile.email !== emailVerificationStatus?.email)) && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            const email = businessProfile?.email;
                            if (email) {
                              initiateVerificationMutation.mutate(email);
                            }
                          }}
                          disabled={!businessProfile?.email || initiateVerificationMutation.isPending}
                          data-testid="button-setup-verification"
                        >
                          <Mail className="h-4 w-4 mr-2" />
                          {initiateVerificationMutation.isPending ? "Setting Up..." : "Set Up Email Verification"}
                        </Button>
                      )}

                      {emailVerificationStatus?.hasIdentity && !emailVerificationStatus?.isVerified && (
                        <Button
                          type="button"
                          onClick={() => markVerifiedMutation.mutate()}
                          disabled={markVerifiedMutation.isPending}
                          data-testid="button-test-verify"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          {markVerifiedMutation.isPending ? "Verifying..." : "Test & Verify Email"}
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Company Information */}
            <Card>
              <CardHeader>
                <CardTitle>Company Information</CardTitle>
                <CardDescription>Basic details about your business</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="companyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Name *</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-company-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="tradingName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Trading Name</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-trading-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="registrationNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Registration Number</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-registration-number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="isVatRegistered"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">VAT Registered</FormLabel>
                          <FormDescription>
                            Are you registered for VAT in South Africa?
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-vat-registered"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
                {form.watch("isVatRegistered") && (
                  <FormField
                    control={form.control}
                    name="vatNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>VAT Number</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-vat-number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </CardContent>
            </Card>

            {/* Contact Information */}
            <Card>
              <CardHeader>
                <CardTitle>Contact Information</CardTitle>
                <CardDescription>How clients can reach you</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" {...field} data-testid="input-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-phone" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>Website</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-website" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Address Information */}
            <Card>
              <CardHeader>
                <CardTitle>Address Information</CardTitle>
                <CardDescription>Your business location</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Street Address</FormLabel>
                      <FormControl>
                        <Textarea {...field} data-testid="input-address" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>City</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-city" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="province"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Province</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-province" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="postalCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Postal Code</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-postal-code" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-country" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Banking Information */}
            <Card>
              <CardHeader>
                <CardTitle>Banking Information</CardTitle>
                <CardDescription>Bank details for receiving payments</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="bankName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bank Name</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-bank-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="accountHolder"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account Holder</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-account-holder" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="accountNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account Number</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-account-number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="branchCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Branch Code</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-branch-code" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="swiftCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SWIFT Code</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-swift-code" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                data-testid="button-save-profile"
              >
                <Save className="h-4 w-4 mr-2" />
                {saveMutation.isPending ? "Saving..." : "Save Profile"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </PageLayout>
  );
}
