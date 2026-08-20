import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CreditCard, Shield, Globe } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface PaystackBillingProps {
  plan: {
    id: number;
    name: string;
    displayName: string;
    price: number;
    currency: string;
    billingPeriod: string;
    paystackPlanCode?: string | null;
  };
  renewalRecovery?: boolean;
  onPaymentSuccess?: (reference: string) => void;
  onPaymentError?: (error: any) => void;
}

interface ServerCheckout {
  attemptId: number;
  reference: string;
  expiresAt: string;
  billingOwnerUserId: number;
  planId: number;
  planName: string;
  planCode: string;
  amount: number;
  currency: string;
  billingPeriod: string;
  email: string;
}

export function PaystackBilling({
  plan,
  renewalRecovery = false,
  onPaymentSuccess,
  onPaymentError,
}: PaystackBillingProps) {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [billingUnavailable, setBillingUnavailable] = useState(false);

  const initializePaystackPayment = async () => {
    setIsProcessing(true);
    setBillingUnavailable(false);

    if (!(window as any).PaystackPop) {
      toast({
        title: "Payment Error",
        description: "Paystack payment system is not available. Please try again later.",
        variant: "destructive",
      });
      setIsProcessing(false);
      return;
    }

    let checkout: ServerCheckout;
    try {
      const response = await apiRequest('POST', '/api/billing/paystack/checkout', {
        planId: plan.id,
        renewalRecovery,
      });
      const payload = await response.json();
      if (payload.status === 'completed') {
        setIsProcessing(false);
        toast({
          title: "Payment Recovered",
          description: payload.message || "Your previous payment was verified and applied.",
        });
        onPaymentSuccess?.(payload.reference);
        return;
      }
      checkout = payload.checkout;
    } catch (error: any) {
      setIsProcessing(false);
      // If it's an email verification error, the global handler will show the dialog
      // Don't show toast - dialog handles the user feedback
      // Check multiple ways the error type might be indicated
      const isVerificationError = 
        error?.silent === true ||
        error?.errorType === 'email_verification_required' ||
        error?.responseData?.error === 'email_verification_required' ||
        error?.message?.includes('email_verification_required') ||
        error?.message?.includes('Email verification required');
      
      if (isVerificationError) {
        // Dialog is already shown by global event handler, just return silently
        return;
      }
      const isBillingUnavailable =
        error?.responseData?.code === 'billing_temporarily_unavailable' ||
        error?.responseData?.error === 'billing_temporarily_unavailable' ||
        error?.message?.includes('billing_temporarily_unavailable');
      if (isBillingUnavailable) {
        setBillingUnavailable(true);
        toast({
          title: "Billing temporarily unavailable",
          description: "We’re completing a safe update. Please try again in a few minutes.",
        });
        return;
      }
      const recoveryCode = error?.responseData?.code;
      if (recoveryCode === 'renewal_relationship_available' || recoveryCode === 'renewal_recovery_pending') {
        toast({
          title: "Renewal is being confirmed",
          description: error?.responseData?.error || "We found an existing renewal relationship. No new payment has been started.",
        });
        return;
      }
      if (recoveryCode === 'renewal_recovery_manual_review') {
        toast({
          title: "Renewal needs review",
          description: "We need to confirm your automatic renewal before a new payment can be started.",
        });
        return;
      }
      // For other errors, show toast
      toast({
        title: "Payment Error",
        description: error?.message || "Unable to initialize payment. Please try again.",
        variant: "destructive",
      });
      return;
    }

    const isYearly = checkout.billingPeriod === 'yearly';
    const priceDisplay = `R${(checkout.amount / 100).toFixed(0)} ${isYearly ? 'yearly' : 'monthly'}`;

    try {
      // Use Paystack v2 checkout() method - this auto-detects iOS/Safari and shows Apple Pay
      const paystackPop = new (window as any).PaystackPop();
      await paystackPop.checkout({
        key: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY,
        email: checkout.email,
        amount: checkout.amount,
        currency: checkout.currency,
        plan: checkout.planCode,
        ref: checkout.reference,
        metadata: {
          user_id: checkout.billingOwnerUserId,
          plan_id: checkout.planId,
          plan_name: checkout.planName,
          checkout_attempt_id: checkout.attemptId,
          subscription_type: 'recurring',
          billing_period: checkout.billingPeriod
        },
        onSuccess: (transaction: any) => {
          setIsProcessing(false);
          toast({
            title: "Payment received",
            description: `Your payment was received. We’ll confirm automatic-renewal readiness securely before making any future renewal claim.`,
          });
          onPaymentSuccess?.(transaction.reference);
        },
        onCancel: () => {
          setIsProcessing(false);
          // Don't show error toast for cancellation - this is expected user behavior
          console.log('Payment window closed by user');
        },
        onError: (error: any) => {
          setIsProcessing(false);
          toast({
            title: "Payment Failed",
            description: error?.message || "Payment processing failed. Please try again.",
            variant: "destructive",
          });
          onPaymentError?.(error);
        }
      });
    } catch (error: any) {
      setIsProcessing(false);
      toast({
        title: "Payment Error",
        description: error?.message || "Failed to initialize payment. Please try again.",
        variant: "destructive",
      });
      onPaymentError?.(error);
    }
  };

  // Format price display from the plan's actual price (works for Solo and Team plans).
  const isYearly = plan.billingPeriod === 'yearly';
  const priceAmount = `R${(plan.price / 100).toFixed(2)}`;
  const pricePeriod = isYearly ? '/year' : '/month';
  const recurringDescription = isYearly
    ? `Your paid access starts after successful payment. Automatic yearly renewal is confirmed separately with Paystack.`
    : `Your paid access starts after successful payment. Automatic monthly renewal is confirmed separately with Paystack.`;

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-2 mb-2">
          <Globe className="h-5 w-5 text-primary" />
          <Badge variant="secondary">Web Payment</Badge>
          {isYearly && <Badge variant="default" className="bg-green-600">Save 10%</Badge>}
        </div>
          <CardTitle className="text-lg">
            {renewalRecovery ? 'Restore automatic renewal' : 'Subscribe with Paystack'}
          </CardTitle>
        <CardDescription>
            {renewalRecovery
              ? 'Continue only when you are ready to open a new secure Paystack checkout.'
              : 'Secure payment processing for South African users'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-muted p-4 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="font-medium">{plan.displayName}</span>
            <span className="text-2xl font-bold">
              {priceAmount}
              <span className="text-sm font-normal text-muted-foreground">{pricePeriod}</span>
            </span>
          </div>
          {isYearly && (
            <p className="text-sm text-green-600 mt-1">Save R58 compared to monthly billing</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>Secure payment processing by Paystack</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CreditCard className="h-4 w-4" />
            <span>Pay with card or Apple Pay</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Globe className="h-4 w-4" />
            <span>Optimized for South African banking</span>
          </div>
        </div>

          <Alert>
          <AlertDescription className="text-sm">
             {renewalRecovery ? (
               <>
                 <strong>New checkout required:</strong> No new payment has been attempted.
                 Continuing opens a secure Paystack checkout to set up automatic renewal again.
               </>
             ) : (
               <>
                  <strong>Secure Paystack payment:</strong> {recurringDescription}
                  You can cancel anytime from your account settings.
               </>
             )}
          </AlertDescription>
        </Alert>
        {billingUnavailable && (
          <Alert>
            <AlertDescription className="text-sm">
              Billing is temporarily unavailable while we complete a safe update. Please try again in a few minutes.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter>
        <Button 
          className="w-full" 
          onClick={initializePaystackPayment}
          disabled={isProcessing}
          data-testid="button-paystack-subscribe"
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Processing Payment...
            </>
          ) : (
            <>
              <CreditCard className="h-4 w-4 mr-2" />
              {renewalRecovery ? 'Continue to secure checkout' : `Pay ${priceAmount} with Paystack`}
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}