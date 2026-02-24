import type { Request, Response, NextFunction } from 'express';
import { storage } from './storage';

export interface SubscriptionStatus {
  hasActiveSubscription: boolean;
  isInTrial: boolean;
  subscriptionType: 'none' | 'trial' | 'premium';
  trialDaysRemaining?: number;
  subscriptionPlatform?: 'paystack' | 'google_play' | 'apple';
}

export async function getSubscriptionStatus(userId: number): Promise<SubscriptionStatus> {
  try {
    // Check if user has active subscription in user_subscriptions table
    if (!storage.getUserSubscription) {
      console.log(`[getSubscriptionStatus] Storage doesn't support getUserSubscription for user ${userId}`);
      return { hasActiveSubscription: false, isInTrial: false, subscriptionType: 'none' };
    }

    const subscription = await storage.getUserSubscription(userId);
    if (!subscription) {
      console.log(`[getSubscriptionStatus] No subscription found for user ${userId}`);
      return { hasActiveSubscription: false, isInTrial: false, subscriptionType: 'none' };
    }

    const now = new Date();
    console.log(`[getSubscriptionStatus] User ${userId} subscription status: ${subscription.status}, trialEnd: ${subscription.trialEndDate}`);

    // Check if subscription is active and billing date has not passed
    if (subscription.status === 'active' && subscription.nextBillingDate) {
      const nextBilling = new Date(subscription.nextBillingDate);
      if (now < nextBilling) {
        return {
          hasActiveSubscription: true,
          isInTrial: false,
          subscriptionType: 'premium',
          subscriptionPlatform: subscription.googlePlayPurchaseToken ? 'google_play' :
                             subscription.paystackReference ? 'paystack' :
                             subscription.appleReceiptData ? 'apple' : 'paystack'
        };
      } else {
        console.log(`[getSubscriptionStatus] User ${userId} active subscription is overdue (nextBillingDate: ${nextBilling.toISOString()})`);
        return { hasActiveSubscription: false, isInTrial: false, subscriptionType: 'none' };
      }
    }

    // active status with no nextBillingDate — deny access
    if (subscription.status === 'active' && !subscription.nextBillingDate) {
      console.log(`[getSubscriptionStatus] User ${userId} active subscription has no nextBillingDate — denying access`);
      return { hasActiveSubscription: false, isInTrial: false, subscriptionType: 'none' };
    }

    // Check if subscription was cancelled but user still has paid time remaining
    // This allows users to access the app until their paid period ends
    if (subscription.status === 'cancelled' && subscription.nextBillingDate) {
      const nextBilling = new Date(subscription.nextBillingDate);
      if (now < nextBilling) {
        console.log(`[getSubscriptionStatus] User ${userId} has cancelled subscription but still has access until ${nextBilling}`);
        return {
          hasActiveSubscription: true,
          isInTrial: false,
          subscriptionType: 'premium',
          subscriptionPlatform: subscription.googlePlayPurchaseToken ? 'google_play' : 
                             subscription.paystackReference ? 'paystack' : 
                             subscription.appleReceiptData ? 'apple' : 'paystack'
        };
      }
    }

    // Check if user is in trial period
    if (subscription.status === 'trial' && subscription.trialEndDate) {
      const trialEnd = new Date(subscription.trialEndDate);
      
      if (now < trialEnd) {
        const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        console.log(`[getSubscriptionStatus] User ${userId} has ${daysRemaining} trial days remaining`);
        return {
          hasActiveSubscription: true,
          isInTrial: true,
          subscriptionType: 'trial',
          trialDaysRemaining: daysRemaining
        };
      } else {
        console.log(`[getSubscriptionStatus] User ${userId} trial has expired`);
      }
    }

    console.log(`[getSubscriptionStatus] User ${userId} has no active subscription`);
    return { hasActiveSubscription: false, isInTrial: false, subscriptionType: 'none' };
  } catch (error) {
    console.error(`[getSubscriptionStatus] Error checking subscription status for user ${userId}:`, error);
    return { hasActiveSubscription: false, isInTrial: false, subscriptionType: 'none' };
  }
}

// Middleware to require active subscription
export function requireSubscription() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check authentication using both session and JWT
      const userId = (req as any).user?.id || (req as any).jwtUser?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const subscriptionStatus = await getSubscriptionStatus(userId);
      
      if (!subscriptionStatus.hasActiveSubscription) {
        return res.status(403).json({ 
          error: 'Subscription required',
          subscriptionStatus,
          message: 'Your free trial has ended. Subscribe to continue using Simple Slips and access all your receipts.',
          userMessage: 'Your free trial has ended. Please subscribe to continue.'
        });
      }

      // Add subscription info to request for use in handlers
      (req as any).subscriptionStatus = subscriptionStatus;
      next();
    } catch (error) {
      console.error('Error in requireSubscription middleware:', error);
      return res.status(500).json({ 
        error: 'Connection issue',
        message: 'We couldn\'t verify your subscription. Please check your internet connection and try again.',
        userMessage: 'Unable to load your data. Please try again.'
      });
    }
  };
}

// Middleware for features that have usage limits on free tier
export function checkFeatureAccess(feature: 'receipt_upload' | 'ai_categorization' | 'export' | 'bulk_operations') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check authentication using both session and JWT
      const userId = (req as any).user?.id || (req as any).jwtUser?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const subscriptionStatus = await getSubscriptionStatus(userId);
      
      // Premium users get unlimited access
      if (subscriptionStatus.hasActiveSubscription) {
        (req as any).subscriptionStatus = subscriptionStatus;
        return next();
      }

      // No free tier - users must subscribe after trial ends
      return res.status(403).json({
        error: 'Subscription required',
        subscriptionStatus,
        message: 'Your free trial has ended. Subscribe to continue using Simple Slips.',
        userMessage: 'Your free trial has ended. Please subscribe to continue.'
      });
    } catch (error) {
      console.error('Error in checkFeatureAccess middleware:', error);
      return res.status(500).json({ 
        error: 'Connection issue',
        message: 'We couldn\'t load this feature. Please check your internet connection and try again.',
        userMessage: 'Unable to load this feature. Please try again.'
      });
    }
  };
}

async function getFeatureUsage(userId: number, feature: string): Promise<number> {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    switch (feature) {
      case 'receipt_upload':
        const receipts = await storage.getReceiptsByUser(userId);
        return receipts.filter((r: any) => new Date(r.createdAt) > thirtyDaysAgo).length;
      
      case 'ai_categorization':
        // Count AI-processed receipts in last 30 days
        const aiReceipts = await storage.getReceiptsByUser(userId);
        return aiReceipts.filter((r: any) => 
          new Date(r.createdAt) > thirtyDaysAgo && 
          r.category && r.category !== 'uncategorized'
        ).length;
      
      case 'export':
        // This would require tracking export history - for now return 0
        return 0;
      
      case 'bulk_operations':
        // This would require tracking bulk operations - for now return 0
        return 0;
      
      default:
        return 0;
    }
  } catch (error) {
    console.error('Error getting feature usage:', error);
    return 0;
  }
}

function getFeatureLimits(feature: string) {
  const limits = {
    receipt_upload: { free: 10, premium: -1 }, // -1 means unlimited
    ai_categorization: { free: 5, premium: -1 },
    export: { free: 2, premium: -1 },
    bulk_operations: { free: 0, premium: -1 } // No bulk operations on free tier
  };
  
  return limits[feature as keyof typeof limits] || { free: 0, premium: -1 };
}