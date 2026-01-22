import { storage } from "./storage";
import {
  SubscriptionPlan,
  UserSubscription,
  PaymentTransaction,
  InsertUserSubscription,
  InsertPaymentTransaction,
  InsertBillingEvent,
  userSubscriptions,
  paymentTransactions,
  billingEvents,
  users
} from "@shared/schema";
import { log } from "./vite";
import Paystack from "paystack";
import * as crypto from "crypto";
import { emailService } from "./email-service";
import { db } from "./db";
import { eq, sql } from "drizzle-orm";

export interface GooglePlayPurchase {
  purchaseToken: string;
  orderId: string;
  productId: string;
  purchaseTime: number;
  purchaseState: number;
  subscriptionId?: string;
  autoRenewing?: boolean;
}

export interface GooglePlayVerificationResponse {
  valid: boolean;
  receipt?: any;
  error?: string;
}

export interface PaystackSubscription {
  email: string;
  plan: string;
  authorization?: {
    authorization_code: string;
  };
  reference?: string;
}

export interface PaystackVerificationResponse {
  valid: boolean;
  subscription?: any;
  error?: string;
}

export interface AppleReceiptData {
  receiptData: string; // Base64 encoded receipt
  productId: string;
  transactionId: string;
  originalTransactionId: string;
  purchaseDate: number;
  expiresDate?: number;
}

export interface AppleVerificationResponse {
  valid: boolean;
  receipt?: any;
  error?: string;
  environment?: 'Sandbox' | 'Production';
}

export class BillingService {
  private paystack: any;

  constructor() {
    // Initialize Paystack if secret key is available
    if (process.env.PAYSTACK_SECRET_KEY) {
      this.paystack = Paystack(process.env.PAYSTACK_SECRET_KEY);
    }
  }
  
