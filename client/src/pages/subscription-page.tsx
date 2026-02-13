import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Crown, Calendar, CreditCard, Check, X, AlertCircle, Smartphone, Receipt, ArrowRight, Sparkles, Users, ShieldCheck } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { PageLayout } from '@/components/page-layout';
import { ContentCard } from '@/components/design-system';
import { Link } from 'wouter';
import { PaystackBilling } from '@/components/paystack-billing';
import { iosPurchaseBridge, purchaseSimpleSlipsPremium, restoreSimpleSlipsPurchases, isIOSPurchaseAvailable } from '@/lib/ios-purchase-bridge';

interface SubscriptionPlan {
  id: number;
  name: string;
  displayName: string;
  description: string;
  price: number;
  currency: string;
  billingPeriod: string;
  trialDays: number;
  features: string[];
  googlePlayProductId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
}

interface UserSubscription {
  id: number;
  planId: number;
  status: string;
  subscriptionStartDate: string;
  subscriptionEndDate: string | null;
  nextBillingDate: string | null;
  isTrialActive: boolean;
  trialEndDate: string | null;
  createdAt: string;
  plan?: SubscriptionPlan;
}

interface PaymentTransaction {
  id: number;
  amount: number;
  currency: string;
  status: string;
  paymentMethod: string;
  createdAt: string;
}

