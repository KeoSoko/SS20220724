import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { PageLayout } from '@/components/page-layout';
import { ContentCard, Section, StatusBadge } from '@/components/design-system';
// import { StorageMonitor } from '@/components/storage-monitor';
import { useToast } from '@/hooks/use-toast';
import { User, Mail, Phone, Shield, Edit2, Check, X, AlertCircle, Settings, Tag, ChevronRight, Crown, Trash2, Copy, RefreshCw, Inbox } from 'lucide-react';


// Profile update schema (username is read-only)
const profileFormSchema = z.object({
  fullName: z.string().min(1, "Display name is required").max(100, "Display name must be less than 100 characters"),
  email: z.string().email("Please enter a valid email address"),
  phoneNumber: z.string().optional(),
  birthdate: z.string().optional(),
  gender: z.string().optional(),
  address: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

// Account deletion schema
const deleteAccountSchema = z.object({
  password: z.string().min(1, "Password is required"),
  confirmationText: z.string().min(1, "Confirmation text is required"),
});

type DeleteAccountFormValues = z.infer<typeof deleteAccountSchema>;

// Clear data schema
const clearDataSchema = z.object({
  password: z.string().min(1, "Password is required"),
  confirmationText: z.string().min(1, "Confirmation text is required"),
});

type ClearDataFormValues = z.infer<typeof clearDataSchema>;

// Receipt Email Section Component
function ReceiptEmailSection() {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const { data: receiptEmailData, isLoading } = useQuery<{ receiptEmail: string; receiptEmailId: string }>({
    queryKey: ['/api/user/receipt-email'],
  });

  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/user/receipt-email/regenerate");
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to regenerate email');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/receipt-email'] });
      toast({
        title: "Email address regenerated",
        description: "Your new receipt email address is ready to use.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to regenerate",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleCopy = async () => {
    if (receiptEmailData?.receiptEmail) {
      try {
        await navigator.clipboard.writeText(receiptEmailData.receiptEmail);
        setCopied(true);
        toast({
          title: "Copied!",
          description: "Receipt email address copied to clipboard.",
        });
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        toast({
          title: "Copy failed",
          description: "Please copy the address manually.",
          variant: "destructive",
        });
      }
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 border rounded-none animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
        <div className="h-8 bg-gray-200 rounded w-full"></div>
      </div>
    );
  }

  return (
    <div className="border rounded-none p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Inbox className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium">Email-to-Receipt</p>
          <p className="text-sm text-gray-600 mb-3">
            Forward or send receipt emails to this address to automatically import them to your account.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 bg-gray-50 border rounded-none px-3 py-2 text-sm font-mono break-all">
              {receiptEmailData?.receiptEmail || 'Loading...'}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopy}
                disabled={!receiptEmailData?.receiptEmail}
                className="flex-shrink-0"
                data-testid="button-copy-receipt-email"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span className="ml-1 sm:hidden md:inline">{copied ? 'Copied' : 'Copy'}</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => regenerateMutation.mutate()}
                disabled={regenerateMutation.isPending}
                className="flex-shrink-0"
                data-testid="button-regenerate-receipt-email"
              >
                <RefreshCw className={`h-4 w-4 ${regenerateMutation.isPending ? 'animate-spin' : ''}`} />
                <span className="ml-1 sm:hidden md:inline">New</span>
              </Button>
            </div>
          </div>
          
          <p className="text-xs text-gray-500 mt-2">
            Regenerating creates a new address and disables the old one.
          </p>
        </div>
      </div>
    </div>
  );
}

