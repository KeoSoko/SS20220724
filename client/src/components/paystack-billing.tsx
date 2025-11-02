import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CreditCard, Shield, Globe } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PaystackBillingProps {
  plan: {
    id: number;
    name: string;
    displayName: string;
    price: number;
    currency: string;
  };
  userEmail: string;
  onPaymentSuccess?: (reference: string) => void;
  onPaymentError?: (error: any) => void;
}

export function PaystackBilling({ plan, userEmail, onPaymentSuccess, onPaymentError }: PaystackBillingProps) {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  const initializePaystackPayment = () => {
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

    const handler = (window as any).PaystackPop.setup({
      key: import.meta.env.VITE_PAYSTACK_PUBLIC_KEY,
      email: userEmail,
      amount: plan.price, // Price is already in cents from database
      currency: 'ZAR',
      plan: 'PLN_8l8p7v1mergg804', // Paystack recurring subscription plan code (LIVE)
      ref: `ss_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      metadata: {
        plan_id: plan.id,
        plan_name: plan.name,
        user_email: userEmail,
        subscription_type: 'recurring'
      },
      callback: function(response: any) {
        setIsProcessing(false);
        toast({
          title: "Subscription Activated",
          description: "Your recurring subscription has been activated! You'll be charged R49 monthly.",
        });
        onPaymentSuccess?.(response.reference);
      },
      onClose: function() {
        setIsProcessing(false);
        // Don't show error toast for cancellation - this is expected user behavior
        console.log('Payment window closed by user');
      },
      onerror: function(error: any) {
        setIsProcessing(false);
        toast({
          title: "Payment Failed",
          description: error.message || "Payment processing failed. Please try again.",
          variant: "destructive",
        });
        onPaymentError?.(error);
      }
    });

    handler.openIframe();
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-2 mb-2">
          <Globe className="h-5 w-5 text-primary" />
          <Badge variant="secondary">Web Payment</Badge>
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
              R49.00
              <span className="text-sm font-normal text-muted-foreground">/month</span>
            </span>
          </div>
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
            <strong>Recurring Subscription:</strong> You'll be charged R49 automatically every month.
            Your subscription will activate immediately after successful payment. You can cancel anytime from your account settings.
          </AlertDescription>
        </Alert>
      </CardContent>
      <CardFooter>
        <Button 
          className="w-full" 
          onClick={initializePaystackPayment}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Processing Payment...
            </>
          ) : (
            <>
              <CreditCard className="h-4 w-4 mr-2" />
              Pay R49.00 with Paystack
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}