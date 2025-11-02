/**
 * iOS In-App Purchase Bridge for Simple Slips PWA
 * Handles communication between web app and iOS StoreKit
 */

export interface IOSProduct {
  productId: string;
  price: string;
  localizedPrice: string;
  localizedTitle: string;
  localizedDescription: string;
}

export interface IOSPurchaseResult {
  success: boolean;
  receiptData?: string;
  transactionId?: string;
  originalTransactionId?: string;
  productId?: string;
  purchaseDate?: number;
  error?: string;
}

export interface IOSSubscriptionStatus {
  isActive: boolean;
  expiresDate?: number;
  environment?: 'Sandbox' | 'Production';
  productId?: string;
}

declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        'ios-purchase-request'?: {
          postMessage: (message: string) => void;
        };
        'ios-restore-purchases'?: {
          postMessage: (message: string) => void;
        };
        'ios-subscription-status'?: {
          postMessage: (message: string) => void;
        };
      };
    };
    iosInAppPurchaseCapability?: boolean;
  }
}

class IOSPurchaseBridge {
  private isInitialized = false;

  constructor() {
    this.initializeIOSBridge();
  }

  /**
   * Initialize iOS purchase bridge and set up event listeners
   */
  private initializeIOSBridge(): void {
    // Check if running in iOS PWA with StoreKit capability
    if (window.webkit?.messageHandlers?.['ios-purchase-request']) {
      window.iosInAppPurchaseCapability = true;
      this.isInitialized = true;
      this.setupEventListeners();
      console.log('🍎 iOS In-App Purchase bridge initialized');
    } else {
      console.log('ℹ️ iOS In-App Purchase not available (not iOS or missing StoreKit)');
    }
  }

  /**
   * Set up event listeners for iOS purchase responses
   */
  private setupEventListeners(): void {
    // Listen for purchase completion
    window.addEventListener('ios-purchase-complete', ((event: CustomEvent<IOSPurchaseResult>) => {
      console.log('🍎 iOS purchase completed:', event.detail);
      this.handlePurchaseResult(event.detail);
    }) as EventListener);

    // Listen for purchase failure
    window.addEventListener('ios-purchase-failed', ((event: CustomEvent<{error: string}>) => {
      console.error('🍎 iOS purchase failed:', event.detail.error);
      this.handlePurchaseError(event.detail.error);
    }) as EventListener);

    // Listen for restored purchases
    window.addEventListener('ios-purchases-restored', ((event: CustomEvent<IOSPurchaseResult[]>) => {
      console.log('🍎 iOS purchases restored:', event.detail);
      this.handleRestoredPurchases(event.detail);
    }) as EventListener);

    // Listen for subscription status
    window.addEventListener('ios-subscription-status', ((event: CustomEvent<IOSSubscriptionStatus>) => {
      console.log('🍎 iOS subscription status:', event.detail);
      this.handleSubscriptionStatus(event.detail);
    }) as EventListener);
  }

  /**
   * Check if iOS In-App Purchases are available
   * Returns true ONLY when running in a native iOS app wrapper with StoreKit support
   * Returns false for iOS PWAs (which cannot use In-App Purchases)
   */
  isAvailable(): boolean {
    // Require explicit native wrapper capability flag
    // This prevents PWAs from attempting to use StoreKit
    const hasNativeFlag = (window as any).__SIMPLESLIPS_IOS_NATIVE__ === true;
    const hasWebkitHandler = !!window.webkit?.messageHandlers?.['ios-purchase-request'];
    
    return this.isInitialized && hasNativeFlag && hasWebkitHandler && !!window.iosInAppPurchaseCapability;
  }

  /**
   * Request iOS StoreKit to purchase Simple Slips Premium subscription
   */
  async purchaseSubscription(): Promise<IOSPurchaseResult> {
    if (!this.isAvailable()) {
      throw new Error('iOS In-App Purchase not available');
    }

    return new Promise((resolve, reject) => {
      // Set up one-time listeners for this specific purchase
      const handleComplete = ((event: CustomEvent<IOSPurchaseResult>) => {
        window.removeEventListener('ios-purchase-complete', handleComplete as EventListener);
        window.removeEventListener('ios-purchase-failed', handleFailed as EventListener);
        resolve(event.detail);
      }) as EventListener;

      const handleFailed = ((event: CustomEvent<{error: string}>) => {
        window.removeEventListener('ios-purchase-complete', handleComplete as EventListener);
        window.removeEventListener('ios-purchase-failed', handleFailed as EventListener);
        reject(new Error(event.detail.error));
      }) as EventListener;

      window.addEventListener('ios-purchase-complete', handleComplete);
      window.addEventListener('ios-purchase-failed', handleFailed);

      // Request purchase from iOS
      const purchaseRequest = {
        productId: 'simple_slips_premium_monthly',
        action: 'purchase'
      };

      window.webkit?.messageHandlers?.['ios-purchase-request']?.postMessage(
        JSON.stringify(purchaseRequest)
      );

      console.log('🍎 Requesting iOS purchase for Simple Slips Premium');
    });
  }