// Clear Data Dialog Component
function ClearDataDialog({ user }: { user: any }) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  
  const clearForm = useForm<ClearDataFormValues>({
    resolver: zodResolver(clearDataSchema),
    defaultValues: {
      password: "",
      confirmationText: "",
    },
  });

  const clearDataMutation = useMutation({
    mutationFn: async (data: ClearDataFormValues) => {
      console.log('Clear data mutation started with data:', data);
      const response = await apiRequest("DELETE", "/api/account/clear-data", data);
      console.log('Clear data response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error('Clear data error:', errorData);
        throw new Error(errorData.message || errorData.error || 'Failed to clear data');
      }
      
      return response.json();
    },
    onSuccess: (result) => {
      console.log('Clear data success:', result);
      toast({
        title: "Data cleared",
        description: "All your data has been successfully cleared.",
      });
      setIsOpen(false);
      clearForm.reset();
      // Refresh the page to show empty state
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    },
    onError: (error: any) => {
      console.error('Clear data mutation error:', error);
      toast({
        title: "Clear failed", 
        description: error.message || "Failed to clear data. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ClearDataFormValues) => {
    console.log('Clear data form submitted with data:', data);
    clearDataMutation.mutate(data);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-orange-600 border-orange-300 hover:bg-orange-50">
          Clear All My Data
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-orange-600">Clear All Data</DialogTitle>
          <DialogDescription>
            This will permanently delete all your receipts, categories, budgets and analytics while keeping your account active.
            You can continue using Simple Slips with a fresh start.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...clearForm}>
          <form onSubmit={clearForm.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={clearForm.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Enter your password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={clearForm.control}
              name="confirmationText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type "CLEAR ALL MY DATA" to confirm</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="CLEAR ALL MY DATA"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
                disabled={clearDataMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={clearDataMutation.isPending}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {clearDataMutation.isPending ? "Clearing..." : "Clear All Data"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// Delete Account Dialog Component
function DeleteAccountDialog({ user }: { user: any }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  
  const deleteForm = useForm<DeleteAccountFormValues>({
    resolver: zodResolver(deleteAccountSchema),
    defaultValues: {
      password: "",
      confirmationText: "",
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async (data: DeleteAccountFormValues) => {
      const response = await apiRequest("DELETE", "/api/account", data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Account deleted",
        description: "Your account has been permanently deleted.",
      });
      
      // Clear all local storage and redirect
      localStorage.clear();
      sessionStorage.clear();
      queryClient.clear();
      
      // Redirect to login page
      setTimeout(() => {
        navigate("/auth");
      }, 1000);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete account",
        description: error.message || "An error occurred while deleting your account.",
        variant: "destructive",
      });
    },
  });

  const handleDeleteAccount = (data: DeleteAccountFormValues) => {
    deleteAccountMutation.mutate(data);
  };

  const handleCancel = () => {
    setIsOpen(false);
    deleteForm.reset();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Account
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-red-900">Delete Account</DialogTitle>
          <DialogDescription className="text-red-700">
            This action cannot be undone. This will permanently delete your account and remove all your data from our servers.
          </DialogDescription>
        </DialogHeader>
        
        <Form {...deleteForm}>
          <form onSubmit={deleteForm.handleSubmit(handleDeleteAccount)} className="space-y-4">
            <FormField
              control={deleteForm.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current Password</FormLabel>
                  <FormControl>
                    <Input
                      type="password"
                      placeholder="Enter your current password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={deleteForm.control}
              name="confirmationText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Type "DELETE MY ACCOUNT" to confirm
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="DELETE MY ACCOUNT"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter className="sm:justify-start">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={deleteAccountMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={deleteAccountMutation.isPending}
              >
                {deleteAccountMutation.isPending ? (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-none border-2 border-white border-t-transparent" />
                    Deleting...
                  </div>
                ) : (
                  "Delete Account"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function ProfilePage() {
  const [_, navigate] = useLocation();
  const { user, invalidateTokensMutation } = useAuth();
  const [editingField, setEditingField] = useState<string | null>(null);

  const { toast } = useToast();
  
  // Create form
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      fullName: user?.fullName || '',
      email: user?.email || '',
      phoneNumber: user?.phoneNumber || '',
      birthdate: user?.birthdate || '',
      gender: user?.gender || '',
      address: user?.address || '',

    },
  });

  // Update form when user data changes
  useEffect(() => {
    if (user) {
      form.reset({
        fullName: user.fullName || '',
        email: user.email || '',
        phoneNumber: user.phoneNumber || '',
        birthdate: user.birthdate || '',
        gender: user.gender || '',
        address: user.address || '',

      });
    }
  }, [user, form]);

  // Profile update mutation
  const updateProfileMutation = useMutation({
    mutationFn: async (data: Partial<ProfileFormValues>) => {
      if (!user?.id) throw new Error("No user ID available");
      
      const response = await fetch(`/api/user/${user.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update profile');
      }
      
      return response.json();
    },
    onSuccess: (updatedUser) => {
      // Invalidate all user-related queries to force refresh
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      queryClient.invalidateQueries();
      
      // Force a page refresh to update the auth state
      setTimeout(() => {
        window.location.reload();
      }, 500);
      
      setEditingField(null);
      toast({
        title: "Profile updated",
        description: "Your changes will be visible when you log in next time.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message || "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleFieldEdit = (field: keyof ProfileFormValues) => {
    setEditingField(field);
  };

  const handleFieldSave = async (field: keyof ProfileFormValues) => {
    const isValid = await form.trigger(field);
    if (!isValid) return;
    
    const fieldValue = form.getValues(field);
    await updateProfileMutation.mutateAsync({ [field]: fieldValue });
  };

  const handleFieldCancel = () => {
    setEditingField(null);
    form.reset();
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const formatLastLogin = (date: string | Date) => {
    return new Date(date).toLocaleString();
  };

  const handleSecurityLogout = async () => {
    await invalidateTokensMutation.mutateAsync();
    navigate('/auth');
  };



  if (!user) {
    return (
      <PageLayout title="Profile Settings">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Unable to load profile information</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout 
      title="Profile Settings"
      subtitle="Manage your account information and security settings"
      showBackButton={true}
    >
      <div className="space-y-8">
        {/* Identity Section */}
        <Section title="Account Information" description="View and update your account details">
          <ContentCard>
            {/* Profile Avatar - Clean Initials Only */}
            <div className="flex items-center gap-6 mb-8">
              <Avatar className="h-20 w-20">
                <AvatarFallback className="text-xl font-semibold bg-blue-100 text-blue-700">
                  {getInitials(user?.fullName || user?.username || 'U')}
                </AvatarFallback>
              </Avatar>
              <div>
                <h3 className="text-lg font-semibold">{user?.fullName || user?.username}</h3>
                <StatusBadge status="success" className="mt-1">
                  Active Account
                </StatusBadge>
              </div>
            </div>

            <Form {...form}>
              <div className="space-y-6">
                {/* Username - Read Only */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm font-medium">
                      <User className="h-4 w-4" />
                      Username
                      <StatusBadge status="neutral">Read-only</StatusBadge>
                    </label>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-none text-sm font-medium border">
                    {user?.username}
                  </div>
                  <p className="text-xs text-gray-500">Username cannot be changed for security reasons</p>
                </div>

                {/* Full Name */}
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Display Name
                        </FormLabel>
                        {editingField !== 'fullName' && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleFieldEdit('fullName')}
                          >
                            <Edit2 className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                        )}
                      </div>
                      <FormControl>
                        {editingField === 'fullName' ? (
                          <div className="flex gap-2">
                            <Input {...field} placeholder="Enter display name" />
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleFieldSave('fullName')}
                              disabled={updateProfileMutation.isPending}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleFieldCancel}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="p-3 bg-gray-50 rounded-none text-sm">
                            {field.value || 'Not set'}
                          </div>
                        )}
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Email */}
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          Email Address
                        </FormLabel>
                        {editingField !== 'email' && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleFieldEdit('email')}
                          >
                            <Edit2 className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                        )}
                      </div>
                      <FormControl>
                        {editingField === 'email' ? (
                          <div className="flex gap-2">
                            <Input {...field} type="email" placeholder="Enter email address" />
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleFieldSave('email')}
                              disabled={updateProfileMutation.isPending}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleFieldCancel}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="p-3 bg-gray-50 rounded-none text-sm">
                            {field.value}
                          </div>
                        )}
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Phone Number */}
                <FormField
                  control={form.control}
                  name="phoneNumber"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          Phone Number
                        </FormLabel>
                        {editingField !== 'phoneNumber' && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleFieldEdit('phoneNumber')}
                          >
                            <Edit2 className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                        )}
                      </div>
                      <FormControl>
                        {editingField === 'phoneNumber' ? (
                          <div className="flex gap-2">
                            <Input {...field} placeholder="Enter phone number" />
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleFieldSave('phoneNumber')}
                              disabled={updateProfileMutation.isPending}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleFieldCancel}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="p-3 bg-gray-50 rounded-none text-sm">
                            {field.value || 'Not set'}
                          </div>
                        )}
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </Form>
          </ContentCard>
        </Section>

        {/* Account Settings Section */}
        <Section title="Account Settings" description="Customize your account preferences and categories">
          <ContentCard>
            <div className="space-y-4">
              <ReceiptEmailSection />
              
              <Button
                variant="outline"
                className="w-full justify-between p-4 h-auto"
                onClick={() => navigate('/subscription')}
              >
                <div className="flex items-start gap-3 flex-1">
                  <Crown className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="text-left flex-1 min-w-0">
                    <p className="font-medium">Subscription & Billing</p>
                    <p className="text-sm text-gray-600 break-words whitespace-normal">Manage your subscription plan and billing information</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4" />
              </Button>
              
              <Button
                variant="outline"
                className="w-full justify-between p-4 h-auto"
                onClick={() => navigate('/categories')}
              >
                <div className="flex items-start gap-3 flex-1">
                  <Tag className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="text-left flex-1 min-w-0">
                    <p className="font-medium">Expense Categories</p>
                    <p className="text-sm text-gray-600 break-words whitespace-normal">Manage and create custom expense categories</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </ContentCard>
        </Section>

        {/* Account Security Section */}
        <Section title="Account Security" description="Manage your account security and session">
          <ContentCard>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-none">
                <div className="flex items-center gap-3">
                  <Shield className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="font-medium">Account Status</p>
                    <p className="text-sm text-gray-600">Your account is active and secure</p>
                  </div>
                </div>
                <StatusBadge status="success">Active</StatusBadge>
              </div>

              {user.lastLogin && (
                <div className="flex items-center justify-between p-4 border rounded-none">
                  <div>
                    <p className="font-medium">Last Login</p>
                    <p className="text-sm text-gray-600">{formatLastLogin(user.lastLogin)}</p>
                  </div>
                </div>
              )}

              <div className="border-t pl-[16px] pr-[16px] pt-[16px] pb-[16px]">
                <Button
                  variant="outline"
                  onClick={handleSecurityLogout}
                  disabled={invalidateTokensMutation.isPending}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  Sign Out All Devices
                </Button>
                <p className="text-xs text-gray-500 mt-2 pl-[16px] pr-[16px]">
                  This will sign you out of all devices and require you to log in again
                </p>
              </div>
            </div>
          </ContentCard>
        </Section>

        {/* Danger Zone Section */}
        <Section title="Danger Zone" description="Irreversible account actions">
          <ContentCard>
            <div className="space-y-6">
              {/* Clear All Data */}
              <div className="border-2 border-orange-200 rounded-none p-6 bg-orange-50">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <AlertCircle className="h-6 w-6 text-orange-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-orange-900 mb-2">Clear All Data</h3>
                    <p className="text-sm text-orange-700 mb-4">
                      Delete all your receipts, categories, and analytics while keeping your account active. You can start fresh with Simple Slips.
                    </p>
                    <div className="space-y-2 text-sm text-orange-600 mb-6">
                      <p>• All receipts and images will be permanently deleted</p>
                      <p>• Your expense reports and analytics will be lost</p>
                      <p>• Custom categories and budgets will be removed</p>
                      <p>• Subscriptions will remain active</p>
                      <p>• Your account and login will stay the same</p>
                    </div>
                    <ClearDataDialog user={user} />
                  </div>
                </div>
              </div>
              
              {/* Delete Account */}
              <div className="border-2 border-red-200 rounded-none p-6 bg-red-50">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <Trash2 className="h-6 w-6 text-red-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-red-900 mb-2">Delete Account</h3>
                  <p className="text-sm text-red-700 mb-4">
                    Permanently delete your Simple Slips account and all associated data. This action cannot be undone.
                  </p>
                  <div className="space-y-2 text-sm text-red-600 mb-6">
                    <p>• All receipts and images will be permanently deleted</p>
                    <p>• Your expense reports and analytics will be lost</p>
                    <p>• Custom categories and tags will be removed</p>
                    <p>• Active subscriptions will be cancelled</p>
                    <p>• You will lose access immediately</p>
                  </div>
                  <DeleteAccountDialog user={user} />
                  </div>
                </div>
              </div>
            </div>
          </ContentCard>
        </Section>
      </div>
    </PageLayout>
  );
}