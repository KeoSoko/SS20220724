import type { Request, Response, NextFunction } from 'express';
import { storage } from './storage';
import { resolveBillingOwner } from './billing-owner';
import { BillingSubscriptionReadError, isBillingSubscriptionReadError } from './billing-errors';

export interface SubscriptionStatus {
  hasActiveSubscription: boolean;
  isInTrial: boolean;
  subscriptionType: 'none' | 'trial' | 'premium';
  trialDaysRemaining?: number;
  subscriptionPlatform?: 'paystack' | 'google_play' | 'apple';
  paymentRequired?: boolean;
  paymentRecoveryRecommended?: boolean;
  renewalDueDate?: string;
  recoveryPath?: string;
  // Effective seat capacity for the workspace, derived from the owner's active
  // plan's max_seats. Read-only — no enforcement here. Defaults to 1 (Solo).
  seatCapacity?: number;
}

/**
 * Resolve how many workspace seats a subscription's plan grants (its max_seats).
 * Falls back to 1 (Solo) when the plan, its seat count, or plan lookup is
 * unavailable. Read-only and side-effect free.
 */
async function resolvePlanSeatCapacity(planId: number | null | undefined): Promise<number> {
  if (!planId || !storage.getSubscriptionPlan) return 1;
  try {
    const plan = await storage.getSubscriptionPlan(planId);
    if (plan && typeof plan.maxSeats === 'number' && plan.maxSeats > 0) {
      return plan.maxSeats;
    }
  } catch (error) {
    console.error(`[resolvePlanSeatCapacity] Error resolving seats for plan ${planId}:`, error);
  }
  return 1;
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
    const seatCapacity = await resolvePlanSeatCapacity(subscription.planId);
    console.log(`[getSubscriptionStatus] User ${userId} subscription status: ${subscription.status}, trialEnd: ${subscription.trialEndDate}, seatCapacity: ${seatCapacity}`);

    // Keep access while an active Paystack renewal is unresolved. Reconciliation
    // changes the row to paused only after an exact-identity unpaid invoice.
    if (subscription.status === 'active' && subscription.nextBillingDate) {
      const nextBilling = new Date(subscription.nextBillingDate);
      const paymentRecoveryRecommended = now >= nextBilling;
      return {
        hasActiveSubscription: true,
        isInTrial: false,
        subscriptionType: 'premium',
        seatCapacity,
        paymentRecoveryRecommended,
        renewalDueDate: paymentRecoveryRecommended ? nextBilling.toISOString() : undefined,
        recoveryPath: paymentRecoveryRecommended ? '/subscription' : undefined,
        subscriptionPlatform: subscription.googlePlayPurchaseToken ? 'google_play' :
                           subscription.paystackReference ? 'paystack' :
                           subscription.appleReceiptData ? 'apple' : 'paystack'
      };
    }

    // active status with no nextBillingDate — deny access
    if (subscription.status === 'active' && !subscription.nextBillingDate) {
      console.log(`[getSubscriptionStatus] User ${userId} active subscription has no nextBillingDate — denying access`);
      return { hasActiveSubscription: false, isInTrial: false, subscriptionType: 'none' };
    }

    if (subscription.status === 'paused') {
      return {
        hasActiveSubscription: false,
        isInTrial: false,
        subscriptionType: 'none',
        paymentRequired: true,
        renewalDueDate: subscription.nextBillingDate?.toISOString(),
        recoveryPath: '/subscription',
        subscriptionPlatform: subscription.googlePlayPurchaseToken ? 'google_play' :
          subscription.paystackReference ? 'paystack' :
          subscription.appleReceiptData ? 'apple' : 'paystack',
      };
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
          seatCapacity,
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
          trialDaysRemaining: daysRemaining,
          seatCapacity
        };
      } else {
        console.log(`[getSubscriptionStatus] User ${userId} trial has expired`);
      }
    }

    console.log(`[getSubscriptionStatus] User ${userId} has no active subscription`);
    return { hasActiveSubscription: false, isInTrial: false, subscriptionType: 'none' };
  } catch (error) {
    console.error(`[getSubscriptionStatus] Error checking subscription status for user ${userId}:`, error);
    if (isBillingSubscriptionReadError(error)) throw error;
    throw new BillingSubscriptionReadError(userId, error);
  }
}

const NO_ACCESS_STATUS: SubscriptionStatus = {
  hasActiveSubscription: false,
  isInTrial: false,
  subscriptionType: 'none',
};