  /**
   * Get available subscription plans
   */
  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    try {
      if (!storage.getSubscriptionPlans) {
        throw new Error('Subscription plans not supported by current storage');
      }
      return await storage.getSubscriptionPlans();
    } catch (error) {
      log(`Error fetching subscription plans: ${error}`, 'billing');
      throw new Error('Failed to fetch subscription plans');
    }
  }

  /**
   * Get user's current subscription
   */
  async getUserSubscription(userId: number): Promise<UserSubscription | null> {
    try {
      if (!storage.getUserSubscription) {
        return null;
      }
      return await storage.getUserSubscription(userId);
    } catch (error) {
      log(`Error fetching user subscription for user ${userId}: ${error}`, 'billing');
      return null;
    }
  }

  /**
   * Start a free trial for a user
   */
  async startFreeTrial(userId: number): Promise<UserSubscription> {
    try {
      // Check if user already has a subscription
      const existingSubscription = await this.getUserSubscription(userId);
      if (existingSubscription) {
        throw new Error('User already has an active subscription');
      }

      // Get the trial plan
      if (!storage.getSubscriptionPlanByName) {
        throw new Error('Subscription plans not supported by current storage');
      }
      const trialPlan = await storage.getSubscriptionPlanByName('free_trial');
      if (!trialPlan) {
        // Try to get from all plans if getSubscriptionPlanByName fails
        const allPlans = await storage.getSubscriptionPlans?.() || [];
        const trialPlanFromAll = allPlans.find(plan => plan.name === 'free_trial');
        if (!trialPlanFromAll) {
          throw new Error('Trial plan not found. Please ensure subscription plans are seeded.');
        }
        return this.startFreeTrialWithPlan(userId, trialPlanFromAll);
      }
      
      return this.startFreeTrialWithPlan(userId, trialPlan);
    } catch (error) {
      log(`Error starting free trial for user ${userId}: ${error}`, 'billing');
      throw error;
    }
  }

  /**
   * Start free trial with a specific plan
   */
  private async startFreeTrialWithPlan(userId: number, trialPlan: SubscriptionPlan): Promise<UserSubscription> {
    try {

      // Calculate trial dates
      const trialStartDate = new Date();
      const trialEndDate = new Date();
      trialEndDate.setDate(trialStartDate.getDate() + (trialPlan.trialDays || 30));

      // Create subscription
      const subscriptionData: InsertUserSubscription = {
        userId,
        planId: trialPlan.id,
        status: 'trial',
        trialStartDate,
        trialEndDate,
        subscriptionStartDate: null,
        nextBillingDate: null,
        cancelledAt: null,
        googlePlayPurchaseToken: null,
        googlePlayOrderId: null,
        googlePlaySubscriptionId: null,
        paystackReference: null,
        paystackCustomerCode: null,
        appleReceiptData: null,
        appleTransactionId: null,
        appleOriginalTransactionId: null,
        totalPaid: 0,
        lastPaymentDate: null,
      };

      if (!storage.createUserSubscription) {
        throw new Error('User subscriptions not supported by current storage');
      }
      const subscription = await storage.createUserSubscription(subscriptionData);
      
      log(`Started free trial for user ${userId} with plan ${trialPlan.name}`, 'billing');
      
      // Log billing event
      await this.logBillingEvent(userId, 'trial_started', {
        planId: trialPlan.id,
        trialEndDate: trialEndDate.toISOString()
      });

      log(`Free trial started for user ${userId}, expires on ${trialEndDate.toISOString()}`, 'billing');
      return subscription;

    } catch (error) {
      log(`❌ Error starting free trial for user ${userId}: ${error}`, 'billing');
      console.error('Detailed trial creation error:', {
        userId,
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Check if user's trial has expired
   */
  async checkTrialExpiration(userId: number): Promise<boolean> {
    try {
      const subscription = await this.getUserSubscription(userId);
      if (!subscription || subscription.status !== 'trial') {
        return false;
      }

      if (subscription.trialEndDate && new Date() > subscription.trialEndDate) {
        // Trial has expired, update status
        if (!storage.updateUserSubscription) {
          throw new Error('User subscription updates not supported by current storage');
        }
        await storage.updateUserSubscription(subscription.id, { status: 'expired' });
        
        await this.logBillingEvent(userId, 'trial_expired', {
          subscriptionId: subscription.id
        });

        log(`Trial expired for user ${userId}`, 'billing');
        return true;
      }

      return false;
    } catch (error) {
      log(`Error checking trial expiration for user ${userId}: ${error}`, 'billing');
      return false;
    }
  }

  /**
   * Verify Google Play purchase
   */
  async verifyGooglePlayPurchase(
    packageName: string,
    productId: string,
    purchaseToken: string
  ): Promise<GooglePlayVerificationResponse> {
    try {
      log(`Verifying Google Play purchase: ${productId}, token: ${purchaseToken.substring(0, 10)}...`, 'billing');

      // Check if we have Google service account credentials
      const googleServiceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
      
      if (!googleServiceAccount) {
        log('Google Service Account credentials not found, using development mode verification', 'billing');
        // For development, we'll assume valid purchases
        return {
          valid: true,
          receipt: {
            productId,
            purchaseToken,
            verifiedAt: new Date().toISOString(),
            note: 'Development mode - add GOOGLE_SERVICE_ACCOUNT_KEY for production verification'
          }
        };
      }

      // Implement actual Google Play verification
      try {
        const { google } = require('googleapis');
        const credentials = JSON.parse(googleServiceAccount);
        
        const auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/androidpublisher']
        });

        const androidpublisher = google.androidpublisher({
          version: 'v3',
          auth
        });

        // Verify subscription purchase
        const result = await androidpublisher.purchases.subscriptions.get({
          packageName,
          subscriptionId: productId,
          token: purchaseToken
        });

        if (result.data) {
          log(`Google Play verification successful for ${productId}`, 'billing');
          return {
            valid: true,
            receipt: {
              productId,
              purchaseToken,
              verifiedAt: new Date().toISOString(),
              googlePlayData: result.data
            }
          };
        } else {
          return {
            valid: false,
            error: 'Invalid purchase data from Google Play'
          };
        }
        
      } catch (googleError: any) {
        log(`Google Play API verification failed: ${googleError.message}`, 'billing');
        return {
          valid: false,
          error: `Google Play verification failed: ${googleError.message}`
        };
      }

    } catch (error) {
      log(`Error verifying Google Play purchase: ${error}`, 'billing');
      return {
        valid: false,
        error: 'Verification failed'
      };
    }
  }

  /**
   * Process Google Play subscription purchase
   */
  async processGooglePlaySubscription(
    userId: number,
    purchase: GooglePlayPurchase
  ): Promise<UserSubscription> {
    try {
      // Verify the purchase with Google Play
      const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME || 'app.simpleslips.twa';
      const verification = await this.verifyGooglePlayPurchase(
        packageName,
        purchase.productId,
        purchase.purchaseToken
      );

      if (!verification.valid) {
        throw new Error(`Purchase verification failed: ${verification.error}`);
      }

      // Get the subscription plan based on product ID
      if (!storage.getSubscriptionPlanByGooglePlayProductId) {
        throw new Error('Google Play product lookup not supported by current storage');
      }
      const plan = await storage.getSubscriptionPlanByGooglePlayProductId(purchase.productId);
      if (!plan) {
        throw new Error(`No subscription plan found for product ID: ${purchase.productId}`);
      }

      // Get or update user's subscription
      let subscription = await this.getUserSubscription(userId);
      
      if (subscription) {
        // Update existing subscription
        const subscriptionStartDate = new Date(purchase.purchaseTime);
        let nextBillingDate: Date | null = null;

        if (plan.billingPeriod === 'monthly') {
          nextBillingDate = new Date(subscriptionStartDate);
          nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
        }

        if (!storage.updateUserSubscription) {
          throw new Error('User subscription updates not supported by current storage');
        }
        const updatedSubscription = await storage.updateUserSubscription(subscription.id, {
          planId: plan.id,
          status: 'active',
          subscriptionStartDate,
          nextBillingDate,
          googlePlayPurchaseToken: purchase.purchaseToken,
          googlePlayOrderId: purchase.orderId,
          googlePlaySubscriptionId: purchase.subscriptionId || null,
          lastPaymentDate: subscriptionStartDate,
        });
        
        if (!updatedSubscription) {
          throw new Error('Failed to update subscription');
        }
        
        subscription = updatedSubscription;
      } else {
        // Create new subscription
        const subscriptionStartDate = new Date(purchase.purchaseTime);
        let nextBillingDate: Date | null = null;

        if (plan.billingPeriod === 'monthly') {
          nextBillingDate = new Date(subscriptionStartDate);
          nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
        }

        const subscriptionData: InsertUserSubscription = {
          userId,
          planId: plan.id,
          status: 'active',
          trialStartDate: null,
          trialEndDate: null,
          subscriptionStartDate,
          nextBillingDate,
          cancelledAt: null,
          googlePlayPurchaseToken: purchase.purchaseToken,
          googlePlayOrderId: purchase.orderId,
          googlePlaySubscriptionId: purchase.subscriptionId || null,
          totalPaid: plan.price,
          lastPaymentDate: subscriptionStartDate,
        };

        if (!storage.createUserSubscription) {
          throw new Error('User subscriptions not supported by current storage');
        }
        subscription = await storage.createUserSubscription(subscriptionData);
      }

      // Record the payment transaction
      const transactionData: InsertPaymentTransaction = {
        userId,
        subscriptionId: subscription.id,
        amount: plan.price,
        currency: plan.currency,
        status: 'completed',
        paymentMethod: 'google_play',
        platform: 'google_play',
        platformTransactionId: purchase.purchaseToken,
        platformOrderId: purchase.orderId,
        platformSubscriptionId: purchase.subscriptionId || null,
        metadata: JSON.stringify(purchase),
        description: `${plan.displayName} subscription`,
        failureReason: null,
        refundReason: null,
      };

      if (!storage.createPaymentTransaction) {
        throw new Error('Payment transactions not supported by current storage');
      }
      await storage.createPaymentTransaction(transactionData);

      // Log billing event
      await this.logBillingEvent(userId, 'subscription_activated', {
        planId: plan.id,
        purchaseToken: purchase.purchaseToken,
        orderId: purchase.orderId
      });

      log(`Google Play subscription activated for user ${userId}, plan: ${plan.name}`, 'billing');
      return subscription;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`Error processing Google Play subscription for user ${userId}: ${errorMessage}`, 'billing');
      
      // Log failed event
      await this.logBillingEvent(userId, 'subscription_failed', {
        error: errorMessage,
        purchaseToken: purchase.purchaseToken
      });

      throw error;
    }
  }

  /**
   * Cancel user subscription
   */
  async cancelSubscription(userId: number): Promise<void> {
    try {
      const subscription = await this.getUserSubscription(userId);
      if (!subscription) {
        throw new Error('No active subscription found');
      }

      const cancelledAt = new Date();
      if (!storage.updateUserSubscription) {
        throw new Error('User subscription updates not supported by current storage');
      }
      await storage.updateUserSubscription(subscription.id, {
        status: 'cancelled',
        cancelledAt
      });

      await this.logBillingEvent(userId, 'subscription_cancelled', {
        subscriptionId: subscription.id,
        cancelledAt: cancelledAt.toISOString()
      });

      log(`Subscription cancelled for user ${userId}`, 'billing');

    } catch (error) {
      log(`Error cancelling subscription for user ${userId}: ${error}`, 'billing');
      throw error;
    }
  }

  /**
   * Get user's payment history
   */
  async getPaymentHistory(userId: number): Promise<PaymentTransaction[]> {
    try {
      if (!storage.getPaymentTransactions) {
        return [];
      }
      return await storage.getPaymentTransactions(userId);
    } catch (error) {
      log(`Error fetching payment history for user ${userId}: ${error}`, 'billing');
      return [];
    }
  }

  /**
   * Create Paystack subscription
   */
  async createPaystackSubscription(userId: number, email: string, planCode: string): Promise<any> {
    if (!this.paystack) {
      throw new Error('Paystack not initialized');
    }

    try {
      log(`Creating Paystack subscription for user ${userId}, plan: ${planCode}`, 'billing');

      const subscriptionData = {
        customer: email,
        plan: planCode,
        authorization: null // Will be set during payment
      };

      const response = await this.paystack.subscription.create(subscriptionData);
      
      if (response.status) {
        log(`Paystack subscription created successfully for user ${userId}`, 'billing');
        return response.data;
      } else {
        throw new Error(response.message || 'Failed to create Paystack subscription');
      }

    } catch (error) {
      log(`Error creating Paystack subscription for user ${userId}: ${error}`, 'billing');
      throw error;
    }
  }

  /**
   * Verify Paystack transaction
   */
  async verifyPaystackTransaction(reference: string): Promise<PaystackVerificationResponse> {
    if (!this.paystack) {
      throw new Error('Paystack not initialized');
    }

    try {
      log(`Verifying Paystack transaction: ${reference}`, 'billing');

      const response = await this.paystack.transaction.verify(reference);
      
      if (response.status && response.data.status === 'success') {
        return {
          valid: true,
          subscription: response.data
        };
      } else {
        return {
          valid: false,
          error: response.message || 'Transaction verification failed'
        };
      }

    } catch (error) {
      log(`Error verifying Paystack transaction ${reference}: ${error}`, 'billing');
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Process Paystack subscription payment
   * ATOMIC: All database writes wrapped in a single transaction with rollback on failure
   */
  async processPaystackSubscription(userId: number, transactionReference: string): Promise<UserSubscription> {
    log(`Processing Paystack subscription for user ${userId}, reference: ${transactionReference}`, 'billing');

    // Verify the transaction BEFORE starting the transaction
    const verification = await this.verifyPaystackTransaction(transactionReference);
    
    if (!verification.valid) {
      throw new Error(`Payment verification failed: ${verification.error}`);
    }

    const transactionData = verification.subscription;
    
    // Detect monthly vs yearly based on amount (R530/53000 kobo = yearly, R49/4900 kobo = monthly)
    const paymentAmount = transactionData.amount || 0;
    const isYearly = paymentAmount >= 50000; // R500+ is yearly
    const planName = isYearly ? 'premium_yearly' : 'premium_monthly';
    const subscriptionTier = isYearly ? 'yearly' : 'monthly';
    
    log(`Detected plan type: ${planName} (amount: ${paymentAmount}, isYearly: ${isYearly})`, 'billing');

    // Get subscription plan
    const plans = await this.getSubscriptionPlans();
    const plan = plans.find(p => p.name === planName) || plans.find(p => p.name === 'premium_monthly');
    if (!plan) {
      throw new Error('Premium plan not found');
    }

    const now = new Date();
    const nextBillingDate = new Date();
    if (isYearly) {
      nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
    } else {
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
    }

    try {
      // ATOMIC TRANSACTION: All database writes in a single transaction
      const result = await db.transaction(async (tx) => {
        // Check for duplicate transaction using the UNIQUE constraint
        const existingPayment = await tx
          .select()
          .from(paymentTransactions)
          .where(sql`${paymentTransactions.platform} = 'paystack' AND ${paymentTransactions.platformTransactionId} = ${transactionReference}`)
          .limit(1);

        if (existingPayment.length > 0) {
          log(`Transaction ${transactionReference} already exists in payment_transactions, skipping duplicate`, 'billing');
          
          // Notify admin of blocked duplicate
          const user = await storage.getUser(userId);
          if (emailService) {
            await emailService.sendEmail(
              process.env.ADMIN_EMAIL || 'support@simpleslips.co.za',
              '⚠️ DUPLICATE WEBHOOK IGNORED',
              `A duplicate Paystack webhook was safely ignored:\n\n` +
              `User: ${user?.email || 'Unknown'} (ID: ${userId})\n` +
              `Transaction Ref: ${transactionReference}\n` +
              `Action: No changes made. Idempotency constraint worked.`
            );
          }
          
          // Return existing subscription
          const existingSub = await tx
            .select()
            .from(userSubscriptions)
            .where(eq(userSubscriptions.userId, userId))
            .limit(1);
          
          if (existingSub.length > 0) {
            return existingSub[0] as UserSubscription;
          }
          throw new Error('Duplicate transaction but no subscription found');
        }

        // Check if user already has a subscription (UPSERT semantics)
        const existingSubscription = await tx
          .select()
          .from(userSubscriptions)
          .where(eq(userSubscriptions.userId, userId))
          .limit(1);

        let subscription: UserSubscription;
        
        if (existingSubscription.length > 0) {
          // UPDATE existing subscription
          const existing = existingSubscription[0];
          const isRenewal = existing.status === 'active';
          
          const [updated] = await tx
            .update(userSubscriptions)
            .set({
              status: 'active',
              planId: plan.id,
              subscriptionStartDate: isRenewal ? existing.subscriptionStartDate : now,
              nextBillingDate,
              totalPaid: (existing.totalPaid || 0) + plan.price,
              lastPaymentDate: now,
              paystackReference: transactionReference,
              paystackCustomerCode: transactionData.customer?.customer_code,
              updatedAt: now
            })
            .where(eq(userSubscriptions.userId, userId))
            .returning();
          
          subscription = updated as UserSubscription;
          
          if (isRenewal) {
            log(`Processed subscription RENEWAL for user ${userId}, next billing: ${nextBillingDate.toISOString()}`, 'billing');
          }
        } else {
          // INSERT new subscription (UNIQUE userId constraint handles race conditions)
          const [created] = await tx
            .insert(userSubscriptions)
            .values({
              userId,
              planId: plan.id,
              status: 'active',
              trialStartDate: null,
              trialEndDate: null,
              subscriptionStartDate: now,
              nextBillingDate,
              cancelledAt: null,
              googlePlayPurchaseToken: null,
              googlePlayOrderId: null,
              googlePlaySubscriptionId: null,
              paystackReference: transactionReference,
              paystackCustomerCode: transactionData.customer?.customer_code,
              totalPaid: plan.price,
              lastPaymentDate: now,
            })
            .onConflictDoUpdate({
              target: userSubscriptions.userId,
              set: {
                status: 'active',
                planId: plan.id,
                subscriptionStartDate: now,
                nextBillingDate,
                totalPaid: sql`${userSubscriptions.totalPaid} + ${plan.price}`,
                lastPaymentDate: now,
                paystackReference: transactionReference,
                paystackCustomerCode: transactionData.customer?.customer_code,
                updatedAt: now
              }
            })
            .returning();
          
          subscription = created as UserSubscription;
        }

        // Update users table (subscription access checks)
        await tx
          .update(users)
          .set({
            subscriptionTier: subscriptionTier,
            subscriptionExpiresAt: nextBillingDate,
            updatedAt: now
          } as any)
          .where(eq(users.id, userId));
        
        log(`Updated users table: subscription_tier=${subscriptionTier}, expires_at=${nextBillingDate.toISOString()}`, 'billing');

        // Record payment transaction (UNIQUE constraint prevents duplicates)
        await tx
          .insert(paymentTransactions)
          .values({
            userId,
            subscriptionId: subscription.id,
            amount: plan.price,
            currency: 'ZAR',
            status: 'completed',
            platform: 'paystack',
            platformTransactionId: transactionReference,
            platformOrderId: transactionData.reference,
            platformSubscriptionId: transactionData.subscription?.subscription_code || transactionData.plan?.plan_code || 'PLN_8l8p7v1mergg804',
            metadata: {
              customerCode: transactionData.customer?.customer_code,
              authorizationCode: transactionData.authorization?.authorization_code,
              planCode: transactionData.plan?.plan_code,
              subscriptionCode: transactionData.subscription?.subscription_code,
              recurring: true
            },
            description: `${plan.displayName || plan.name} subscription`,
            failureReason: null,
            refundReason: null,
          })
          .onConflictDoNothing(); // Ignore if duplicate (idempotency)

        // Log billing event
        await tx
          .insert(billingEvents)
          .values({
            userId,
            eventType: 'subscription_activated',
            eventData: {
              planId: plan.id,
              paystackReference: transactionReference,
              customerCode: transactionData.customer?.customer_code
            },
            processed: true
          });

        log(`Paystack subscription activated for user ${userId}, plan: ${plan.name}`, 'billing');
        return subscription;
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`Error processing Paystack subscription for user ${userId}: ${errorMessage}`, 'billing');
      
      // Log failed event (outside transaction since it failed)
      try {
        await this.logBillingEvent(userId, 'subscription_failed', {
          error: errorMessage,
          paystackReference: transactionReference
        });
      } catch (logError) {
        log(`Failed to log billing event: ${logError}`, 'billing');
      }

      // Alert admin of failure
      try {
        const user = await storage.getUser(userId);
        if (emailService) {
          await emailService.sendEmail(
            process.env.ADMIN_EMAIL || 'support@simpleslips.co.za',
            '🚨 SUBSCRIPTION ACTIVATION FAILED',
            `Subscription activation failed (transaction rolled back):\n\n` +
            `User: ${user?.email || 'Unknown'} (ID: ${userId})\n` +
            `Transaction Ref: ${transactionReference}\n` +
            `Amount: R${paymentAmount / 100}\n` +
            `Error: ${errorMessage}\n\n` +
            `⚠️ THE TRANSACTION WAS ROLLED BACK. User may have been charged by Paystack but subscription not activated.\n` +
            `Please check Paystack dashboard and manually activate if needed.`
          );
        }
      } catch (emailError) {
        log(`Failed to send admin alert: ${emailError}`, 'billing');
      }

      throw error;
    }
  }

  /**
   * Check if user has active subscription (trial or paid)
   */
  async hasActiveSubscription(userId: number): Promise<boolean> {
    try {
      const subscription = await this.getUserSubscription(userId);
      if (!subscription) {
        return false;
      }

      // Check trial expiration
      if (subscription.status === 'trial') {
        const hasExpired = await this.checkTrialExpiration(userId);
        return !hasExpired;
      }

      // Active subscriptions have access
      if (subscription.status === 'active') {
        return true;
      }

      // Cancelled subscriptions still have access until next billing date
      if (subscription.status === 'cancelled' && subscription.nextBillingDate) {
        const now = new Date();
        const nextBilling = new Date(subscription.nextBillingDate);
        if (now < nextBilling) {
          log(`User ${userId} has cancelled subscription but still has access until ${nextBilling}`, 'billing');
          return true;
        }
      }

      return false;
    } catch (error) {
      log(`Error checking active subscription for user ${userId}: ${error}`, 'billing');
      return false;
    }
  }

  /**
   * Get subscription status with details
   */
  async getSubscriptionStatus(userId: number) {
    try {
      const subscription = await this.getUserSubscription(userId);
      
      if (!subscription) {
        return {
          hasSubscription: false,
          status: 'none',
          canStartTrial: true,
          trialDaysRemaining: 0,
          daysUntilBilling: null,
          plan: null
        };
      }

      if (!storage.getSubscriptionPlan) {
        return {
          hasSubscription: false,
          status: 'error',
          canStartTrial: false,
          trialDaysRemaining: 0,
          daysUntilBilling: null,
          plan: null
        };
      }
      const plan = await storage.getSubscriptionPlan(subscription.planId);
      
      let trialDaysRemaining = 0;
      let daysUntilBilling = null;

      if (subscription.status === 'trial' && subscription.trialEndDate) {
        const now = new Date();
        const trialEnd = subscription.trialEndDate;
        trialDaysRemaining = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      }

      if ((subscription.status === 'active' || subscription.status === 'cancelled') && subscription.nextBillingDate) {
        const now = new Date();
        const nextBilling = subscription.nextBillingDate;
        daysUntilBilling = Math.max(0, Math.ceil((nextBilling.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      }

      return {
        hasSubscription: true,
        status: subscription.status,
        canStartTrial: false,
        trialDaysRemaining,
        daysUntilBilling,
        plan
      };

    } catch (error) {
      log(`Error getting subscription status for user ${userId}: ${error}`, 'billing');
      return {
        hasSubscription: false,
        status: 'error',
        canStartTrial: false,
        trialDaysRemaining: 0,
        daysUntilBilling: null,
        plan: null
      };
    }
  }

  /**
   * Verify Apple App Store receipt
   */
  async verifyAppleReceipt(receiptData: string, environment: 'sandbox' | 'production' = 'production'): Promise<AppleVerificationResponse> {
    try {
      const verifyURL = environment === 'sandbox' 
        ? 'https://sandbox.itunes.apple.com/verifyReceipt'
        : 'https://buy.itunes.apple.com/verifyReceipt';

      const response = await fetch(verifyURL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          'receipt-data': receiptData
        })
      });

      const result = await response.json();

      if (result.status === 0) {
        return {
          valid: true,
          receipt: result.receipt,
          environment: result.environment
        };
      } else if (result.status === 21007 && environment === 'production') {
        // Receipt is from sandbox but sent to production - retry with sandbox
        return this.verifyAppleReceipt(receiptData, 'sandbox');
      } else {
        return {
          valid: false,
          error: `Apple verification failed with status: ${result.status}`
        };
      }
    } catch (error) {
      log(`Apple receipt verification error: ${error}`, 'billing');
      return {
        valid: false,
        error: `Apple receipt verification failed: ${error}`
      };
    }
  }

  /**
   * Process Apple App Store subscription purchase
   */
  async processAppleSubscription(userId: number, receiptData: AppleReceiptData): Promise<UserSubscription> {
    try {
      log(`Processing Apple subscription for user ${userId}`, 'billing');

      // Verify receipt with Apple
      const verification = await this.verifyAppleReceipt(receiptData.receiptData);
      if (!verification.valid) {
        throw new Error(`Apple receipt verification failed: ${verification.error}`);
      }

      // Get premium plan
      if (!storage.getSubscriptionPlanByName) {
        throw new Error('Subscription plans not supported by current storage');
      }
      const premiumPlan = await storage.getSubscriptionPlanByName('premium_monthly');
      if (!premiumPlan) {
        throw new Error('Premium plan not found');
      }

      // Check if user already has an active subscription
      const existingSubscription = await this.getUserSubscription(userId);
      if (existingSubscription && existingSubscription.status === 'active') {
        // Update existing subscription with Apple details
        const updatedSubscription: InsertUserSubscription = {
          ...existingSubscription,
          status: 'active',
          appleReceiptData: receiptData.receiptData,
          appleTransactionId: receiptData.transactionId,
          appleOriginalTransactionId: receiptData.originalTransactionId,
          lastPaymentDate: new Date(),
        };

        if (!storage.updateUserSubscription) {
          throw new Error('Subscription update not supported by current storage');
        }
        return await storage.updateUserSubscription(existingSubscription.id, updatedSubscription);
      }

      // Create new subscription
      const subscriptionData: InsertUserSubscription = {
        userId,
        planId: premiumPlan.id,
        status: 'active',
        trialStartDate: null,
        trialEndDate: null,
        subscriptionStartDate: new Date(),
        nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        cancelledAt: null,
        googlePlayPurchaseToken: null,
        googlePlayOrderId: null,
        googlePlaySubscriptionId: null,
        paystackReference: null,
        paystackCustomerCode: null,
        appleReceiptData: receiptData.receiptData,
        appleTransactionId: receiptData.transactionId,
        appleOriginalTransactionId: receiptData.originalTransactionId,
        totalPaid: premiumPlan.price,
        lastPaymentDate: new Date(),
      };

      if (!storage.createUserSubscription) {
        throw new Error('Subscription creation not supported by current storage');
      }
      const subscription = await storage.createUserSubscription(subscriptionData);

      // Log transaction
      const transactionData: InsertPaymentTransaction = {
        userId,
        subscriptionId: subscription.id,
        amount: premiumPlan.price,
        currency: 'ZAR',
        status: 'completed',
        paymentMethod: 'other',
        platform: 'apple',
        platformTransactionId: receiptData.transactionId,
        platformOrderId: receiptData.originalTransactionId,
        platformSubscriptionId: receiptData.productId,
        metadata: JSON.stringify({
          receiptData: receiptData.receiptData,
          environment: verification.environment
        }),
        description: `Apple App Store subscription: ${premiumPlan.displayName}`,
        failureReason: null,
        refundReason: null,
      };

      if (!storage.createPaymentTransaction) {
        log('Payment transaction logging not supported', 'billing');
      } else {
        await storage.createPaymentTransaction(transactionData);
      }

      // Log billing event
      await this.logBillingEvent(userId, 'apple_subscription_created', {
        subscriptionId: subscription.id,
        transactionId: receiptData.transactionId,
        productId: receiptData.productId,
        environment: verification.environment
      });

      log(`Apple subscription created for user ${userId}: ${subscription.id}`, 'billing');
      return subscription;

    } catch (error) {
      log(`Error processing Apple subscription for user ${userId}: ${error}`, 'billing');
      
      // Log failed billing event
      await this.logBillingEvent(userId, 'apple_subscription_failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        receiptData: receiptData
      });
      
      throw error;
    }
  }

  /**
   * Record payment failure (public method for webhook handlers)
   */
  async recordPaymentFailure(
    userId: number, 
    reference: string, 
    reason: string,
    amount?: number,
    currency?: string
  ): Promise<void> {
    await this.logBillingEvent(userId, 'payment_failed', {
      reference,
      reason,
      amount,
      currency,
      timestamp: new Date().toISOString()
    });
    log(`Payment failure recorded for user ${userId}: ${reference} - ${reason}`, 'billing');
  }

  /**
   * Log billing event for auditing with enhanced error handling
   */
  private async logBillingEvent(userId: number, eventType: string, eventData: any, retryCount: number = 0): Promise<void> {
    try {
      const billingEventData: InsertBillingEvent = {
        userId,
        eventType,
        eventData: {
          ...eventData,
          timestamp: new Date().toISOString(),
          retryCount,
          userAgent: eventData.userAgent || 'system',
        },
        processed: false,
        processingError: null,
      };

      if (!storage.createBillingEvent) {
        log(`[CRITICAL] Billing event logging not supported: ${eventType} for user ${userId}`, 'billing');
        
        // Send critical alert - billing events must be logged
        if (emailService) {
          await emailService.sendEmail(
            process.env.ADMIN_EMAIL || 'support@simpleslips.co.za',
            'Critical: Billing Event Logging Failed',
            `Unable to log billing event: ${eventType} for user ${userId}. Storage not available.`
          );
        }
        return;
      }

      await storage.createBillingEvent(billingEventData);
      log(`[BILLING] Event logged: ${eventType} for user ${userId}`, 'billing');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log(`[ERROR] Failed to log billing event ${eventType} for user ${userId}: ${errorMessage}`, 'billing');
      
      // Retry up to 3 times with exponential backoff
      if (retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        log(`[RETRY] Retrying billing event log in ${delay}ms (attempt ${retryCount + 1}/3)`, 'billing');
        
        setTimeout(async () => {
          await this.logBillingEvent(userId, eventType, eventData, retryCount + 1);
        }, delay);
      } else {
        // Final failure - alert admin
        log(`[CRITICAL] Failed to log billing event after 3 retries: ${eventType} for user ${userId}`, 'billing');
        
        if (emailService) {
          await emailService.sendEmail(
            process.env.ADMIN_EMAIL || 'support@simpleslips.co.za',
            'Critical: Billing Event Logging Failed After Retries',
            `Failed to log billing event: ${eventType} for user ${userId} after 3 retry attempts. Error: ${errorMessage}`
          );
        }
      }
    }
  }

  /**
   * Enhanced error handling with user notification
   */
  private async handleBillingError(userId: number, operation: string, error: any, context?: any): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorId = crypto.randomUUID();
    
    // Structured error logging
    const errorData = {
      errorId,
      operation,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      context,
      timestamp: new Date().toISOString(),
      userId
    };

    log(`[BILLING ERROR ${errorId}] ${operation} failed for user ${userId}: ${errorMessage}`, 'billing');
    
    // Log the error event
    await this.logBillingEvent(userId, 'billing_error', errorData);

    // For critical errors, notify user and admin
    if (operation.includes('payment') || operation.includes('subscription')) {
      try {
        const user = await storage.getUser(userId);
        if (user?.email && emailService) {
          // Notify user about billing issue
          await emailService.sendEmail(
            user.email,
            'Billing Issue with Your Simple Slips Subscription',
            `We encountered an issue processing your ${operation}. Our team has been notified and will resolve this shortly. If you have questions, please contact support@simpleslips.co.za with reference: ${errorId}`
          );

          // Notify admin
          await emailService.sendEmail(
            process.env.ADMIN_EMAIL || 'support@simpleslips.co.za',
            `Critical Billing Error: ${operation}`,
            `Error ID: ${errorId}\nUser: ${user.email} (ID: ${userId})\nOperation: ${operation}\nError: ${errorMessage}\nContext: ${JSON.stringify(context, null, 2)}`
          );
        }
      } catch (notificationError) {
        log(`[ERROR] Failed to send billing error notifications: ${notificationError}`, 'billing');
      }
    }
  }
}

// Export singleton instance
export const billingService = new BillingService();