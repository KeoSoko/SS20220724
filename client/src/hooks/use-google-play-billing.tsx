import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface GooglePlayProduct {
  productId: string;
  type: 'subs' | 'inapp';
  price: string;
  price_amount_micros: number;
  price_currency_code: string;
  title: string;
  description: string;
}

interface GooglePlayPurchase {
  purchaseToken: string;
  orderId: string;
  productId: string;
  purchaseTime: number;
  purchaseState: number;
  acknowledged: boolean;
  autoRenewing?: boolean;
  subscriptionId?: string;
}

interface UseGooglePlayBillingReturn {
  isAvailable: boolean;
  isConnected: boolean;
  products: GooglePlayProduct[];
  isLoading: boolean;
  error: string | null;
  initializeBilling: () => Promise<void>;
  loadProducts: (productIds: string[]) => Promise<void>;
  purchaseProduct: (productId: string) => Promise<void>;
  acknowledgePurchase: (purchaseToken: string) => Promise<void>;
  getPurchases: () => Promise<GooglePlayPurchase[]>;
}

export function useGooglePlayBilling(): UseGooglePlayBillingReturn {
  const [isAvailable, setIsAvailable] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [products, setProducts] = useState<GooglePlayProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Process purchase mutation
  const processPurchaseMutation = useMutation({
    mutationFn: (purchase: GooglePlayPurchase) => 
      apiRequest('/api/billing/google-play/purchase', 'POST', purchase),
    onSuccess: () => {
      toast({
        title: "Subscription Activated",
        description: "Your premium subscription is now active!",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/billing/subscription'] });
    },
    onError: (error: any) => {
      toast({
        title: "Purchase Processing Failed",
        description: error.message || "Failed to process subscription purchase",
        variant: "destructive",
      });
    },
  });

  // Check if Google Play Billing is available
  useEffect(() => {
    const checkAvailability = () => {
      // Detect platform first
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const isAndroid = /Android/.test(navigator.userAgent) || 
                        document.referrer.includes('android-app://');
      
      // Check if we're in an Android PWA or mobile app environment
      const isAndroidPWA = isAndroid && (
        window.matchMedia('(display-mode: standalone)').matches ||
        document.referrer.includes('android-app://') ||
        window.location.href.includes('googleplay')
      );
      
      // Check if Google Play Billing API is available (would be injected by Capacitor or Cordova)
      const hasGooglePlayBilling = !!(window as any).GooglePlayBilling || 
                                    !!(window as any).cordova?.plugins?.purchase ||
                                    !!(window as any).Capacitor?.Plugins?.GooglePlayBilling;
      
      // Only available on Android platforms, never on iOS
      setIsAvailable(!isIOS && (isAndroidPWA || hasGooglePlayBilling));
    };

    checkAvailability();
  }, []);

  const initializeBilling = useCallback(async () => {
    if (!isAvailable) {
      setError('Google Play Billing not available');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // In a real implementation, this would initialize the Google Play Billing client
      // For now, we'll simulate the initialization
      
      if ((window as any).GooglePlayBilling) {
        // Real Google Play Billing initialization
        await (window as any).GooglePlayBilling.initialize();
      } else {
        // Simulate initialization delay
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      setIsConnected(true);
    } catch (err: any) {
      setError(err.message || 'Failed to initialize Google Play Billing');
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, [isAvailable]);

  const loadProducts = useCallback(async (productIds: string[]) => {
    if (!isConnected) {
      throw new Error('Google Play Billing not connected');
    }

    setIsLoading(true);
    try {
      if ((window as any).GooglePlayBilling) {
        // Real product loading
        const result = await (window as any).GooglePlayBilling.querySkuDetails({
          type: 'subs',
          skus: productIds
        });
        setProducts(result.skuDetails || []);
      } else {
        // Mock products for development
        const mockProducts: GooglePlayProduct[] = productIds.map(id => ({
          productId: id,
          type: 'subs',
          price: id.includes('trial') ? 'Free' : 'R49.00',
          price_amount_micros: id.includes('trial') ? 0 : 49000000,
          price_currency_code: 'ZAR',
          title: id.includes('trial') ? '7-Day Free Trial' : 'Premium Monthly',
          description: id.includes('trial') 
            ? 'Try all features free for 7 days' 
            : 'Full access to all premium features'
        }));
        setProducts(mockProducts);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load products');
    } finally {
      setIsLoading(false);
    }
  }, [isConnected]);

  const purchaseProduct = useCallback(async (productId: string) => {
    if (!isConnected) {
      throw new Error('Google Play Billing not connected');
    }

    setIsLoading(true);
    try {
      let purchase: GooglePlayPurchase;

      if ((window as any).GooglePlayBilling) {
        // Real purchase flow
        const result = await (window as any).GooglePlayBilling.launchBillingFlow({
          skus: [productId],
          type: 'subs'
        });
        purchase = result.purchase;
      } else {
        // Mock purchase for development
        purchase = {
          purchaseToken: `mock_token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          orderId: `Mock.Order.${Date.now()}`,
          productId,
          purchaseTime: Date.now(),
          purchaseState: 1, // PURCHASED
          acknowledged: false,
          autoRenewing: true,
          subscriptionId: productId
        };
        
        // Simulate purchase delay
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Process the purchase with our backend
      await processPurchaseMutation.mutateAsync(purchase);

      // Acknowledge the purchase
      await acknowledgePurchase(purchase.purchaseToken);

    } catch (err: any) {
      setError(err.message || 'Purchase failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, processPurchaseMutation]);

  const acknowledgePurchase = useCallback(async (purchaseToken: string) => {
    if ((window as any).GooglePlayBilling) {
      await (window as any).GooglePlayBilling.acknowledgePurchase({
        purchaseToken
      });
    }
    // For mock purchases, we don't need to do anything
  }, []);

  const getPurchases = useCallback(async (): Promise<GooglePlayPurchase[]> => {
    if (!isConnected) {
      return [];
    }

    if ((window as any).GooglePlayBilling) {
      const result = await (window as any).GooglePlayBilling.queryPurchases({
        type: 'subs'
      });
      return result.purchases || [];
    }

    // Return empty array for mock environment
    return [];
  }, [isConnected]);

  return {
    isAvailable,
    isConnected,
    products,
    isLoading,
    error,
    initializeBilling,
    loadProducts,
    purchaseProduct,
    acknowledgePurchase,
    getPurchases
  };
}