/**
 * Resolve the subscription status that governs a user's ACCESS, inheriting from
 * the workspace owner.
 *
 * - Workspace owner: their own subscription is authoritative.
 * - Workspace member: the owner's subscription is authoritative (read-time
 *   inheritance only — no writes, no Paystack changes).
 *
 * Fails CLOSED: if the workspace or its owner cannot be resolved (orphaned
 * workspace — `workspaces.owner_id` has no FK), access is DENIED and a CRITICAL
 * log is emitted. We never fall back to the member's own subscription, because a
 * silent fallback would re-introduce per-member inconsistency and mask a
 * data-integrity defect.
 *
 * NOTE: This governs access only. `billingService.getSubscriptionStatus()`
 * remains user-specific for billing display and lifecycle logic.
 */
export async function getEffectiveSubscriptionStatus(userId: number): Promise<SubscriptionStatus> {
  try {
    const resolution = await resolveBillingOwner(userId);
    if (resolution.state === "unresolved") {
      console.error(`[CRITICAL_WORKSPACE_OWNER_MISSING] ${JSON.stringify({
        workspaceId: resolution.workspaceId,
        userId,
        reason: resolution.reason,
      })}`);
      return { ...NO_ACCESS_STATUS };
    }

    if (!resolution.canManageBilling) {
      const ownerStatus = await getSubscriptionStatus(resolution.billingOwnerUserId);
      console.log(`[WORKSPACE_INHERITANCE] ${JSON.stringify({
        workspaceId: resolution.workspaceId,
        memberId: userId,
        ownerId: resolution.billingOwnerUserId,
        subscriptionType: ownerStatus.subscriptionType,
        hasActiveSubscription: ownerStatus.hasActiveSubscription,
      })}`);
      return ownerStatus;
    }

    return getSubscriptionStatus(resolution.billingOwnerUserId);
  } catch (error) {
    console.error(`[getEffectiveSubscriptionStatus] Error resolving effective status for user ${userId}:`, error);
    if (isBillingSubscriptionReadError(error)) throw error;
    throw new BillingSubscriptionReadError(userId, error);
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

      const subscriptionStatus = await getEffectiveSubscriptionStatus(userId);
      
      if (!subscriptionStatus.hasActiveSubscription) {
        const message = subscriptionStatus.paymentRequired
          ? 'We couldn’t process your latest renewal payment. Update your payment method securely with Paystack to continue your subscription.'
          : 'Your free trial has ended. Subscribe to continue using Simple Slips and access all your receipts.';
        const userMessage = subscriptionStatus.paymentRequired
          ? 'Your renewal payment needs attention. Please update your payment method.'
          : 'Your free trial has ended. Please subscribe to continue.';
        return res.status(403).json({ 
          error: subscriptionStatus.paymentRequired ? 'Payment required' : 'Subscription required',
          subscriptionStatus,
          message,
          userMessage,
        });
      }

      // Add subscription info to request for use in handlers
      (req as any).subscriptionStatus = subscriptionStatus;
      next();
    } catch (error) {
      console.error('Error in requireSubscription middleware:', error);
      return res.status(isBillingSubscriptionReadError(error) ? 503 : 500).json({
        error: 'Connection issue',
        code: isBillingSubscriptionReadError(error) ? 'billing_state_unavailable' : 'subscription_check_failed',
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

      const subscriptionStatus = await getEffectiveSubscriptionStatus(userId);
      
      // Premium users get unlimited access
      if (subscriptionStatus.hasActiveSubscription) {
        (req as any).subscriptionStatus = subscriptionStatus;
        return next();
      }

      // No free tier - users must subscribe after trial ends
      const message = subscriptionStatus.paymentRequired
        ? 'We couldn’t process your latest renewal payment. Update your payment method securely with Paystack to continue your subscription.'
        : 'Your free trial has ended. Subscribe to continue using Simple Slips.';
      const userMessage = subscriptionStatus.paymentRequired
        ? 'Your renewal payment needs attention. Please update your payment method.'
        : 'Your free trial has ended. Please subscribe to continue.';
      return res.status(403).json({
        error: subscriptionStatus.paymentRequired ? 'Payment required' : 'Subscription required',
        subscriptionStatus,
        message,
        userMessage,
      });
    } catch (error) {
      console.error('Error in checkFeatureAccess middleware:', error);
      return res.status(isBillingSubscriptionReadError(error) ? 503 : 500).json({
        error: 'Connection issue',
        code: isBillingSubscriptionReadError(error) ? 'billing_state_unavailable' : 'subscription_check_failed',
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
