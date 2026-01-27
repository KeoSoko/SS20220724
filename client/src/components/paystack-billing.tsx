import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CreditCard, Shield, Globe } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Paystack plan codes
const PAYSTACK_PLAN_CODES = {
  monthly: 'PLN_8l8p7v1mergg804',
  yearly: 'PLN_k9q25ilwueuz17j',
};

interface PaystackBillingProps {
  plan: {
    id: number;
    name: string;
    displayName: string;
    price: number;
    currency: string;
    billingPeriod: string;
  };
  userId: number;
  userEmail: string;
  onPaymentSuccess?: (reference: string) => void;
  onPaymentError?: (error: any) => void;
}

export function PaystackBilling({ plan, userId, userEmail, onPaymentSuccess, onPaymentError }: PaystackBillingProps) {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  const initializePaystackPayment = async () => {
    setIsProcessing(true);

    if (!(window as any).PaystackPop) {
      toast({
        title: "Payment Error",
        description: "Paystack payment system is not available. Please try again later.",
        variant: "destructive",
      });
      setIsProcessing(false);
      return;
    }

    // Determine Paystack plan code based on billing period
    const isYearly = plan.billingPeriod === 'yearly';
    const paystackPlanCode = isYearly ? PAYSTACK_PLAN_CODES.yearly : PAYSTACK_PLAN_CODES.monthly;
    const priceDisplay = isYearly ? 'R530 yearly' : 'R49 monthly';

    try {
      // Use Paystack v2 checkout() method - this auto-detects iOS/Safari and shows Apple Pay
      const paystackPop = new (window as any).PaystackPop();
      await paystackPop.checkout({
        key: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY,
        email: userEmail,
        amount: plan.price, // Price is already in cents from database
        currency: 'ZAR',
        plan: paystackPlanCode,
        ref: `ss_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        metadata: {
          user_id: userId,
          plan_id: plan.id,
          plan_name: plan.name,
          user_email: userEmail,
          subscription_type: 'recurring',
          billing_period: plan.billingPeriod
        },
        onSuccess: (transaction: any) => {
          setIsProcessing(false);
          toast({
            title: "Subscription Activated",
            description: `Your recurring subscription has been activated! You'll be charged ${priceDisplay}.`,
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

  // Format price display based on billing period
  const isYearly = plan.billingPeriod === 'yearly';
  const priceAmount = isYearly ? 'R530.00' : 'R49.00';
  const pricePeriod = isYearly ? '/year' : '/month';
  const recurringDescription = isYearly 
    ? "You'll be charged R530 automatically every year." 
    : "You'll be charged R49 automatically every month.";

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-2 mb-2">
          <Globe className="h-5 w-5 text-primary" />
          <Badge variant="secondary">Web Payment</Badge>
          {isYearly && <Badge variant="default" className="bg-green-600">Save 10%</Badge>}
        </div>
        <CardTitle className="text-lg">Subscribe with Paystack</CardTitle>
        <CardDescription>
          Secure payment processing for South African users
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
            <span>Pay with card, EFT, or mobile money</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Globe className="h-4 w-4" />
            <span>Optimized for South African banking</span>
          </div>
        </div>

        <Alert>
          <AlertDescription className="text-sm">
            <strong>Recurring Subscription:</strong> {recurringDescription}
            Your subscription will activate immediately after successful payment. You can cancel anytime from your account settings.
          </AlertDescription>
        </Alert>
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
              Pay {priceAmount} with Paystack
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}