export function SubscriptionPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [isPWA, setIsPWA] = useState(false);
  const [showPaymentOptions, setShowPaymentOptions] = useState(false);
  const [isIOSAvailable, setIsIOSAvailable] = useState(false);
  const [isIOSPurchasing, setIsIOSPurchasing] = useState(false);
  const [isIOSPWA, setIsIOSPWA] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  // Detect PWA environment and iOS capability
  useEffect(() => {
    const checkPWA = () => {
      // Detect platform first
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isAndroid = /Android/.test(navigator.userAgent) || 
                        document.referrer.includes('android-app://');
      
      // Check if running as iOS PWA (cannot use App Store billing)
      const isIOSPWAMode = isIOS && window.matchMedia('(display-mode: standalone)').matches;
      setIsIOSPWA(isIOSPWAMode);
      
      // Only consider Android PWA as PWA for billing purposes
      const isPWAMode = isAndroid && (
        window.matchMedia('(display-mode: standalone)').matches ||
        document.referrer.includes('android-app://') ||
        window.location.href.includes('googleplay')
      );
      setIsPWA(isPWAMode);
    };

    const checkIOSCapability = () => {
      // Only set true if running in native iOS app wrapper (not PWA)
      setIsIOSAvailable(isIOSPurchaseAvailable());
    };

    checkPWA();
    checkIOSCapability();
    window.addEventListener('resize', checkPWA);
    return () => window.removeEventListener('resize', checkPWA);
  }, []);

  // Listen for iOS subscription events
  useEffect(() => {
    const handleSubscriptionActivated = (event: CustomEvent) => {
      console.log('🍎 Subscription activated:', event.detail);
      toast({
        title: "Subscription Activated!",
        description: "Your Simple Slips Premium subscription is now active.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/billing/subscription'] });
      queryClient.invalidateQueries({ queryKey: ['/api/subscription/status'] });
      setIsIOSPurchasing(false);
      setShowPaymentOptions(false);
    };

    const handlePurchaseFailed = (event: CustomEvent) => {
      console.error('🍎 Purchase failed:', event.detail);
      toast({
        title: "Purchase Failed",
        description: event.detail.error || "iOS purchase could not be completed.",
        variant: "destructive",
      });
      setIsIOSPurchasing(false);
    };

    const handlePurchasesRestored = (event: CustomEvent) => {
      console.log('🍎 Purchases restored:', event.detail);
      toast({
        title: "Purchases Restored",
        description: `${event.detail.count} purchase(s) restored from iOS.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/billing/subscription'] });
      queryClient.invalidateQueries({ queryKey: ['/api/subscription/status'] });
    };

    window.addEventListener('simple-slips-subscription-activated', handleSubscriptionActivated as EventListener);
    window.addEventListener('simple-slips-purchase-failed', handlePurchaseFailed as EventListener);
    window.addEventListener('simple-slips-purchases-restored', handlePurchasesRestored as EventListener);

    return () => {
      window.removeEventListener('simple-slips-subscription-activated', handleSubscriptionActivated as EventListener);
      window.removeEventListener('simple-slips-purchase-failed', handlePurchaseFailed as EventListener);
      window.removeEventListener('simple-slips-purchases-restored', handlePurchasesRestored as EventListener);
    };
  }, [toast, queryClient]);

  // Check if user is authenticated
  if (!user) {
    return (
      <PageLayout title="Subscription">
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Please log in to access subscription settings</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  const { data: statusData } = useQuery<{
    hasActiveSubscription: boolean;
    isInTrial: boolean;
    subscriptionType: string;
    workspaceContext: {
      isOwner: boolean;
      workspaceName?: string;
      ownerName?: string;
    } | null;
  }>({
    queryKey: ['/api/subscription/status'],
    retry: 2,
    enabled: !!user,
  });

  const isWorkspaceMember = statusData?.workspaceContext && !statusData.workspaceContext.isOwner;

  // Fetch subscription plans
  const { data: plansData, isLoading: plansLoading, error: plansError } = useQuery({
    queryKey: ['/api/billing/plans'],
    retry: 2,
  });

  // Fetch user subscription
  const { data: subscriptionData, isLoading: subscriptionLoading, error: subscriptionError } = useQuery({
    queryKey: ['/api/billing/subscription'],
    retry: 2,
    enabled: !!user, // Only fetch when user is available
  });

  // Fetch payment history
  const { data: transactionsData, isLoading: transactionsLoading, error: transactionsError } = useQuery({
    queryKey: ['/api/billing/transactions'],
    retry: 2,
    enabled: !!user, // Only fetch when user is available
  });


  // Cancel subscription mutation
  const cancelMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/billing/cancel'),
    onSuccess: () => {
      toast({
        title: "Subscription Cancelled",
        description: "Your subscription has been cancelled. You'll continue to have access until the end of your billing period.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/billing/subscription'] });
      queryClient.invalidateQueries({ queryKey: ['/api/subscription/status'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel subscription",
        variant: "destructive",
      });
    },
  });

  const allPlans: SubscriptionPlan[] = (plansData as any)?.plans || [];
  // Filter out trial plans from available plans - trials are automatic
  const plans = allPlans.filter(plan => plan.name !== 'free_trial');
  const subscription: UserSubscription | null = (subscriptionData as any)?.subscription || null;
  const transactions: PaymentTransaction[] = (transactionsData as any)?.transactions || [];

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: number, currency: string = 'ZAR') => {
    // Convert from cents to currency unit (amount is stored in cents)
    const amountInCurrency = amount / 100;
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: currency,
    }).format(amountInCurrency);
  };

  const getSubscriptionStatus = () => {
    if (!subscription) return 'No subscription';
    
    if (subscription.isTrialActive) {
      const trialEndDate = subscription.trialEndDate ? new Date(subscription.trialEndDate) : null;
      const daysLeft = trialEndDate ? Math.max(0, Math.ceil((trialEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;
      return `Free Trial - ${daysLeft} days left`;
    }
    
    return subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1);
  };


  // Handle subscription - show payment options
  const handleSubscribe = async (plan: SubscriptionPlan) => {
    try {
      if (plan.name === 'free_trial') {
        // Free trials are started automatically on signup - no manual action needed
        toast({
          title: "Trial Already Active",
          description: "Your free trial was automatically started when you signed up. Start uploading receipts to begin!",
          variant: "default",
        });
        return;
      }
      
      // GUARD: Prevent duplicate subscriptions if user already has active subscription with remaining time
      if (subscription?.status === 'active' && subscription?.nextBillingDate) {
        const daysRemaining = Math.ceil((new Date(subscription.nextBillingDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysRemaining > 0) {
          toast({
            title: "Already Subscribed",
            description: `You already have an active subscription valid for ${daysRemaining} more days. No need to pay again!`,
            variant: "default",
          });
          return;
        }
      }
      
      // Set selected plan and show payment options
      setSelectedPlan(plan);
      setShowPaymentOptions(true);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to initiate subscription process",
        variant: "destructive",
      });
    }
  };

  // Handle Google Play payment
  const handleGooglePlayPayment = async () => {
    if (!selectedPlan) return;
    
    // Check if we're in a PWA/mobile environment
    if (isPWA) {
      // In PWA - simulate Google Play billing
      toast({
        title: "Google Play Purchase",
        description: "This would redirect to Google Play Store for subscription purchase in a deployed PWA.",
      });
      
      // For demo purposes, simulate a successful purchase
      setTimeout(() => {
        const mockPurchase = {
          purchaseToken: `demo_token_${Date.now()}`,
          orderId: `demo_order_${Date.now()}`,
          productId: selectedPlan.googlePlayProductId,
          subscriptionId: selectedPlan.googlePlayProductId
        };
        
        // Process the mock purchase
        processPurchaseMutation.mutate(mockPurchase);
      }, 2000);
      
    } else {
      // On web - show instructions for mobile app
      toast({
        title: "Mobile App Required",
        description: "Google Play subscriptions are available through our mobile app. Install Simple Slips from the Google Play Store.",
        variant: "default",
      });
    }
  };

  // Handle Paystack payment success
  const handlePaystackSuccess = (reference: string) => {
    processPaystackMutation.mutate(reference);
  };

  // Handle iOS App Store payment
  const handleIOSPayment = async () => {
    // Safety check: Don't attempt iOS purchase if not in native app
    if (isIOSPWA) {
      toast({
        title: "Not Available",
        description: "Apple In-App Purchases are not available in iOS web apps. Please use Paystack or download our native app from the App Store.",
        variant: "destructive",
      });
      return;
    }
    
    if (!selectedPlan || !isIOSAvailable) {
      toast({
        title: "Not Available",
        description: "iOS In-App Purchase capability not detected. Please use Paystack for web-based subscriptions.",
        variant: "destructive",
      });
      return;
    }
    
    setIsIOSPurchasing(true);
    
    try {
      await purchaseSimpleSlipsPremium();
      // Success will be handled by the event listener
    } catch (error: any) {
      console.error('iOS purchase failed:', error);
      toast({
        title: "Purchase Failed",
        description: error.message || "Failed to complete iOS purchase",
        variant: "destructive",
      });
      setIsIOSPurchasing(false);
    }
  };

  // Handle restore iOS purchases
  const handleRestoreIOSPurchases = async () => {
    // Safety check: Don't attempt iOS restore if not in native app
    if (isIOSPWA) {
      toast({
        title: "Not Available",
        description: "Purchase restoration is only available in our native iOS app from the App Store.",
        variant: "destructive",
      });
      return;
    }
    
    if (!isIOSAvailable) {
      toast({
        title: "Not Available",
        description: "iOS purchase restoration capability not detected.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      toast({
        title: "Restoring Purchases",
        description: "Checking for previous iOS purchases...",
      });
      
      await restoreSimpleSlipsPurchases();
      // Success will be handled by the event listener
    } catch (error: any) {
      console.error('iOS restore failed:', error);
      toast({
        title: "Restore Failed",
        description: error.message || "Failed to restore iOS purchases",
        variant: "destructive",
      });
    }
  };

  // Process Google Play purchase mutation
  const processPurchaseMutation = useMutation({
    mutationFn: (purchase: any) => apiRequest('POST', '/api/billing/google-play/purchase', purchase),
    onSuccess: () => {
      toast({
        title: "Subscription Activated",
        description: "Your premium subscription is now active!",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/billing/subscription'] });
      queryClient.invalidateQueries({ queryKey: ['/api/subscription/status'] });
      setShowPaymentOptions(false);
    },
    onError: (error: any) => {
      toast({
        title: "Purchase Failed",
        description: error.message || "Failed to process subscription purchase",
        variant: "destructive",
      });
    },
  });

  // Process Paystack subscription mutation
  const processPaystackMutation = useMutation({
    mutationFn: (reference: string) => apiRequest('POST', '/api/billing/paystack/subscription', { reference }),
    onSuccess: () => {
      toast({
        title: "Subscription Activated",
        description: "Your premium subscription is now active!",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/billing/subscription'] });
      queryClient.invalidateQueries({ queryKey: ['/api/subscription/status'] });
      setShowPaymentOptions(false);
    },
    onError: (error: any) => {
      toast({
        title: "Subscription Failed",
        description: error.message || "Failed to activate subscription",
        variant: "destructive",
      });
    },
  });

  // Show errors if any critical API calls fail
  if (plansError) {
    return (
      <PageLayout title="Subscription">
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <p className="text-gray-600">Failed to load subscription plans</p>
            <p className="text-sm text-gray-500 mt-2">{(plansError as Error).message}</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (plansLoading) {
    return (
      <PageLayout title="Subscription">
        <div className="flex justify-center items-center h-64">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading subscription information...</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Subscription">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Current Subscription Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5" />
              Current Subscription
            </CardTitle>
          </CardHeader>
          <CardContent>
            {subscriptionError ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Unable to load subscription status. Please try refreshing the page.
                </AlertDescription>
              </Alert>
            ) : subscriptionLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Loading subscription status...</span>
              </div>
            ) : isWorkspaceMember ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 flex items-center justify-center">
                    <ShieldCheck className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <Badge variant="default" className="bg-green-600 text-white">
                      Covered by workspace
                    </Badge>
                    <p className="text-sm text-muted-foreground mt-1">
                      Your access is managed by <strong>{statusData?.workspaceContext?.ownerName}</strong> through the <strong>{statusData?.workspaceContext?.workspaceName}</strong> workspace.
                    </p>
                  </div>
                </div>
                <Alert className="border-green-200 bg-green-50">
                  <Users className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    You have full access to all features as a workspace member. Billing is handled by the workspace owner.
                  </AlertDescription>
                </Alert>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <Badge variant={subscription?.status === 'active' ? 'default' : 'secondary'}>
                    {getSubscriptionStatus()}
                  </Badge>
                  {subscription?.nextBillingDate && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Next billing: {formatDate(subscription.nextBillingDate)}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {subscription?.status === 'active' && (
                    <Button
                      variant="outline"
                      onClick={() => cancelMutation.mutate()}
                      disabled={cancelMutation.isPending}
                    >
                      {cancelMutation.isPending && (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      )}
                      Cancel Subscription
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Available Plans - hidden for workspace members since billing is managed by owner */}
        {!isWorkspaceMember && plans.length > 0 ? (
          <div className="space-y-6">
            {/* Billing Period Toggle */}
            <Card className="bg-gradient-to-r from-primary/5 to-primary/10">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center space-y-4">
                  <h3 className="text-lg font-semibold">Choose Your Billing Cycle</h3>
                  <div className="flex items-center space-x-4">
                    <Label 
                      htmlFor="billing-toggle" 
                      className={`text-sm font-medium cursor-pointer ${billingPeriod === 'monthly' ? 'text-primary' : 'text-muted-foreground'}`}
                    >
                      Monthly
                    </Label>
                    <Switch
                      id="billing-toggle"
                      checked={billingPeriod === 'yearly'}
                      onCheckedChange={(checked) => setBillingPeriod(checked ? 'yearly' : 'monthly')}
                      data-testid="switch-billing-period"
                    />
                    <div className="flex items-center gap-2">
                      <Label 
                        htmlFor="billing-toggle" 
                        className={`text-sm font-medium cursor-pointer ${billingPeriod === 'yearly' ? 'text-primary' : 'text-muted-foreground'}`}
                      >
                        Yearly
                      </Label>
                      <Badge variant="default" className="bg-green-600 text-white">
                        <Sparkles className="h-3 w-3 mr-1" />
                        Save 10%
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground text-center">
                    {billingPeriod === 'yearly' 
                      ? 'Pay R530/year and save R58 compared to monthly billing' 
                      : 'R49/month - flexible billing, cancel anytime'}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Display Selected Plan */}
            {(() => {
              const selectedBillingPlan = plans.find(p => p.billingPeriod === billingPeriod);
              if (!selectedBillingPlan) return null;
              
              return (
                <Card className={subscription?.planId === selectedBillingPlan.id ? 'ring-2 ring-primary' : ''}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>{selectedBillingPlan.displayName || selectedBillingPlan.name}</CardTitle>
                      {billingPeriod === 'yearly' && (
                        <Badge variant="default" className="bg-green-600">Best Value</Badge>
                      )}
                    </div>
                    <CardDescription>{selectedBillingPlan.description}</CardDescription>
                    <div className="text-3xl font-bold">
                      {formatCurrency(selectedBillingPlan.price)}
                      <span className="text-sm font-normal text-muted-foreground">
                        /{selectedBillingPlan.billingPeriod === 'yearly' ? 'year' : 'month'}
                      </span>
                    </div>
                    {billingPeriod === 'yearly' && (
                      <p className="text-sm text-green-600">
                        That's only R44.17/month - Save R58 annually!
                      </p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {selectedBillingPlan.features.map((feature, index) => (
                        <li key={index} className="flex items-center gap-2">
                          <Check className="h-4 w-4 text-green-500" />
                          <span className="text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    {subscription?.planId === selectedBillingPlan.id && subscription?.status === 'active' ? (
                      <Badge variant="default" className="w-full justify-center py-2">
                        Current Plan
                      </Badge>
                    ) : (
                      <Button
                        className="w-full"
                        onClick={() => handleSubscribe(selectedBillingPlan)}
                        data-testid="button-subscribe"
                      >
                        {subscription?.status === 'cancelled' ? 'Resubscribe Now' : 'Subscribe Now'}
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              );
            })()}
          </div>
        ) : !isWorkspaceMember ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No subscription plans available at this time</p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Trial Information & Mobile App CTA */}
        {!subscription && !isWorkspaceMember && (
          <div className="space-y-4">
            <Alert>
              <Calendar className="h-4 w-4" />
              <AlertDescription>
                Start your 30-day free trial to access all premium features including unlimited receipt processing,
                advanced analytics, and AI-powered tax insights.
              </AlertDescription>
            </Alert>
            
            {/* Mobile App Installation Prompt - Only show on web browsers, not in downloaded apps */}
            {!isPWA && !window.matchMedia('(display-mode: standalone)').matches && !(window.navigator as any).standalone && !document.referrer.includes('android-app://') && (
              <Alert>
                <Smartphone className="h-4 w-4" />
                <AlertDescription>
                  <div className="flex items-center justify-between">
                    <span>Get the best experience with our mobile app from Google Play Store</span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => window.open('https://play.google.com/store/apps/details?id=app.simpleslips.twa', '_blank')}
                    >
                      Download App
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Payment Options Modal */}
        {showPaymentOptions && selectedPlan && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-background max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold">Choose Payment Method</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPaymentOptions(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-4 mb-6">
                  <h3 className="text-lg font-medium">Selected Plan: {selectedPlan.displayName}</h3>
                  <p className="text-muted-foreground">{selectedPlan.description}</p>
                </div>

                <div className="grid lg:grid-cols-2 gap-6">
                  {/* Paystack Payment Option */}
                  <PaystackBilling
                    plan={selectedPlan}
                    userId={user?.id || 0}
                    userEmail={user?.email || ''}
                    onPaymentSuccess={handlePaystackSuccess}
                    onPaymentError={(error) => {
                      toast({
                        title: "Payment Error",
                        description: error.message || "Payment failed",
                        variant: "destructive",
                      });
                    }}
                  />

                  {/* Simplified Payment Message - Paystack for Everyone */}
                  <div className="flex items-start">
                    <Alert className="border-primary/20 h-fit">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Simple Payment:</strong> All users can subscribe using Paystack above - works on web, Android, and iOS. No app store required!
                      </AlertDescription>
                    </Alert>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Recent Payment History - only show when payments exist and not workspace member */}
        {!isWorkspaceMember && subscription && transactions.length > 0 && (
          <div className="mt-8">
            <ContentCard>
              <h3 className="text-lg font-semibold mb-4">Recent Payments</h3>
              <div className="space-y-3">
                {transactions.slice(0, 3).map((transaction) => (
                  <div key={transaction.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                        <Receipt className="w-4 h-4 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium">{formatCurrency(transaction.amount, transaction.currency)}</p>
                        <p className="text-sm text-gray-600">{formatDate(transaction.createdAt)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                      </Badge>
                      <p className="text-xs text-gray-500 mt-1 capitalize">
                        {transaction.paymentMethod?.replace('_', ' ') || 'Unknown'}
                      </p>
                    </div>
                  </div>
                ))}
                
                {transactions.length > 3 && (
                  <div className="text-center pt-2">
                    <Link href="/payment-history">
                      <Button variant="outline" size="sm">
                        View All {transactions.length} Payments
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                )}
                
                {transactions.length <= 3 && transactions.length > 0 && (
                  <div className="text-center pt-2">
                    <Link href="/payment-history">
                      <Button variant="outline" size="sm">
                        View Payment History
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            </ContentCard>
          </div>
        )}
        
        {/* App Store Required Subscription Information - hidden for workspace members */}
        {!isWorkspaceMember && <div className="mt-8 pt-6 border-t border-gray-200">
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-4">Subscription Information</h3>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm text-gray-700 max-w-2xl mx-auto">
              <p><strong>Subscription:</strong> Simple Slips Premium</p>
              <p><strong>Duration:</strong> Monthly (auto-renewable)</p>
              <p><strong>Price:</strong> R49.00 per month</p>
              <p><strong>Free Trial:</strong> 30 days included</p>
              <p className="pt-2 text-xs">
                Subscription automatically renews unless auto-renew is turned off at least 24 hours before the end of the current period. 
                Payment will be charged to your App Store account at confirmation of purchase. 
                You can manage and cancel your subscriptions by going to your account settings on the App Store after purchase.
              </p>
            </div>
            <div className="flex justify-center gap-4 mt-4 text-sm">
              <a 
                href="https://simpleslips.co.za/terms" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 underline"
              >
                Terms of Use
              </a>
              <span className="text-gray-400">•</span>
              <a 
                href="https://simpleslips.co.za/privacy" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 underline"
              >
                Privacy Policy
              </a>
            </div>
          </div>
        </div>}
      </div>
    </PageLayout>
  );
}