  /**
   * Restore previous purchases
   */
  async restorePurchases(): Promise<IOSPurchaseResult[]> {
    if (!this.isAvailable()) {
      throw new Error('iOS In-App Purchase not available');
    }

    return new Promise((resolve, reject) => {
      const handleRestored = (event: CustomEvent<IOSPurchaseResult[]>) => {
        window.removeEventListener('ios-purchases-restored', handleRestored);
        window.removeEventListener('ios-purchase-failed', handleFailed);
        resolve(event.detail);
      };

      const handleFailed = (event: CustomEvent<{error: string}>) => {
        window.removeEventListener('ios-purchases-restored', handleRestored);
        window.removeEventListener('ios-purchase-failed', handleFailed);
        reject(new Error(event.detail.error));
      };

      window.addEventListener('ios-purchases-restored', handleRestored);
      window.addEventListener('ios-purchase-failed', handleFailed);

      // Request restore from iOS
      window.webkit?.messageHandlers?.['ios-restore-purchases']?.postMessage('restore');
      console.log('🍎 Requesting iOS purchase restoration');
    });
  }

  /**
   * Get current subscription status from iOS
   */
  async getSubscriptionStatus(): Promise<IOSSubscriptionStatus> {
    if (!this.isAvailable()) {
      throw new Error('iOS In-App Purchase not available');
    }

    return new Promise((resolve, reject) => {
      const handleStatus = (event: CustomEvent<IOSSubscriptionStatus>) => {
        window.removeEventListener('ios-subscription-status', handleStatus);
        resolve(event.detail);
      };

      window.addEventListener('ios-subscription-status', handleStatus);

      // Request status from iOS
      window.webkit?.messageHandlers?.['ios-subscription-status']?.postMessage('status');
      console.log('🍎 Requesting iOS subscription status');

      // Timeout after 10 seconds
      setTimeout(() => {
        window.removeEventListener('ios-subscription-status', handleStatus);
        reject(new Error('iOS subscription status request timed out'));
      }, 10000);
    });
  }

  /**
   * Handle successful purchase result
   */
  private async handlePurchaseResult(result: IOSPurchaseResult): Promise<void> {
    if (result.success && result.receiptData) {
      try {
        // Send receipt to Simple Slips backend for validation
        const response = await fetch('/api/billing/apple/purchase', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            receiptData: result.receiptData,
            productId: result.productId,
            transactionId: result.transactionId,
            originalTransactionId: result.originalTransactionId,
            purchaseDate: result.purchaseDate,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          console.log('✅ iOS purchase validated by Simple Slips backend:', data);
          
          // Emit custom event for UI to handle
          window.dispatchEvent(new CustomEvent('simple-slips-subscription-activated', {
            detail: { 
              platform: 'ios',
              subscription: data.subscription 
            }
          }));
        } else {
          throw new Error(`Backend validation failed: ${response.statusText}`);
        }
      } catch (error) {
        console.error('❌ Failed to validate iOS purchase with backend:', error);
        throw error;
      }
    }
  }

  /**
   * Handle purchase error
   */
  private handlePurchaseError(error: string): void {
    console.error('🍎 iOS purchase error:', error);
    
    // Emit error event for UI to handle
    window.dispatchEvent(new CustomEvent('simple-slips-purchase-failed', {
      detail: { 
        platform: 'ios',
        error 
      }
    }));
  }

  /**
   * Handle restored purchases
   */
  private async handleRestoredPurchases(purchases: IOSPurchaseResult[]): Promise<void> {
    console.log('🍎 Processing restored iOS purchases:', purchases);

    for (const purchase of purchases) {
      if (purchase.success && purchase.receiptData) {
        try {
          await this.handlePurchaseResult(purchase);
        } catch (error) {
          console.error('❌ Failed to restore purchase:', error);
        }
      }
    }

    // Emit event for UI
    window.dispatchEvent(new CustomEvent('simple-slips-purchases-restored', {
      detail: { 
        platform: 'ios',
        count: purchases.length 
      }
    }));
  }

  /**
   * Handle subscription status
   */
  private handleSubscriptionStatus(status: IOSSubscriptionStatus): void {
    console.log('🍎 iOS subscription status:', status);

    // Emit event for UI
    window.dispatchEvent(new CustomEvent('simple-slips-subscription-status', {
      detail: { 
        platform: 'ios',
        status 
      }
    }));
  }
}

// Export singleton instance
export const iosPurchaseBridge = new IOSPurchaseBridge();

// Convenience functions for easy use in components
export const purchaseSimpleSlipsPremium = () => iosPurchaseBridge.purchaseSubscription();
export const restoreSimpleSlipsPurchases = () => iosPurchaseBridge.restorePurchases();
export const getIOSSubscriptionStatus = () => iosPurchaseBridge.getSubscriptionStatus();
export const isIOSPurchaseAvailable = () => iosPurchaseBridge.isAvailable();