import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Smartphone, Download, Shield, Apple } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface GooglePlayBillingProps {
  onPurchaseSuccess?: (purchaseData: any) => void;
  onPurchaseError?: (error: any) => void;
}

// Simulated Google Play Billing interface for PWA environment
export function GooglePlayBilling({ onPurchaseSuccess, onPurchaseError }: GooglePlayBillingProps) {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPWA, setIsPWA] = useState(false);

  useEffect(() => {
    // Detect if running in Android PWA mode or downloaded app
    const checkPWA = () => {
      // Detect platform first
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isAndroid = /Android/.test(navigator.userAgent) || 
                        document.referrer.includes('android-app://');
      
      // Only consider Android PWA as PWA for Google Play billing
      const isPWAMode = isAndroid && (
        window.matchMedia('(display-mode: standalone)').matches ||
        document.referrer.includes('android-app://') ||
        window.location.href.includes('googleplay')
      );
      setIsPWA(isPWAMode);
    };

    checkPWA();
    window.addEventListener('resize', checkPWA);
    window.matchMedia('(display-mode: standalone)').addEventListener('change', checkPWA);
    return () => {
      window.removeEventListener('resize', checkPWA);
      window.matchMedia('(display-mode: standalone)').removeEventListener('change', checkPWA);
    };
  }, []);

  const simulateGooglePlayPurchase = async (productId: string) => {
    setIsProcessing(true);
    
    try {
      // Simulate network delay for Google Play processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Generate mock purchase data
      const mockPurchaseData = {
        purchaseToken: `gp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        orderId: `GP.${Date.now()}.${Math.random().toString(36).substr(2, 9)}`,
        productId,
        purchaseTime: Date.now(),
        purchaseState: 1,
        acknowledged: false,
        packageName: 'app.simpleslips.twa',
        developerPayload: ''
      };

      // Simulate successful purchase
      toast({
        title: "Purchase Successful",
        description: "Your subscription has been activated through Google Play!",
      });

      onPurchaseSuccess?.(mockPurchaseData);
      
    } catch (error) {
      toast({
        title: "Purchase Failed",
        description: "Failed to process Google Play purchase",
        variant: "destructive",
      });
      onPurchaseError?.(error);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isPWA) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Mobile App Required
          </CardTitle>
          <CardDescription>
            Download our mobile app for seamless billing and enhanced features
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Download className="h-4 w-4" />
            <AlertDescription>
              Get the best experience with our mobile app from Google Play Store or App Store.
              The mobile app provides seamless billing integration and enhanced receipt scanning capabilities.
            </AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button 
            className="w-full" 
            onClick={() => window.open('https://play.google.com/store/apps/details?id=app.simpleslips.twa', '_blank')}
          >
            <Download className="h-4 w-4 mr-2" />
            Download from Play Store
          </Button>
          <Button 
            className="w-full" 
            variant="outline"
            onClick={() => window.open('https://apps.apple.com/us/app/simple-slips-receipt-manager/id6464466141', '_blank')}
          >
            <Apple className="h-4 w-4 mr-2" />
            Download from App Store
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Google Play Billing
        </CardTitle>
        <CardDescription>
          Secure payments powered by Google Play
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              Secure
            </Badge>
            <Badge variant="outline">
              Google Play Protected
            </Badge>
          </div>
          
          <p className="text-sm text-muted-foreground">
            Your subscription will be managed through Google Play. You can cancel or modify 
            your subscription at any time through your Google Play account.
          </p>
        </div>
      </CardContent>
      <CardFooter>
        <Button 
          className="w-full" 
          onClick={() => simulateGooglePlayPurchase('simple_slips_premium_monthly')}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            'Subscribe via Google Play'
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

export default GooglePlayBilling;