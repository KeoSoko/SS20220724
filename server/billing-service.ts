import { storage } from "./storage";
import { resolveBillingOwner } from "./billing-owner";
import {
  SubscriptionPlan,
  UserSubscription,
  PaymentTransaction,
  InsertUserSubscription,
  InsertPaymentTransaction,
  InsertBillingEvent,
  PaystackCheckoutAttempt,
  PaystackCancellationAttempt,
  userSubscriptions,
  paystackSubscriptionIdentities,
  paystackCheckoutAttempts,
  paystackCancellationAttempts,
  paymentTransactions,
  billingEvents,
  subscriptionPlans,
  users
} from "@shared/schema";
import { log } from "./vite";
import Paystack from "paystack";
import * as crypto from "crypto";
import { emailService } from "./email-service";
import { db } from "./db";
import { and, eq, inArray, isNull, like, lte, ne, or, sql, desc } from "drizzle-orm";
import {
  advanceBillingDate,
  checkPaystackTransactionOwnership,
  classifyPaystackInvoice,
  extractPaystackCustomerCode,
  extractPaystackPlanCode,
  extractPaystackAuthorizationEvidence,
  extractPaystackSubscriptionCode,
  getMostRecentPaystackInvoice,
  hasExactPaystackRecurringRelationship,
  isViablePaystackSubscriptionCandidate,
  parsePaystackDate,
  PaystackSubscriptionCandidateSummary,
  paystackInvoiceFailureTransactionId,
  applyPaystackApplePayGate,
  PaystackRecurringReadiness,
  selectPaystackSubscriptionIdentityCandidate,
  subscriptionIdentityMatches,
  validateActivePaystackRenewalRelationship,
} from "./paystack-renewal";
import {
  getPaystackBillingSchemaReadiness,
  requirePaystackBillingSchema,
} from "./paystack-billing-schema";
import {
  createManualPaystackIdentityRepairService,
  ManualPaystackIdentityRepairInput,
} from "./manual-paystack-identity-repair";
import {
  createManualLegacyPaystackAccountingSettlementService,
  MANUAL_ACCOUNTING_SETTLEMENT_EVENT,
  type ManualLegacyPaystackAccountingInput,
} from "./manual-legacy-paystack-accounting-settlement";

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

export interface PaystackRenewalFailureResult {
  outcome: "applied" | "duplicate" | "ignored" | "unresolved";
  reason: string;
  invoiceCode?: string;
}

export interface PaystackReconciliationResult {
  outcome: "reconciled_paid" | "payment_required" | "current" | "renewal_setup_required" | "unresolved";
  reason: string;
  subscriptionCode?: string;
}

export type PaystackRenewalState =
  | "not_due"
  | "reconciling"
  | "payment_failed"
  | "renewal_setup_required"
  | "automatic_renewal_active"
  | "subscription_active"
  | "payment_method_needs_attention"
  | "manual_review_required";

const OPEN_PAYSTACK_CANCELLATION_STATUSES = [
  "requested",
  "provider_call_started",
  "provider_confirmation_pending",
  "provider_result_unknown",
  "failed_retryable",
  "manual_review_required",
  "provider_non_renewing",
  "provider_disabled",
] as const;

export interface PaystackRenewalStatus {
  state: PaystackRenewalState;
  recoveryCheckoutEligible: boolean;
  managementLinkEligible: boolean;
}

export function isPaystackSubscriptionManagementLinkEnabled(): boolean {
  return process.env.PAYSTACK_SUBSCRIPTION_MANAGEMENT_LINK_ENABLED === "true";
}

/**
 * Fail-closed gate for Apple Pay on new recurring subscription checkout.
 *
 * Apple Pay authorizations have not demonstrated reusable authorization in
 * Simple Slips' current Paystack plan-checkout flow (25 Apple Pay payments
 * across 21 customers; zero confirmed subsequent automatic renewals).
 *
 * Only explicit `true` enables Apple Pay for new subscriptions.
 * Missing or any other value → disabled.
 *
 * This gate:
 *  - Restricts channels presented to the customer in the Paystack checkout popup
 *  - Blocks recurring-readiness from being established for Apple Pay transactions
 *    at the settlement layer even if a client bypasses the popup restriction
 *  - Does NOT affect existing Apple Pay-originated subscriptions
 *  - Does NOT cancel, refund, or alter any existing customer relationship
 */
export function isPaystackApplePaySubscriptionsEnabled(): boolean {
  return process.env.PAYSTACK_APPLE_PAY_SUBSCRIPTIONS_ENABLED === "true";
}

export type PaystackManagementLinkResult =
  | { outcome: "ready"; url: string }
  | { outcome: "automatic_renewal_active" }
  | { outcome: "manual_review_required"; reason: string }
  | { outcome: "reconciling"; reason: string };

function isPaystackHostedManagementLink(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:"
      && parsed.hostname === "paystack.com"
      && parsed.pathname.startsWith("/manage/subscriptions/");
  } catch {
    return false;
  }
}

export type PaystackRenewalIdentityRecoveryResult =
  | { outcome: "relationship_available"; subscriptionCode: string }
  | { outcome: "recovered"; subscriptionCode: string }
  | { outcome: "no_verified_relationship" }
  | { outcome: "manual_review_required"; reason: string }
  | { outcome: "reconciling"; reason: string };

export type PaystackSubscriptionCandidateInspection =
  | {
      available: true;
      customerCode: string;
      expectedPlanCode: string | null;
      activeSubscriptionCode: string | null;
      candidates: PaystackSubscriptionCandidateSummary[];
    }
  | {
      available: false;
      reason:
        | "missing_local_subscription"
        | "missing_paystack_customer_code"
        | "missing_paystack_plan_code"
        | "paystack_unavailable"
        | "paystack_customer_lookup_failed"
        | "paystack_subscription_list_failed"
        | "paystack_subscription_list_pagination_unresolved";
    };

type PaystackSubscriptionCandidateInspectionUnavailableReason =
  | "missing_local_subscription"
  | "missing_paystack_customer_code"
  | "missing_paystack_plan_code"
  | "paystack_unavailable"
  | "paystack_customer_lookup_failed"
  | "paystack_subscription_list_failed"
  | "paystack_subscription_list_pagination_unresolved";

export type PaystackSubscriptionResolutionResult =
  | {
      outcome: "resolved";
      selectedSubscriptionCode: string;
      previousSubscriptionCode: string | null;
      providerStatus: string;
    }
  | {
      outcome: "confirmation_required" | "unresolved";
      reason: string;
    };

export type PaystackCheckoutAttemptResult =
  | { outcome: "created" | "reused"; attempt: PaystackCheckoutAttempt }
  | {
      outcome: "checkout_blocked";
      reason:
        | "active_paid_subscription"
        | "paid_grace_period"
        | "renewal_recovery_required"
        | "renewal_relationship_available"
        | "renewal_recovery_plan_mismatch";
      subscription: UserSubscription;
    };

export type TrackedCheckoutTermsResult =
  | { valid: true }
  | {
      valid: false;
      reason:
        | "reference_mismatch"
        | "stored_plan_mismatch"
        | "plan_code_mismatch"
        | "metadata_plan_mismatch"
        | "amount_mismatch"
        | "currency_mismatch"
        | "customer_email_mismatch";
    };

type TrackedCheckoutInvalidReason = Extract<
  TrackedCheckoutTermsResult,
  { valid: false }
>["reason"];

function normalizePaystackEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function validateTrackedCheckoutTerms(
  attempt: Pick<
    PaystackCheckoutAttempt,
    "planId" | "amount" | "currency" | "paystackPlanCode" | "customerEmail" | "paystackReference"
  >,
  plan: SubscriptionPlan,
  transactionData: any,
): TrackedCheckoutTermsResult {
  if (transactionData?.reference !== attempt.paystackReference) {
    return { valid: false, reason: "reference_mismatch" };
  }
  if (plan.id !== attempt.planId || plan.paystackPlanCode !== attempt.paystackPlanCode) {
    return { valid: false, reason: "stored_plan_mismatch" };
  }

  const providerPlanCode = typeof transactionData?.plan === "string"
    ? transactionData.plan
    : transactionData?.plan?.plan_code ?? transactionData?.plan_code;
  if (providerPlanCode !== attempt.paystackPlanCode) {
    return { valid: false, reason: "plan_code_mismatch" };
  }
  const metadataPlanId = transactionData?.metadata?.plan_id;
  const metadataPlanCode = transactionData?.metadata?.plan_code;
  if (
    (metadataPlanId !== undefined && Number(metadataPlanId) !== attempt.planId)
    || (metadataPlanCode !== undefined && metadataPlanCode !== attempt.paystackPlanCode)
  ) {
    return { valid: false, reason: "metadata_plan_mismatch" };
  }
  if (!Number.isFinite(Number(transactionData?.amount)) || Number(transactionData.amount) !== attempt.amount) {
    return { valid: false, reason: "amount_mismatch" };
  }
  if (String(transactionData?.currency ?? "").toUpperCase() !== attempt.currency.toUpperCase()) {
    return { valid: false, reason: "currency_mismatch" };
  }
  if (
    String(transactionData?.customer?.email ?? "").trim().toLowerCase()
    !== attempt.customerEmail.trim().toLowerCase()
  ) {
    return { valid: false, reason: "customer_email_mismatch" };
  }
  return { valid: true };
}

interface PaystackProcessingContext {
  expectedSubscriptionCode?: string | null;
  expectedCustomerCode?: string | null;
  expectedPlanCode?: string | null;
  expectedInvoiceCode?: string | null;
  source?: "charge.success" | "invoice.update" | "reconciliation";
}

interface PaystackLifecycleContext {
  expectedSubscriptionCode: string;
  expectedCustomerCode: string;
  source: "subscription.disable" | "subscription.not_renew";
}

export type CurrentTrackedCheckoutResult =
  | { valid: true }
  | {
      valid: false;
      reason:
        | "checkout_attempt_missing"
        | "checkout_attempt_changed"
        | "checkout_attempt_terms_changed"
        | "checkout_owner_mismatch"
        | "checkout_state_invalid"
        | "checkout_plan_missing"
        | TrackedCheckoutInvalidReason;
    };

export function validateCurrentTrackedCheckoutAttempt(
  initialAttempt: PaystackCheckoutAttempt,
  currentAttempt: PaystackCheckoutAttempt | null | undefined,
  currentPlan: SubscriptionPlan | null | undefined,
  userId: number,
  transactionData: any,
): CurrentTrackedCheckoutResult {
  if (!currentAttempt) {
    return { valid: false, reason: "checkout_attempt_missing" };
  }
  if (
    currentAttempt.id !== initialAttempt.id
    || currentAttempt.paystackReference !== initialAttempt.paystackReference
  ) {
    return { valid: false, reason: "checkout_attempt_changed" };
  }
  if (
    currentAttempt.billingOwnerUserId !== initialAttempt.billingOwnerUserId
    || currentAttempt.requestedByUserId !== initialAttempt.requestedByUserId
    || currentAttempt.planId !== initialAttempt.planId
    || currentAttempt.amount !== initialAttempt.amount
    || currentAttempt.currency !== initialAttempt.currency
    || currentAttempt.paystackPlanCode !== initialAttempt.paystackPlanCode
    || normalizePaystackEmail(currentAttempt.customerEmail) !== normalizePaystackEmail(initialAttempt.customerEmail)
  ) {
    return { valid: false, reason: "checkout_attempt_terms_changed" };
  }
  if (currentAttempt.billingOwnerUserId !== userId) {
    return { valid: false, reason: "checkout_owner_mismatch" };
  }
  if (currentAttempt.status !== "pending") {
    return { valid: false, reason: "checkout_state_invalid" };
  }
  if (!currentPlan) {
    return { valid: false, reason: "checkout_plan_missing" };
  }
  return validateTrackedCheckoutTerms(currentAttempt, currentPlan, transactionData);
}

export class BillingService {
  private paystack: any;

  /**
   * Serializes concurrent Paystack initialization within this process.
   * When two requests race for the same reference, the second finds the
   * in-flight promise here and awaits it instead of calling Paystack again.
   * Across process boundaries the DB claim (INIT_CLAIM_PREFIX sentinel) is
   * the authoritative lock.
   */
  private readonly initializationMutex = new Map<string, Promise<string>>();

  async requestPaystackCancellation(requestedByUserId: number) {
    await this.requirePaystackBillingSchema();
    const owner = await resolveBillingOwner(requestedByUserId);
    if (owner.state === "unresolved" || !owner.canManageBilling) {
      return { outcome: "manual_review_required" as const, reason: "billing_owner_unresolved" };
    }
    const userId = owner.billingOwnerUserId;
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${userId}, 36)`);
      const [existing] = await tx
        .select()
        .from(paystackCancellationAttempts)
        .where(and(
          eq(paystackCancellationAttempts.billingOwnerUserId, userId),
          inArray(paystackCancellationAttempts.status, [...OPEN_PAYSTACK_CANCELLATION_STATUSES]),
        ))
        .orderBy(desc(paystackCancellationAttempts.createdAt))
        .limit(1);
      if (existing) {
        return {
          outcome: existing.status === "manual_review_required" ? "manual_review_required" as const : "requested" as const,
          attempt: existing,
        };
      }
      const [subscription] = await tx.select().from(userSubscriptions)
        .where(eq(userSubscriptions.userId, userId)).limit(1);
      const [plan] = subscription
        ? await tx.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, subscription.planId)).limit(1)
        : [];
      const identities = await tx.select().from(paystackSubscriptionIdentities)
        .where(and(
          eq(paystackSubscriptionIdentities.userId, userId),
          eq(paystackSubscriptionIdentities.status, "active"),
        ));
      const exact = identities.filter((identity) =>
        identity.subscriptionCode
        && identity.customerCode === subscription?.paystackCustomerCode
        && identity.planCode === plan?.paystackPlanCode
      );
      const safe = identities.length === 1 && exact.length === 1;
      const now = new Date();
      const [attempt] = await tx.insert(paystackCancellationAttempts).values({
        billingOwnerUserId: userId,
        subscriptionCode: safe ? exact[0].subscriptionCode : null,
        status: safe ? "requested" : "manual_review_required",
        requestedAt: now,
        failureCode: safe ? null : identities.length === 0 ? "missing_active_identity" : "ambiguous_active_identity",
        updatedAt: now,
      }).returning();
      await tx.update(userSubscriptions)
        .set({ cancellationRequestedAt: now, updatedAt: now })
        .where(eq(userSubscriptions.userId, userId));
      return { outcome: safe ? "requested" as const : "manual_review_required" as const, attempt };
    });
  }

  async confirmPaystackCancellationLifecycle(input: {
    userId: number;
    subscriptionCode: string;
    customerCode: string;
    event: "subscription.not_renew" | "subscription.disable";
  }) {
    await this.requirePaystackBillingSchema();
    // Exact signed provider lifecycle events are authoritative even when the
    // customer used Paystack's hosted management page instead of our UI.
    await this.requestPaystackCancellation(input.userId);
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${input.userId}, 36)`);
      const [identity] = await tx.select().from(paystackSubscriptionIdentities)
        .where(and(
          eq(paystackSubscriptionIdentities.userId, input.userId),
          eq(paystackSubscriptionIdentities.status, "active"),
          eq(paystackSubscriptionIdentities.subscriptionCode, input.subscriptionCode),
          eq(paystackSubscriptionIdentities.customerCode, input.customerCode),
        )).limit(1);
      const [attempt] = await tx.select().from(paystackCancellationAttempts)
        .where(and(
          eq(paystackCancellationAttempts.billingOwnerUserId, input.userId),
          eq(paystackCancellationAttempts.subscriptionCode, input.subscriptionCode),
          inArray(paystackCancellationAttempts.status, [...OPEN_PAYSTACK_CANCELLATION_STATUSES]),
        )).orderBy(desc(paystackCancellationAttempts.createdAt)).limit(1);
      if (!identity || !attempt) {
        return { outcome: "rejected" as const, reason: "cancellation_identity_mismatch" };
      }
      const status = input.event === "subscription.disable" ? "provider_disabled" : "provider_non_renewing";
      if (attempt.status === "provider_disabled" || attempt.status === status) {
        return { outcome: "confirmed" as const, transition: "already_applied" as const, attempt };
      }
      const now = new Date();
      const [updated] = await tx.update(paystackCancellationAttempts).set({
        status,
        providerConfirmedAt: attempt.providerConfirmedAt ?? now,
        lastCheckedAt: now,
        updatedAt: now,
      }).where(eq(paystackCancellationAttempts.id, attempt.id)).returning();
      return { outcome: "confirmed" as const, transition: "applied" as const, attempt: updated };
    });
  }

  async getPaystackCancellationStatus(userId: number) {
    const owner = await resolveBillingOwner(userId);
    if (owner.state === "unresolved") return null;
    const [attempt] = await db.select().from(paystackCancellationAttempts)
      .where(eq(paystackCancellationAttempts.billingOwnerUserId, owner.billingOwnerUserId))
      .orderBy(desc(paystackCancellationAttempts.createdAt)).limit(1);
    if (!attempt) return null;
    return {
      status: attempt.status,
      requestedAt: attempt.requestedAt,
      providerConfirmedAt: attempt.providerConfirmedAt,
    };
  }

  /** Read-only provider boundary. Never persists or logs email_token. */
  async fetchAndValidateCancellationTarget(subscriptionCode: string) {
    await this.requirePaystackBillingSchema();
    if (!this.paystack) return { valid: false as const, reason: "paystack_unavailable" };
    const identity = await this.getPaystackSubscriptionIdentityByCode(subscriptionCode);
    if (!identity || identity.status !== "active") {
      return { valid: false as const, reason: "active_identity_missing" };
    }
    const localSubscription = await this.getUserSubscription(identity.userId);
    const plan = localSubscription && storage.getSubscriptionPlan
      ? await storage.getSubscriptionPlan(localSubscription.planId)
      : null;
    const response = await this.paystack.subscription.get(subscriptionCode);
    const data = response?.status ? response.data : null;
    const providerCode = extractPaystackSubscriptionCode(data);
    const providerCustomer = extractPaystackCustomerCode(data);
    const providerPlan = extractPaystackPlanCode(data);
    const emailToken = typeof data?.email_token === "string" && data.email_token.trim()
      ? data.email_token
      : null;
    if (
      providerCode !== identity.subscriptionCode
      || providerCustomer !== identity.customerCode
      || providerPlan !== identity.planCode
      || providerPlan !== plan?.paystackPlanCode
      || !emailToken
    ) {
      return { valid: false as const, reason: "provider_relationship_mismatch" };
    }
    return {
      valid: true as const,
      subscriptionCode: providerCode,
      customerCode: providerCustomer,
      planCode: providerPlan,
      providerStatus: String(data?.status ?? "unknown").toLowerCase(),
      emailToken,
    };
  }

  /**
   * Sentinel prefix written into paystack_access_code to claim the
   * initialization slot atomically at the DB layer. Format:
   *   PAYSTACK_INIT_CLAIM:<epoch-ms>
   * The epoch timestamp lets pollers detect and preempt abandoned claims.
   */
  private static readonly INIT_CLAIM_PREFIX = "PAYSTACK_INIT_CLAIM";

  /** An abandoned claim older than this is eligible for takeover. */
  private static readonly CLAIM_TIMEOUT_MS = 30_000;

  /** How often the claim holder refreshes updated_at to prove it is still alive. */
  private static readonly CLAIM_HEARTBEAT_INTERVAL_MS = 8_000;

  /** How long to wait between DB poll attempts when another process claims. */
  private static readonly POLL_INTERVAL_MS = 300;

  /** Maximum time to wait for another process to complete initialization. */
  private static readonly POLL_TIMEOUT_MS = 35_000;

  constructor() {
    // Initialize Paystack if secret key is available
    if (process.env.PAYSTACK_SECRET_KEY) {
      this.paystack = Paystack(process.env.PAYSTACK_SECRET_KEY);
    }
  }

  async getPaystackBillingSchemaReadiness() {
    return getPaystackBillingSchemaReadiness();
  }

  private async requirePaystackBillingSchema(): Promise<void> {
    await requirePaystackBillingSchema();
  }

  private legacyStoredAuthorizationChargesEnabled(): boolean {
    // Deliberately hard-disabled: no request path may create a one-click
    // Paystack charge from a stored authorization.
    return false;
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
  private async validatePaystackLifecycleIdentityInTransaction(
    tx: any,
    userId: number,
    context: PaystackLifecycleContext,
  ): Promise<boolean> {
    const [activeIdentity] = await tx
      .select()
      .from(paystackSubscriptionIdentities)
      .where(and(
        eq(paystackSubscriptionIdentities.userId, userId),
        eq(paystackSubscriptionIdentities.status, "active"),
      ))
      .orderBy(desc(paystackSubscriptionIdentities.providerCreatedAt), desc(paystackSubscriptionIdentities.createdAt))
      .limit(1);
    const relationship = validateActivePaystackRenewalRelationship(
      context.expectedSubscriptionCode,
      context.expectedCustomerCode,
      activeIdentity ?? null,
    );
    if (relationship.valid) return true;

    await tx.insert(billingEvents).values({
      userId,
      eventType: "paystack_lifecycle_event_rejected",
      eventData: {
        source: context.source,
        reason: relationship.reason,
        expectedSubscriptionCode: context.expectedSubscriptionCode,
        expectedCustomerCode: context.expectedCustomerCode,
        activeSubscriptionCode: activeIdentity?.subscriptionCode ?? null,
        activeCustomerCode: activeIdentity?.customerCode ?? null,
      },
      processed: false,
    });
    return false;
  }

  async cancelSubscription(
    userId: number,
    lifecycleContext?: PaystackLifecycleContext,
  ): Promise<boolean> {
    try {
      if (lifecycleContext) {
        await this.requirePaystackBillingSchema();
      }
      const cancelledAt = new Date();
      const subscription = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${userId}, 36)`);
        if (
          lifecycleContext
          && !await this.validatePaystackLifecycleIdentityInTransaction(tx, userId, lifecycleContext)
        ) {
          return null;
        }
        const [lockedSubscription] = await tx
          .select()
          .from(userSubscriptions)
          .where(eq(userSubscriptions.userId, userId))
          .limit(1)
          .for("update");
        if (!lockedSubscription) {
          throw new Error('No active subscription found');
        }
        const [cancelled] = await tx
          .update(userSubscriptions)
          .set({
            status: 'cancelled',
            cancelledAt,
            updatedAt: cancelledAt,
          })
          .where(eq(userSubscriptions.id, lockedSubscription.id))
          .returning();
        return cancelled ?? lockedSubscription;
      });
      if (!subscription) return false;

      await this.logBillingEvent(userId, 'subscription_cancelled', {
        subscriptionId: subscription.id,
        cancelledAt: cancelledAt.toISOString()
      });

      log(`Subscription cancelled for user ${userId}`, 'billing');
      return true;

    } catch (error) {
      log(`Error cancelling subscription for user ${userId}: ${error}`, 'billing');
      throw error;
    }
  }

  async markSubscriptionNotRenewing(
    userId: number,
    lifecycleContext?: PaystackLifecycleContext,
  ): Promise<UserSubscription | null> {
    if (lifecycleContext) {
      await this.requirePaystackBillingSchema();
    }
    const cancelledAt = new Date();
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${userId}, 36)`);
      if (
        lifecycleContext
        && !await this.validatePaystackLifecycleIdentityInTransaction(tx, userId, lifecycleContext)
      ) {
        return null;
      }
      const [lockedSubscription] = await tx
        .select()
        .from(userSubscriptions)
        .where(eq(userSubscriptions.userId, userId))
        .limit(1)
        .for("update");
      if (!lockedSubscription) return null;

      const [updated] = await tx
        .update(userSubscriptions)
        .set({ cancelledAt, updatedAt: cancelledAt })
        .where(eq(userSubscriptions.id, lockedSubscription.id))
        .returning();
      return (updated ?? lockedSubscription) as UserSubscription;
    });
  }

  /**
   * Upgrade a workspace owner's subscription to a higher-capacity Team plan using
   * the stored Paystack authorization (one-click, checkout-light). Charges the
   * saved card for the new tier's price, then atomically switches the local
   * subscription to the new plan so seat capacity increases immediately.
   *
   * Returns `{ success:false, needsCheckout:true }` when a one-click upgrade is
   * not possible (no stored authorization, no Paystack, or no existing
   * subscription) so the caller can fall back to a full Paystack checkout.
   *
   * Guard rails:
   *  - Target must be an ACTIVE, recurring plan with a Paystack plan code.
   *  - Target max_seats MUST exceed the current plan's capacity (no downgrades
   *    through this path — downgrades are handled by the over-capacity policy).
   *
   * DEPRECATED / DISABLED IN PRODUCTION: this performs a one-time charge_authorization
   * for the new tier and switches the plan locally WITHOUT migrating the recurring
   * Paystack subscription. At the next renewal the webhook receives the OLD plan code
   * and reconciles the customer back to the old plan (reducing seats, under-charging).
   * The /api/billing/upgrade route NO LONGER calls this method — upgrades go through
   * full Paystack checkout instead. Retained only for unit-test coverage; do not wire
   * this back into any request path until proper subscription retirement/migration
   * (disable old subscription + create new one) is implemented.
   */
  async upgradeToPlanWithStoredAuth(
    userId: number,
    targetPlanId: number
  ): Promise<{
    success: boolean;
    needsCheckout?: boolean;
    reason?: string;
    subscription?: UserSubscription;
    plan?: SubscriptionPlan;
  }> {
    if (!storage.getSubscriptionPlan) {
      throw new Error('Subscription plan lookup not supported by current storage');
    }

    const targetPlan = await storage.getSubscriptionPlan(targetPlanId);
    if (!targetPlan || !targetPlan.isActive) {
      throw new Error('Target plan not found or inactive');
    }
    if (targetPlan.billingPeriod !== 'monthly' && targetPlan.billingPeriod !== 'yearly') {
      throw new Error('Target plan is not a recurring plan');
    }
    if (!targetPlan.paystackPlanCode) {
      throw new Error('Target plan is missing a Paystack plan code');
    }

    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      // Nothing to upgrade from — the owner must run a full checkout first.
      return { success: false, needsCheckout: true, reason: 'no_existing_subscription' };
    }

    const currentPlan = await storage.getSubscriptionPlan(subscription.planId);
    const currentCapacity = currentPlan?.maxSeats ?? 1;
    if ((targetPlan.maxSeats ?? 1) <= currentCapacity) {
      throw new Error('not_an_upgrade');
    }

    const user = await storage.getUser(userId);
    const email = user?.email;
    if (!email) {
      throw new Error('User email unavailable for upgrade charge');
    }

    // One-click path requires a stored authorization and an initialized Paystack client.
    if (!this.paystack || !subscription.authorizationCode) {
      return { success: false, needsCheckout: true, reason: 'no_stored_authorization' };
    }

    // This legacy method intentionally cannot charge a stored authorization.
    // Keep the safe result for callers/tests that still reference it, but never
    // allow an accidental future route to reactivate the one-click path.
    if (!this.legacyStoredAuthorizationChargesEnabled()) {
      return {
        success: false,
        needsCheckout: true,
        reason: "stored_authorization_charges_disabled",
      };
    }

    const reference = `upg_${userId}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    let chargeData: any;
    try {
      const chargeResponse = await this.paystack.transaction.charge({
        reference,
        authorization_code: subscription.authorizationCode,
        email,
        amount: targetPlan.price,
      });
      if (!chargeResponse?.status || chargeResponse?.data?.status !== 'success') {
        const reason = chargeResponse?.data?.gateway_response || chargeResponse?.message || 'charge_declined';
        log(`Upgrade charge failed for user ${userId} (plan ${targetPlan.name}): ${reason}`, 'billing');
        await this.logBillingEvent(userId, 'subscription_upgrade_failed', {
          targetPlanId,
          reference,
          reason,
        });
        throw new Error(`upgrade_charge_failed: ${reason}`);
      }
      chargeData = chargeResponse.data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith('upgrade_charge_failed')) throw error;
      log(`Error charging stored authorization for upgrade (user ${userId}): ${message}`, 'billing');
      throw new Error(`upgrade_charge_failed: ${message}`);
    }

    const now = new Date();
    const nextBillingDate = new Date();
    const isYearly = targetPlan.billingPeriod === 'yearly';
    if (isYearly) {
      nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
    } else {
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
    }
    const refreshedAuthCode = chargeData?.authorization?.authorization_code ?? subscription.authorizationCode;
    const customerCode = chargeData?.customer?.customer_code ?? subscription.paystackCustomerCode ?? undefined;

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(userSubscriptions)
        .set({
          status: 'active',
          planId: targetPlan.id,
          nextBillingDate,
          totalPaid: (subscription.totalPaid || 0) + targetPlan.price,
          lastPaymentDate: now,
          paystackReference: reference,
          paystackCustomerCode: customerCode,
          authorizationCode: refreshedAuthCode,
          cancelledAt: null,
          updatedAt: now,
        })
        .where(eq(userSubscriptions.userId, userId))
        .returning();

      await tx
        .update(users)
        .set({
          subscriptionTier: isYearly ? 'yearly' : 'monthly',
          subscriptionExpiresAt: nextBillingDate,
          updatedAt: now,
        })
        .where(eq(users.id, userId));

      await tx
        .insert(paymentTransactions)
        .values({
          userId,
          subscriptionId: subscription.id,
          amount: targetPlan.price,
          currency: 'ZAR',
          status: 'completed',
          platform: 'paystack',
          paymentMethod: chargeData?.channel ?? 'other',
          platformTransactionId: reference,
          platformOrderId: chargeData?.reference || reference,
          platformSubscriptionId: targetPlan.paystackPlanCode || 'unknown',
          metadata: {
            customerCode,
            authorizationCode: refreshedAuthCode,
            planCode: targetPlan.paystackPlanCode,
            upgrade: true,
            fromPlanId: subscription.planId,
            toPlanId: targetPlan.id,
          },
          description: `Upgrade to ${targetPlan.displayName || targetPlan.name}`,
          failureReason: null,
          refundReason: null,
        })
        .onConflictDoNothing();

      await tx
        .insert(billingEvents)
        .values({
          userId,
          eventType: 'subscription_upgraded',
          eventData: {
            fromPlanId: subscription.planId,
            toPlanId: targetPlan.id,
            fromSeats: currentCapacity,
            toSeats: targetPlan.maxSeats ?? 1,
            reference,
          },
          processed: true,
        });

      return row as UserSubscription;
    });

    log(`User ${userId} upgraded ${currentPlan?.name || 'current plan'} → ${targetPlan.name} (${currentCapacity} → ${targetPlan.maxSeats} seats) via stored authorization`, 'billing');
    return { success: true, subscription: updated, plan: targetPlan };
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
    await this.requirePaystackBillingSchema();
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

  async getActivePaystackSubscriptionIdentity(userId: number) {
    await this.requirePaystackBillingSchema();
    const [identity] = await db
      .select()
      .from(paystackSubscriptionIdentities)
      .where(and(
        eq(paystackSubscriptionIdentities.userId, userId),
        eq(paystackSubscriptionIdentities.status, "active"),
      ))
      .orderBy(desc(paystackSubscriptionIdentities.providerCreatedAt), desc(paystackSubscriptionIdentities.createdAt))
      .limit(1);
    return identity ?? null;
  }

  /**
   * Returns true when there is at least one `legacy_paystack_webhook_processed`
   * event for this user AND the most recent such event is newer than any
   * `subscription_failed` event.
   *
   * `legacy_paystack_webhook_processed` is exclusively recorded when a Paystack
   * `charge.success` webhook arrives without `metadata.user_id` — a pattern
   * that only occurs for provider-originated recurring renewals, never for
   * customer-initiated initial checkout payments (which carry metadata). This
   * makes it a more authoritative recurring settlement signal than the generic
   * `subscription_activated` event, which is also emitted for initial checkouts
   * and cannot on its own prove a recurring relationship is healthy.
   */
  private async hasSuccessfulRecurringSettlementEvidence(
    userId: number,
  ): Promise<boolean> {
    const [latestWebhookProcessed] = await db
      .select({ createdAt: billingEvents.createdAt })
      .from(billingEvents)
      .where(and(
        eq(billingEvents.userId, userId),
        eq(billingEvents.eventType, "legacy_paystack_webhook_processed"),
      ))
      .orderBy(desc(billingEvents.createdAt))
      .limit(1);

    if (!latestWebhookProcessed) return false;

    const [latestFailure] = await db
      .select({ createdAt: billingEvents.createdAt })
      .from(billingEvents)
      .where(and(
        eq(billingEvents.userId, userId),
        eq(billingEvents.eventType, "subscription_failed"),
      ))
      .orderBy(desc(billingEvents.createdAt))
      .limit(1);

    // A failure that is newer than the last authoritative recurring webhook
    // blocks the neutral state.
    if (latestFailure && latestFailure.createdAt >= latestWebhookProcessed.createdAt) {
      return false;
    }

    return true;
  }

  /**
   * Extracts the Paystack plan code from a raw webhook payload using the same
   * candidate fields that `extractPaystackRenewalEvidence` in paystack-renewal.ts
   * supports. Returns null when no plan code is present in the payload.
   */
  private extractProviderPlanCodeFromWebhook(data: any): string | null {
    if (typeof data?.plan === "string") return data.plan || null;
    return (
      data?.plan?.plan_code ??
      data?.plan_code ??
      data?.subscription?.plan?.plan_code ??
      data?.subscription?.plan_code ??
      null
    );
  }

  /**
   * Resolve a local user by their Paystack customer code, using active
   * subscription records. Returns null when no match exists or when more than
   * one distinct user ID maps to the same customer code (ambiguous — fail
   * closed). Also returns the resolved subscription's planId so the caller can
   * verify the provider plan code against the local plan.
   */
  private async resolveLocalUserByPaystackCustomerCode(
    customerCode: string,
  ): Promise<{ userId: number; planId: number } | null> {
    const matches = await db
      .select({ userId: userSubscriptions.userId, planId: userSubscriptions.planId })
      .from(userSubscriptions)
      .where(and(
        eq(userSubscriptions.paystackCustomerCode, customerCode),
        eq(userSubscriptions.status, "active"),
      ))
      .limit(2);

    if (matches.length === 0) return null;

    const uniqueUserIds = Array.from(new Set(matches.map((m) => m.userId)));
    if (uniqueUserIds.length !== 1) return null;

    return { userId: uniqueUserIds[0], planId: matches[0].planId };
  }

  private async loadPaystackSubscriptionCandidates(
    userId: number,
    subscriptionOverride?: Pick<UserSubscription, "planId" | "paystackCustomerCode" | "nextBillingDate">,
  ): Promise<
    | {
        available: true;
        customerCode: string;
        expectedPlanCode: string | null;
        activeSubscriptionCode: string | null;
        providerSubscriptionCount: number;
        candidates: Array<PaystackSubscriptionCandidateSummary & { providerData: any }>;
      }
    | { available: false; reason: PaystackSubscriptionCandidateInspectionUnavailableReason }
  > {
    const subscription = subscriptionOverride ?? await this.getUserSubscription(userId);
    if (!subscription) {
      return { available: false, reason: "missing_local_subscription" };
    }
    if (!subscription.paystackCustomerCode) {
      return { available: false, reason: "missing_paystack_customer_code" };
    }
    if (!this.paystack) {
      return { available: false, reason: "paystack_unavailable" };
    }

    const plan = storage.getSubscriptionPlan
      ? await storage.getSubscriptionPlan(subscription.planId)
      : null;
    const expectedPlanCode = plan?.paystackPlanCode ?? null;
    if (!expectedPlanCode) {
      return { available: false, reason: "missing_paystack_plan_code" };
    }
    const customerResponse = await this.paystack.customer.get(subscription.paystackCustomerCode);
    const customerId = customerResponse?.status ? customerResponse?.data?.id : null;
    if (!customerId) {
      return { available: false, reason: "paystack_customer_lookup_failed" };
    }

    // An empty first page is proof only when the provider has not indicated
    // more pages. Never infer "no relationship" from a partial listing: that
    // would let a later-page recurring subscription be replaced by checkout.
    const allProviderSubscriptions: any[] = [];
    const pageSize = 100;
    const maximumPages = 1_000;
    let page = 1;
    while (page <= maximumPages) {
      const response = await (this.paystack.subscription.list as any)({
        customer: customerId,
        perPage: pageSize,
        ...(page > 1 ? { page } : {}),
      });
      if (!response?.status || !Array.isArray(response?.data)) {
        return { available: false, reason: "paystack_subscription_list_failed" };
      }
      allProviderSubscriptions.push(...response.data);

      const meta = response.meta ?? {};
      const rawPageCount = meta.pageCount ?? meta.page_count;
      const rawTotal = meta.total;
      const rawCurrentPage = meta.page ?? meta.currentPage ?? meta.current_page;
      const hasPageCount = rawPageCount !== undefined && rawPageCount !== null;
      const hasTotal = rawTotal !== undefined && rawTotal !== null;
      const hasCurrentPage = rawCurrentPage !== undefined && rawCurrentPage !== null;
      const pageCount = hasPageCount ? Number(rawPageCount) : null;
      const total = hasTotal ? Number(rawTotal) : null;
      const currentPage = hasCurrentPage ? Number(rawCurrentPage) : null;
      const isWholeNumber = (value: number | null): value is number =>
        value !== null && Number.isSafeInteger(value) && value >= 0;

      if ((hasPageCount && !isWholeNumber(pageCount))
        || (hasTotal && !isWholeNumber(total))
        || (hasCurrentPage && (!isWholeNumber(currentPage) || currentPage !== page))) {
        return {
          available: false,
          reason: "paystack_subscription_list_pagination_unresolved",
        };
      }

      if (hasPageCount && hasTotal) {
        const knownPageCount = pageCount!;
        const knownTotal = total!;
        const expectedPageCount = knownTotal === 0 ? 0 : Math.ceil(knownTotal / pageSize);
        // Paystack may represent an empty list as zero pages or one empty page.
        const emptyPageCountIsValid = knownTotal === 0
          && (knownPageCount === 0 || knownPageCount === 1);
        if ((!emptyPageCountIsValid && knownPageCount !== expectedPageCount)
          || (knownTotal === 0 && response.data.length !== 0)
          || (knownTotal > 0 && (knownPageCount === 0 || page > knownPageCount))) {
          return {
            available: false,
            reason: "paystack_subscription_list_pagination_unresolved",
          };
        }
        const expectedRowsThisPage = knownTotal === 0
          ? 0
          : Math.min(pageSize, knownTotal - ((page - 1) * pageSize));
        if (response.data.length !== expectedRowsThisPage) {
          return {
            available: false,
            reason: "paystack_subscription_list_pagination_unresolved",
          };
        }
        if (knownTotal === 0 || page >= knownPageCount) break;
        page += 1;
        continue;
      }

      if (hasPageCount) {
        const knownPageCount = pageCount!;
        if (knownPageCount === 0) {
          if (response.data.length !== 0) {
            return {
              available: false,
              reason: "paystack_subscription_list_pagination_unresolved",
            };
          }
          break;
        }
        if (page > knownPageCount || (page < knownPageCount && response.data.length !== pageSize)) {
          return {
            available: false,
            reason: "paystack_subscription_list_pagination_unresolved",
          };
        }
        if (page >= knownPageCount) break;
        page += 1;
        continue;
      }

      if (hasTotal) {
        const knownTotal = total!;
        const expectedRowsThisPage = Math.min(
          pageSize,
          Math.max(0, knownTotal - ((page - 1) * pageSize)),
        );
        if (response.data.length !== expectedRowsThisPage) {
          return {
            available: false,
            reason: "paystack_subscription_list_pagination_unresolved",
          };
        }
        if (allProviderSubscriptions.length >= knownTotal) break;
        page += 1;
        continue;
      }

      // Without pagination metadata, a short result is the provider's only
      // complete-list signal. A full page remains deliberately unresolved.
      if (response.data.length < pageSize) break;
      return {
        available: false,
        reason: "paystack_subscription_list_pagination_unresolved",
      };
    }
    if (page > maximumPages) {
      return {
        available: false,
        reason: "paystack_subscription_list_pagination_unresolved",
      };
    }

    const viableCandidates = allProviderSubscriptions.filter((candidate: any) =>
      isViablePaystackSubscriptionCandidate(
        candidate,
        subscription.paystackCustomerCode!,
        expectedPlanCode,
      ),
    );
    const activeIdentity = await this.getActivePaystackSubscriptionIdentity(userId);
    const candidates = (await Promise.all(viableCandidates.map(async (candidate: any) => {
      const subscriptionCode = extractPaystackSubscriptionCode(candidate)!;
      let providerData = candidate;
      let providerLookupFailed = false;
      try {
        const detail = await this.paystack.subscription.get(subscriptionCode);
        if (detail?.status && detail?.data) {
          // Detail responses occasionally omit relationship fields returned by
          // the list endpoint. Preserve the list identity so a read-only
          // inspection can never erase the customer/plan proof used to select
          // this candidate.
          providerData = {
            ...candidate,
            ...detail.data,
            customer: detail.data.customer ?? candidate.customer,
            plan: detail.data.plan ?? candidate.plan,
            subscription_code: detail.data.subscription_code ?? candidate.subscription_code,
          };
        } else {
          providerLookupFailed = true;
        }
      } catch {
        providerLookupFailed = true;
      }

      const recentInvoice = getMostRecentPaystackInvoice(providerData);
      const classifiedInvoice = recentInvoice
        ? {
            ...classifyPaystackInvoice(recentInvoice, subscription.nextBillingDate),
            createdAt: parsePaystackDate(
              recentInvoice.created_at
                ?? recentInvoice.createdAt
                ?? recentInvoice.paid_at
                ?? recentInvoice.paidAt
                ?? recentInvoice.period_start,
            ),
          }
        : null;
      const providerCreatedAt = parsePaystackDate(
        providerData?.created_at ?? providerData?.createdAt ?? candidate?.created_at ?? candidate?.createdAt,
      );

      return {
        subscriptionCode,
        customerCode: extractPaystackCustomerCode(providerData)
          ?? extractPaystackCustomerCode(candidate)
          ?? (typeof candidate?.customer === "string" ? candidate.customer : null),
        planCode: typeof providerData?.plan === "string"
          ? providerData.plan
          : providerData?.plan?.plan_code
            ?? providerData?.plan_code
            ?? candidate?.plan?.plan_code
            ?? candidate?.plan_code
            ?? null,
        status: String(providerData?.status ?? candidate?.status ?? "unknown").toLowerCase(),
        providerCreatedAt,
        nextPaymentDate: parsePaystackDate(
          providerData?.next_payment_date ?? providerData?.nextPaymentDate
            ?? candidate?.next_payment_date ?? candidate?.nextPaymentDate,
        ),
        recentInvoice: classifiedInvoice,
        providerLookupFailed,
        providerData,
      };
    }))).filter((candidate) =>
      extractPaystackSubscriptionCode(candidate.providerData) === candidate.subscriptionCode
        && isViablePaystackSubscriptionCandidate(
          candidate.providerData,
          subscription.paystackCustomerCode!,
          expectedPlanCode,
        ),
    );

    return {
      available: true,
      customerCode: subscription.paystackCustomerCode,
      expectedPlanCode,
      activeSubscriptionCode: activeIdentity?.subscriptionCode ?? null,
      providerSubscriptionCount: allProviderSubscriptions.length,
      candidates,
    };
  }

  async inspectPaystackSubscriptionCandidates(
    userId: number,
  ): Promise<PaystackSubscriptionCandidateInspection> {
    const inspection = await this.loadPaystackSubscriptionCandidates(userId);
    if (!inspection.available) return inspection;
    return {
      available: true,
      customerCode: inspection.customerCode,
      expectedPlanCode: inspection.expectedPlanCode,
      activeSubscriptionCode: inspection.activeSubscriptionCode,
      candidates: inspection.candidates.map(({ providerData: _providerData, ...candidate }) => candidate),
    };
  }

  /**
   * Read and, only when it is unambiguous, recover a legacy recurring
   * relationship. This never opens checkout, charges a card, or changes the
   * paid entitlement. It is deliberately stricter than support-assisted
   * resolution: multiple plausible provider subscriptions remain manual review.
   */

  /**
   * Attempt safe identity recovery for a signed recurring webhook (charge.success
   * or paid invoice.update) that arrived with a known subscription code but no
   * matching `paystack_subscription_identities` row.
   *
   * Safety gates — all must pass before creating an identity:
   * 1. The subscription code is not already owned by a different row.
   * 2. Exactly one local active subscription has the matching Paystack customer
   *    code (no ambiguity across multiple users).
   * 3. No active identity already exists for the resolved user.
   *
   * When every gate passes the identity is recorded via
   * `recordPaystackSubscriptionIdentity` with `allowNewActive: true`. Readiness
   * follows the standard authorization evidence rules (`ready` only when reusable
   * authorization is explicitly bound to the exact provider relationship;
   * otherwise `unknown`).
   *
   * This method NEVER creates a checkout attempt and NEVER charges the customer.
   */
  async attemptSafeLegacyWebhookIdentityRecovery(
    data: any,
    renewalEvidence: {
      subscriptionCode: string;
      customerCode: string;
      transactionReference: string;
    },
    options: {
      expectedUserId?: number;
    } = {},
  ): Promise<
    | { outcome: "recovered"; userId: number }
    | { outcome: "failed"; reason: string }
  > {
    const { subscriptionCode, customerCode } = renewalEvidence;

    if (!subscriptionCode || !subscriptionCode.startsWith("SUB_")) {
      return { outcome: "failed", reason: "missing_subscription_identity" };
    }
    if (!customerCode) {
      return { outcome: "failed", reason: "missing_customer_identity" };
    }

    // Gate 1: subscription code must not already be owned by another row.
    const existingOwner = await this.getPaystackSubscriptionIdentityByCode(subscriptionCode);
    if (existingOwner) {
      return { outcome: "failed", reason: "subscription_code_already_owned" };
    }

    // Gate 2: customer code must resolve to exactly one local active subscription
    // (no ambiguity across multiple user accounts).
    const resolved = await this.resolveLocalUserByPaystackCustomerCode(customerCode);
    if (!resolved) {
      return {
        outcome: "failed",
        reason: "ambiguous_or_missing_local_subscription_for_customer_code",
      };
    }
    const { userId, planId } = resolved;

    if (options.expectedUserId !== undefined && options.expectedUserId !== userId) {
      return { outcome: "failed", reason: "resolved_owner_mismatch" };
    }

    // Signed webhooks can still carry application-supplied metadata or customer
    // fields. They are useful consistency checks, but the provider customer-code
    // match above remains the ownership authority for legacy recovery.
    const rawMetadataUserId = data?.metadata?.user_id ?? data?.subscription?.metadata?.user_id;
    if (rawMetadataUserId !== undefined && rawMetadataUserId !== null) {
      const metadataUserId = Number(rawMetadataUserId);
      if (!Number.isFinite(metadataUserId) || metadataUserId !== userId) {
        return { outcome: "failed", reason: "metadata_user_mismatch" };
      }
    }
    const webhookEmail = data?.customer?.email ?? data?.subscription?.customer?.email;
    if (typeof webhookEmail === "string" && webhookEmail.trim()) {
      const owner = await storage.getUser(userId);
      if (
        !owner?.email
        || owner.email.trim().toLowerCase() !== webhookEmail.trim().toLowerCase()
      ) {
        return { outcome: "failed", reason: "customer_email_mismatch" };
      }
    }

    // Gate 2b: if the webhook contains a plan code, it must match the local
    // plan's Paystack plan code exactly. Missing plan evidence is also unsafe:
    // without it, a customer code alone cannot prove that this SUB_* belongs to
    // the local paid plan.
    const webhookPlanCode = this.extractProviderPlanCodeFromWebhook(data);
    if (!webhookPlanCode) {
      return { outcome: "failed", reason: "missing_plan_identity" };
    }
    const [localPlan] = await db
      .select({ paystackPlanCode: subscriptionPlans.paystackPlanCode })
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, planId))
      .limit(1);
    if (!localPlan?.paystackPlanCode || localPlan.paystackPlanCode !== webhookPlanCode) {
      return { outcome: "failed", reason: "plan_code_mismatch" };
    }

    // Gate 3: no competing active identity may already exist for this user.
    const existingIdentity = await this.getActivePaystackSubscriptionIdentity(userId);
    if (existingIdentity) {
      return { outcome: "failed", reason: "user_already_has_active_identity" };
    }

    // All gates passed — record the identity. Readiness is determined by the
    // authorization evidence present in the charge payload (same rules as the
    // subscription.create flow).
    try {
      const identity = await this.recordPaystackSubscriptionIdentity(userId, data, {
        allowNewActive: true,
        rejectExistingActive: true,
        expectedCustomerCode: customerCode,
        expectedPlanCode: webhookPlanCode,
        auditSource: "legacy_webhook_identity_recovery",
      });
      if (identity.status !== "active") {
        return { outcome: "failed", reason: "user_already_has_active_identity" };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "Paystack identity recovery found a competing active subscription") {
        return { outcome: "failed", reason: "user_already_has_active_identity" };
      }
      throw error;
    }

    return { outcome: "recovered", userId };
  }

  async recoverPaystackRenewalRelationship(
    userId: number,
  ): Promise<PaystackRenewalIdentityRecoveryResult> {
    await this.requirePaystackBillingSchema();

    const existingIdentity = await this.getActivePaystackSubscriptionIdentity(userId);
    if (existingIdentity) {
      return {
        outcome: "relationship_available",
        subscriptionCode: existingIdentity.subscriptionCode,
      };
    }

    let inspection: Awaited<ReturnType<BillingService["loadPaystackSubscriptionCandidates"]>>;
    try {
      inspection = await this.loadPaystackSubscriptionCandidates(userId);
    } catch {
      await this.recordBillingEvent(userId, "renewal_reconciliation_pending", {
        reason: "paystack_provider_lookup_failed",
      });
      return { outcome: "reconciling", reason: "paystack_provider_lookup_failed" };
    }

    if (!inspection.available) {
      await this.recordBillingEvent(userId, "renewal_reconciliation_pending", {
        reason: inspection.reason,
      });
      return { outcome: "reconciling", reason: inspection.reason };
    }

    if (inspection.candidates.length === 0) {
      if (inspection.providerSubscriptionCount === 0) {
        await this.recordBillingEvent(userId, "renewal_setup_recovery_required", {
          reason: "no_verified_recurring_relationship",
          customerCode: inspection.customerCode,
          expectedPlanCode: inspection.expectedPlanCode,
          providerSubscriptionCount: inspection.providerSubscriptionCount,
        });
        return { outcome: "no_verified_relationship" };
      }

      await this.recordBillingEvent(userId, "renewal_recovery_manual_review", {
        reason: "provider_subscription_customer_or_plan_mismatch",
        customerCode: inspection.customerCode,
        expectedPlanCode: inspection.expectedPlanCode,
        providerSubscriptionCount: inspection.providerSubscriptionCount,
      });
      return {
        outcome: "manual_review_required",
        reason: "provider_subscription_customer_or_plan_mismatch",
      };
    }

    if (inspection.candidates.length !== 1) {
      await this.recordBillingEvent(userId, "renewal_recovery_manual_review", {
        reason: "multiple_plausible_paystack_subscriptions",
        customerCode: inspection.customerCode,
        expectedPlanCode: inspection.expectedPlanCode,
        candidateCount: inspection.candidates.length,
      });
      return {
        outcome: "manual_review_required",
        reason: "multiple_plausible_paystack_subscriptions",
      };
    }

    const candidate = inspection.candidates[0];
    if (candidate.providerLookupFailed) {
      await this.recordBillingEvent(userId, "renewal_recovery_manual_review", {
        reason: "provider_subscription_detail_unavailable",
        subscriptionCode: candidate.subscriptionCode,
      });
      return {
        outcome: "manual_review_required",
        reason: "provider_subscription_detail_unavailable",
      };
    }

    try {
      const recorded = await this.recordPaystackSubscriptionIdentity(
        userId,
        candidate.providerData,
        {
          allowNewActive: true,
          preserveExistingActive: true,
          auditSource: "automatic_legacy_renewal_recovery",
          expectedCustomerCode: inspection.customerCode,
          expectedPlanCode: inspection.expectedPlanCode,
          authorizationBoundToSubscription: true,
        },
      );
      if (recorded.status !== "active") {
        await this.recordBillingEvent(userId, "renewal_recovery_manual_review", {
          reason: "active_identity_changed_during_recovery",
          subscriptionCode: candidate.subscriptionCode,
          recordedStatus: recorded.status,
        });
        return {
          outcome: "manual_review_required",
          reason: "active_identity_changed_during_recovery",
        };
      }
      return { outcome: "recovered", subscriptionCode: recorded.subscriptionCode };
    } catch {
      await this.recordBillingEvent(userId, "renewal_recovery_manual_review", {
        reason: "identity_recording_failed",
        subscriptionCode: candidate.subscriptionCode,
      });
      return { outcome: "manual_review_required", reason: "identity_recording_failed" };
    }
  }

  /**
   * Return Paystack's hosted subscription-management URL only for an already
   * trusted canonical relationship. This endpoint never creates a checkout,
   * charges an authorization, cancels a subscription, or persists the URL.
   */
  async createPaystackSubscriptionManagementLink(
    userId: number,
  ): Promise<PaystackManagementLinkResult> {
    await this.requirePaystackBillingSchema();
    if (!this.paystack || !process.env.PAYSTACK_SECRET_KEY) {
      return { outcome: "reconciling", reason: "paystack_unavailable" };
    }

    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${userId}, 36)`);
      const subscription = await this.getUserSubscription(userId);
      if (!subscription?.paystackCustomerCode) {
        return { outcome: "reconciling", reason: "missing_paystack_customer_code" };
      }
      const plan = storage.getSubscriptionPlan
        ? await storage.getSubscriptionPlan(subscription.planId)
        : null;
      if (!plan?.paystackPlanCode) {
        return { outcome: "reconciling", reason: "missing_paystack_plan_code" };
      }

      const [identity] = await tx
        .select()
        .from(paystackSubscriptionIdentities)
        .where(and(
          eq(paystackSubscriptionIdentities.userId, userId),
          eq(paystackSubscriptionIdentities.status, "active"),
        ))
        .orderBy(desc(paystackSubscriptionIdentities.providerCreatedAt), desc(paystackSubscriptionIdentities.createdAt))
        .limit(1)
        .for("update");
      if (!identity) {
        return { outcome: "manual_review_required", reason: "missing_trusted_subscription_identity" };
      }
      if (
        identity.customerCode !== subscription.paystackCustomerCode
        || identity.planCode !== plan.paystackPlanCode
      ) {
        return { outcome: "manual_review_required", reason: "local_subscription_identity_mismatch" };
      }

      let providerData: any;
      try {
        const detail = await this.paystack.subscription.get(identity.subscriptionCode);
        providerData = detail?.status ? detail.data : null;
      } catch {
        return { outcome: "reconciling", reason: "paystack_subscription_detail_unavailable" };
      }
      const evidence = extractPaystackAuthorizationEvidence(providerData, new Date(), {
        authorizationBoundToSubscription: true,
      });
      const providerStatus = String(providerData?.status ?? "").toLowerCase();
      if (
        !providerData
        || ["complete", "cancelled", "disabled", "inactive"].includes(providerStatus)
        || evidence.subscriptionCode !== identity.subscriptionCode
        || evidence.customerCode !== subscription.paystackCustomerCode
        || evidence.planCode !== plan.paystackPlanCode
      ) {
        return { outcome: "manual_review_required", reason: "provider_subscription_customer_or_plan_mismatch" };
      }

      // The local identity proves which SUB_* was previously canonical, but a
      // hosted payment-method link must not be issued while the provider shows
      // another viable subscription for the same customer and plan. Re-list
      // under the owner lock immediately before returning the link.
      let inspection: Awaited<ReturnType<BillingService["loadPaystackSubscriptionCandidates"]>>;
      try {
        inspection = await this.loadPaystackSubscriptionCandidates(userId);
      } catch {
        return { outcome: "reconciling", reason: "paystack_subscription_list_unavailable" };
      }
      if (!inspection.available) {
        return { outcome: "reconciling", reason: inspection.reason };
      }
      const canonicalCandidate = inspection.candidates.find(
        (candidate) => candidate.subscriptionCode === identity.subscriptionCode,
      );
      if (
        inspection.candidates.length !== 1
        || !canonicalCandidate
        || canonicalCandidate.providerLookupFailed
      ) {
        return {
          outcome: "manual_review_required",
          reason: "provider_subscription_relationship_ambiguous",
        };
      }

      if (hasExactPaystackRecurringRelationship(
        evidence,
        subscription.paystackCustomerCode,
        plan.paystackPlanCode,
        identity.subscriptionCode,
      )) {
        return { outcome: "automatic_renewal_active" };
      }

      let response: Response;
      try {
        response = await fetch(
          `https://api.paystack.co/subscription/${encodeURIComponent(identity.subscriptionCode)}/manage/link`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
              Accept: "application/json",
            },
          },
        );
      } catch {
        return { outcome: "reconciling", reason: "paystack_management_link_unavailable" };
      }
      if (!response.ok) {
        return { outcome: "reconciling", reason: "paystack_management_link_unavailable" };
      }
      const body = await response.json().catch(() => null);
      const url = body?.status === true ? body?.data?.link : null;
      if (!isPaystackHostedManagementLink(url)) {
        return { outcome: "reconciling", reason: "paystack_management_link_invalid" };
      }

      await tx.insert(billingEvents).values({
        userId,
        eventType: "paystack_subscription_management_link_requested",
        eventData: {
          subscriptionCode: identity.subscriptionCode,
          providerStatus,
          recurringReadiness: evidence.authorizationReusable === false ? "not_ready" : "unknown",
        },
        processed: true,
      });
      return { outcome: "ready", url };
    });
  }

  async resolvePaystackSubscriptionIdentity(
    userId: number,
    selectedSubscriptionCode: string,
    options: { confirmed: boolean; adminUserId: number },
  ): Promise<PaystackSubscriptionResolutionResult> {
    if (!options.confirmed) {
      await this.recordBillingEvent(userId, "paystack_subscription_resolution_confirmation_required", {
        adminUserId: options.adminUserId,
        selectedSubscriptionCode,
      });
      return { outcome: "confirmation_required", reason: "explicit_confirmation_required" };
    }

    const inspection = await this.loadPaystackSubscriptionCandidates(userId);
    if (!inspection.available) {
      await this.recordBillingEvent(userId, "paystack_subscription_resolution_unresolved", {
        adminUserId: options.adminUserId,
        selectedSubscriptionCode,
        reason: inspection.reason,
      });
      return { outcome: "unresolved", reason: inspection.reason };
    }

    const candidate = inspection.candidates.find(
      (entry) => entry.subscriptionCode === selectedSubscriptionCode,
    );
    if (!candidate || candidate.providerLookupFailed) {
      await this.recordBillingEvent(userId, "paystack_subscription_resolution_unresolved", {
        adminUserId: options.adminUserId,
        selectedSubscriptionCode,
        reason: candidate
          ? "selected_subscription_detail_unavailable"
          : "selected_subscription_not_a_viable_candidate",
        candidateCount: inspection.candidates.length,
      });
      return {
        outcome: "unresolved",
        reason: candidate
          ? "selected_subscription_detail_unavailable"
          : "selected_subscription_not_a_viable_candidate",
      };
    }

    const previousSubscriptionCode = inspection.activeSubscriptionCode;
    let recorded: { subscriptionCode: string; status: string };
    try {
      recorded = await this.recordPaystackSubscriptionIdentity(
        userId,
        candidate.providerData,
        {
          allowNewActive: true,
          supersedeExisting: true,
          auditSource: "support_duplicate_resolution",
          adminUserId: options.adminUserId,
          expectedCustomerCode: inspection.customerCode,
          expectedPlanCode: inspection.expectedPlanCode,
          authorizationBoundToSubscription: true,
        },
      );
    } catch {
      await this.recordBillingEvent(userId, "paystack_subscription_resolution_unresolved", {
        adminUserId: options.adminUserId,
        selectedSubscriptionCode,
        reason: "identity_recording_failed",
      });
      return { outcome: "unresolved", reason: "identity_recording_failed" };
    }
    if (recorded.status !== "active") {
      await this.recordBillingEvent(userId, "paystack_subscription_resolution_unresolved", {
        adminUserId: options.adminUserId,
        selectedSubscriptionCode,
        reason: "selected_subscription_not_activated",
        identityStatus: recorded.status,
      });
      return { outcome: "unresolved", reason: "selected_subscription_not_activated" };
    }

    await this.recordBillingEvent(userId, "paystack_subscription_identity_resolved_by_support", {
      adminUserId: options.adminUserId,
      selectedSubscriptionCode,
      previousSubscriptionCode,
      providerStatus: candidate.status,
      customerCode: inspection.customerCode,
      expectedPlanCode: inspection.expectedPlanCode,
      candidateCount: inspection.candidates.length,
      providerMutation: "none",
    });
    return {
      outcome: "resolved",
      selectedSubscriptionCode,
      previousSubscriptionCode,
      providerStatus: candidate.status,
    };
  }

  private manualPaystackIdentityRepairService(database: any) {
    return createManualPaystackIdentityRepairService({
      loadSnapshot: async (input: ManualPaystackIdentityRepairInput) => {
        const [ownerResolution, [billingOwner], [localSubscription], activeIdentities, [identityForSubscriptionCode], pendingCheckouts] = await Promise.all([
          resolveBillingOwner(input.billingOwnerUserId),
          database
            .select({ id: users.id })
            .from(users)
            .where(eq(users.id, input.billingOwnerUserId))
            .limit(1),
          database
            .select({
              id: userSubscriptions.id,
              userId: userSubscriptions.userId,
              status: userSubscriptions.status,
              paystackCustomerCode: userSubscriptions.paystackCustomerCode,
              planCode: subscriptionPlans.paystackPlanCode,
              subscriptionStartDate: userSubscriptions.subscriptionStartDate,
              nextBillingDate: userSubscriptions.nextBillingDate,
            })
            .from(userSubscriptions)
            .leftJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
            .where(eq(userSubscriptions.userId, input.billingOwnerUserId))
            .limit(1),
          database
            .select({
              userId: paystackSubscriptionIdentities.userId,
              subscriptionCode: paystackSubscriptionIdentities.subscriptionCode,
              customerCode: paystackSubscriptionIdentities.customerCode,
              planCode: paystackSubscriptionIdentities.planCode,
              status: paystackSubscriptionIdentities.status,
              recurringReadiness: paystackSubscriptionIdentities.recurringReadiness,
            })
            .from(paystackSubscriptionIdentities)
            .where(and(
              eq(paystackSubscriptionIdentities.userId, input.billingOwnerUserId),
              eq(paystackSubscriptionIdentities.status, "active"),
            )),
          database
            .select({
              userId: paystackSubscriptionIdentities.userId,
              subscriptionCode: paystackSubscriptionIdentities.subscriptionCode,
              customerCode: paystackSubscriptionIdentities.customerCode,
              planCode: paystackSubscriptionIdentities.planCode,
              status: paystackSubscriptionIdentities.status,
              recurringReadiness: paystackSubscriptionIdentities.recurringReadiness,
            })
            .from(paystackSubscriptionIdentities)
            .where(eq(paystackSubscriptionIdentities.subscriptionCode, input.subscriptionCode))
            .limit(1),
          database
            .select({ id: paystackCheckoutAttempts.id })
            .from(paystackCheckoutAttempts)
            .where(and(
              eq(paystackCheckoutAttempts.billingOwnerUserId, input.billingOwnerUserId),
              eq(paystackCheckoutAttempts.status, "pending"),
            )),
        ]);

        return {
          billingOwner: billingOwner
            ? {
                ...billingOwner,
                isCanonicalBillingOwner: ownerResolution.state === "resolved"
                  && ownerResolution.billingOwnerUserId === input.billingOwnerUserId,
              }
            : null,
          localSubscription: localSubscription ?? null,
          activeIdentities,
          identityForSubscriptionCode: identityForSubscriptionCode ?? null,
          pendingCheckoutCount: pendingCheckouts.length,
        };
      },
      runWithBillingOwnerLock: async (billingOwnerUserId, callback) => {
        // Share the existing Paystack billing-owner lock namespace so checkout,
        // webhook, renewal, and manual-repair mutations cannot invalidate one
        // another's validation snapshot mid-transaction.
        await database.execute(sql`SELECT pg_advisory_xact_lock(${billingOwnerUserId}, 36)`);
        return callback();
      },
      insertCanonicalIdentity: async (input) => {
        await database.insert(paystackSubscriptionIdentities).values({
          userId: input.billingOwnerUserId,
          subscriptionCode: input.subscriptionCode,
          customerCode: input.customerCode,
          planCode: input.planCode,
          status: "active",
          recurringReadiness: "unknown",
          authorizationCode: null,
          authorizationChannel: null,
          authorizationSignature: null,
          authorizationReusable: null,
          providerVerifiedAt: null,
          providerCreatedAt: null,
          retiredAt: null,
          updatedAt: new Date(),
        });
      },
      recordAuditEvent: async (input, adminUserId, localSubscriptionId) => {
        await database.insert(billingEvents).values({
          userId: input.billingOwnerUserId,
          eventType: "paystack_manual_identity_reconciled",
          eventData: {
            adminUserId,
            billingOwnerUserId: input.billingOwnerUserId,
            localSubscriptionId,
            subscriptionCode: input.subscriptionCode,
            customerCode: input.customerCode,
            planCode: input.planCode,
            reason: "manually_verified_provider_reconciliation",
            providerDuplicateSubscriptionCode: input.previouslyDisabledDuplicateSubscriptionCode ?? null,
            recurringReadiness: "unknown",
            providerMutation: "none",
            paystackRequest: "none",
            historicalCollection: "none",
            recordedAt: new Date().toISOString(),
          },
          processed: true,
        });
      },
    });
  }

  async previewManualPaystackIdentityRepair(input: ManualPaystackIdentityRepairInput) {
    await this.requirePaystackBillingSchema();
    return this.manualPaystackIdentityRepairService(db).preview(input);
  }

  async executeManualPaystackIdentityRepair(
    input: ManualPaystackIdentityRepairInput,
    adminUserId: number,
  ) {
    await this.requirePaystackBillingSchema();
    return db.transaction(async (tx) => (
      this.manualPaystackIdentityRepairService(tx).execute(input, adminUserId)
    ));
  }

  private manualLegacyPaystackAccountingService(database: any) {
    return createManualLegacyPaystackAccountingSettlementService({
      loadSnapshot: async (input: ManualLegacyPaystackAccountingInput) => {
        const verificationPromise = this.verifyPaystackTransaction(input.reference);
        const ownerResolutionPromise = resolveBillingOwner(input.billingOwnerUserId);
        const [billingOwnerRows, subscriptionRows, entitlementRows, identities, identityRows, existingPayments] = await Promise.all([
          database.select({ id: users.id }).from(users)
            .where(eq(users.id, input.billingOwnerUserId)).limit(1),
          database.select({
            id: userSubscriptions.id,
            userId: userSubscriptions.userId,
            planId: userSubscriptions.planId,
            status: userSubscriptions.status,
            planCode: subscriptionPlans.paystackPlanCode,
            planAmount: subscriptionPlans.price,
            planCurrency: subscriptionPlans.currency,
            paystackCustomerCode: userSubscriptions.paystackCustomerCode,
            subscriptionStartDate: userSubscriptions.subscriptionStartDate,
            nextBillingDate: userSubscriptions.nextBillingDate,
            totalPaid: userSubscriptions.totalPaid,
            lastPaymentDate: userSubscriptions.lastPaymentDate,
            paystackReference: userSubscriptions.paystackReference,
          }).from(userSubscriptions)
            .leftJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
            .where(eq(userSubscriptions.id, input.localSubscriptionId)).limit(1),
          database.select({
            subscriptionTier: users.subscriptionTier,
            expiresAt: users.subscriptionExpiresAt,
          }).from(users).where(eq(users.id, input.billingOwnerUserId)).limit(1),
          database.select({ id: paystackSubscriptionIdentities.id })
            .from(paystackSubscriptionIdentities).where(and(
              eq(paystackSubscriptionIdentities.userId, input.billingOwnerUserId),
              eq(paystackSubscriptionIdentities.status, "active"),
            )),
          database.select({
            id: paystackSubscriptionIdentities.id,
            userId: paystackSubscriptionIdentities.userId,
            subscriptionCode: paystackSubscriptionIdentities.subscriptionCode,
            customerCode: paystackSubscriptionIdentities.customerCode,
            planCode: paystackSubscriptionIdentities.planCode,
            status: paystackSubscriptionIdentities.status,
          }).from(paystackSubscriptionIdentities)
            .where(eq(paystackSubscriptionIdentities.id, input.identityId)).limit(1),
          database.select({
            userId: paymentTransactions.userId,
            subscriptionId: paymentTransactions.subscriptionId,
            reference: paymentTransactions.platformTransactionId,
            providerTransactionId: paymentTransactions.providerTransactionId,
          }).from(paymentTransactions).where(and(
            eq(paymentTransactions.platform, "paystack"),
            eq(paymentTransactions.platformTransactionId, input.reference),
          )).limit(1),
        ]);

        const billingOwner = billingOwnerRows[0] ?? null;
        const localSubscription = subscriptionRows[0] ?? null;
        const providerInspectionSubscription = localSubscription ? {
          planId: localSubscription.planId,
          paystackCustomerCode: localSubscription.paystackCustomerCode,
          nextBillingDate: localSubscription.nextBillingDate,
        } : undefined;
        const [verification, providerInspection, ownerResolution] = await Promise.all([
          verificationPromise,
          this.loadPaystackSubscriptionCandidates(input.billingOwnerUserId, providerInspectionSubscription),
          ownerResolutionPromise,
        ]);
        const entitlement = entitlementRows[0] ?? { subscriptionTier: null, expiresAt: null };
        const identity = identityRows[0] ?? null;
        const transaction = verification.valid ? verification.subscription : null;
        const providerCandidate = providerInspection.available
          ? providerInspection.candidates.find((candidate) => candidate.subscriptionCode === input.subscriptionCode) ?? null
          : null;
        const iso = (value: unknown) => {
          const parsed = parsePaystackDate(value);
          return parsed?.toISOString() ?? null;
        };

        return {
          billingOwner: billingOwner ? {
            id: billingOwner.id,
            isCanonicalBillingOwner: ownerResolution.state === "resolved"
              && ownerResolution.billingOwnerUserId === input.billingOwnerUserId,
          } : null,
          localSubscription: localSubscription ? {
            ...localSubscription,
            planAmount: localSubscription.planAmount ?? 0,
            planCurrency: localSubscription.planCurrency ?? "",
            totalPaid: localSubscription.totalPaid ?? 0,
            subscriptionStartDate: localSubscription.subscriptionStartDate?.toISOString() ?? null,
            nextBillingDate: localSubscription.nextBillingDate?.toISOString() ?? null,
            lastPaymentDate: localSubscription.lastPaymentDate?.toISOString() ?? null,
          } : null,
          entitlement: {
            subscriptionTier: entitlement.subscriptionTier,
            expiresAt: entitlement.expiresAt?.toISOString() ?? null,
          },
          identity,
          activeIdentityCount: identities.length,
          providerPayment: transaction ? {
            valid: true,
            status: String(transaction.status ?? "").toLowerCase(),
            reference: String(transaction.reference ?? ""),
            providerTransactionId: transaction.id === undefined || transaction.id === null
              ? null : String(transaction.id),
            customerCode: extractPaystackCustomerCode(transaction),
            subscriptionCode: extractPaystackSubscriptionCode(transaction),
            planCode: extractPaystackPlanCode(transaction),
            amount: Number(transaction.amount),
            currency: String(transaction.currency ?? ""),
            paidAt: iso(transaction.paid_at ?? transaction.paidAt ?? transaction.created_at) ?? "",
          } : null,
          providerSubscription: providerCandidate ? {
            valid: !providerCandidate.providerLookupFailed,
            subscriptionCode: providerCandidate.subscriptionCode,
            customerCode: providerCandidate.customerCode,
            planCode: providerCandidate.planCode,
            status: providerCandidate.status,
          } : null,
          existingPayment: existingPayments[0] ? {
            ...existingPayments[0],
            subscriptionId: existingPayments[0].subscriptionId ?? 0,
            reference: existingPayments[0].reference ?? "",
            auditEventType: null,
          } : null,
        };
      },
      runAtomicallyWithBillingOwnerLock36: async (billingOwnerUserId, callback) => {
        await database.execute(sql`SELECT pg_advisory_xact_lock(${billingOwnerUserId}, 36)`);
        return callback();
      },
      claimReferenceAndInsertPayment: async (input, assessment) => {
        const inserted = await database.insert(paymentTransactions).values({
          userId: input.billingOwnerUserId,
          subscriptionId: input.localSubscriptionId,
          amount: assessment.providerPayment.amount,
          currency: assessment.providerPayment.currency,
          status: "completed",
          platform: "paystack",
          paymentMethod: "legacy_manual_accounting",
          platformTransactionId: input.reference,
          platformSubscriptionId: input.subscriptionCode,
          providerTransactionId: assessment.providerPayment.providerTransactionId,
          providerVerifiedAt: new Date(),
          recurringReadiness: "ready",
          metadata: {
            settlementType: MANUAL_ACCOUNTING_SETTLEMENT_EVENT,
            identityId: input.identityId,
            subscriptionCode: input.subscriptionCode,
            customerCode: input.customerCode,
            planCode: input.planCode,
            entitlementChange: "none",
            providerMutation: "none",
          },
          description: "Legacy Paystack renewal recorded without adjudicating entitlement",
        }).onConflictDoNothing().returning({ id: paymentTransactions.id });
        if (inserted.length === 1) return "claimed" as const;
        const [existing] = await database.select({
          userId: paymentTransactions.userId,
          subscriptionId: paymentTransactions.subscriptionId,
        }).from(paymentTransactions).where(and(
          eq(paymentTransactions.platform, "paystack"),
          eq(paymentTransactions.platformTransactionId, input.reference),
        )).limit(1);
        return existing?.userId === input.billingOwnerUserId
          && existing.subscriptionId === input.localSubscriptionId
          ? "already_applied" as const
          : "conflict" as const;
      },
      applyFinancialAccounting: async (input, assessment) => {
        const values: Record<string, unknown> = {
          totalPaid: sql`COALESCE(${userSubscriptions.totalPaid}, 0) + ${assessment.providerPayment.amount}`,
        };
        if (assessment.preview.financialChanges.lastPaymentDate.willChange) {
          values.lastPaymentDate = new Date(assessment.providerPayment.paidAt);
          values.paystackReference = input.reference;
        }
        await database.update(userSubscriptions).set(values)
          .where(and(
            eq(userSubscriptions.id, input.localSubscriptionId),
            eq(userSubscriptions.userId, input.billingOwnerUserId),
          ));
      },
      recordAuditEvent: async (event) => {
        await database.insert(billingEvents).values({
          userId: event.billingOwnerUserId,
          eventType: event.eventType,
          eventData: event,
          processed: true,
        });
      },
    });
  }

  async previewManualLegacyPaystackAccountingSettlement(input: ManualLegacyPaystackAccountingInput) {
    await this.requirePaystackBillingSchema();
    return this.manualLegacyPaystackAccountingService(db).preview(input);
  }

  async executeManualLegacyPaystackAccountingSettlement(
    input: ManualLegacyPaystackAccountingInput,
    adminUserId: number,
    confirmation: { confirmed: boolean; previewFingerprint: string },
  ) {
    await this.requirePaystackBillingSchema();
    return db.transaction(async (tx) => (
      this.manualLegacyPaystackAccountingService(tx).execute(input, adminUserId, confirmation)
    ));
  }

  /**
   * Persist a SUB_* identity without allowing a delayed old subscription.create
   * event to replace a newer active identity.
   */
  private async recordPaystackSubscriptionIdentityInTransaction(
    tx: any,
    userId: number,
    data: any,
    options: {
      supersedeExisting?: boolean;
      allowNewActive?: boolean;
      preserveExistingActive?: boolean;
      rejectExistingActive?: boolean;
      auditSource?: string;
      adminUserId?: number;
      expectedCustomerCode?: string | null;
      expectedPlanCode?: string | null;
      authorizationBoundToSubscription?: boolean;
    } = {},
  ): Promise<{ subscriptionCode: string; status: string }> {
    const subscriptionCode = extractPaystackSubscriptionCode(data);
    if (!subscriptionCode) {
      throw new Error("Paystack subscription identity is missing a SUB_* code");
    }

    const customerCode = extractPaystackCustomerCode(data);
    const planCode = typeof data?.plan === "string"
      ? data.plan
      : data?.plan?.plan_code
        ?? data?.plan_code
        ?? data?.subscription?.plan?.plan_code
        ?? data?.subscription?.plan_code
        ?? null;
    const providerCreatedAt = parsePaystackDate(
      data?.created_at ?? data?.createdAt ?? data?.created,
    );
    const now = new Date();
    const providerEvidence = extractPaystackAuthorizationEvidence(data, now, {
      authorizationBoundToSubscription: options.authorizationBoundToSubscription,
    });
    const recurringReadiness = hasExactPaystackRecurringRelationship(
      providerEvidence,
      options.expectedCustomerCode,
      options.expectedPlanCode,
      subscriptionCode,
    )
      ? "ready"
      : providerEvidence.authorizationReusable === false
        ? "not_ready"
        : "unknown";

    const [existingCode] = await tx
      .select()
      .from(paystackSubscriptionIdentities)
      .where(eq(paystackSubscriptionIdentities.subscriptionCode, subscriptionCode))
      .limit(1);

    if (existingCode && existingCode.userId !== userId) {
      throw new Error(`Paystack subscription ${subscriptionCode} is already owned by another user`);
    }

    const [activeIdentity] = await tx
      .select()
      .from(paystackSubscriptionIdentities)
      .where(and(
        eq(paystackSubscriptionIdentities.userId, userId),
        eq(paystackSubscriptionIdentities.status, "active"),
      ))
      .orderBy(desc(paystackSubscriptionIdentities.providerCreatedAt), desc(paystackSubscriptionIdentities.createdAt))
      .limit(1);

    if (
      options.rejectExistingActive
      && activeIdentity
      && activeIdentity.subscriptionCode !== subscriptionCode
    ) {
      // Legacy recovery validated the absence of a trusted identity before it
      // acquired the user lock. Re-checking inside this transaction prevents a
      // concurrently delivered, different SUB_* from retiring that identity.
      throw new Error("Paystack identity recovery found a competing active subscription");
    }

    let identityStatus = existingCode?.status
      ?? (options.allowNewActive ? "active" : "unresolved");
    if (activeIdentity && activeIdentity.subscriptionCode !== subscriptionCode) {
      const existingProviderTime = activeIdentity.providerCreatedAt?.getTime();
      const incomingProviderTime = providerCreatedAt?.getTime();

      if (options.preserveExistingActive) {
        // An identity found by background recovery must never replace an
        // identity that appeared while its provider reads were in flight.
        identityStatus = "unresolved";
      } else if (options.supersedeExisting) {
        await tx
          .update(paystackSubscriptionIdentities)
          .set({ status: "retired", retiredAt: now, updatedAt: now })
          .where(eq(paystackSubscriptionIdentities.id, activeIdentity.id));
        identityStatus = "active";
      } else if (!options.allowNewActive) {
        identityStatus = "unresolved";
      } else if (existingProviderTime && incomingProviderTime && incomingProviderTime > existingProviderTime) {
        await tx
          .update(paystackSubscriptionIdentities)
          .set({ status: "retired", retiredAt: now, updatedAt: now })
          .where(eq(paystackSubscriptionIdentities.id, activeIdentity.id));
      } else if (existingProviderTime && incomingProviderTime && incomingProviderTime <= existingProviderTime) {
        identityStatus = "retired";
      } else {
        // Without provider timestamps, replacing an existing active identity
        // could let a delayed stale event own the account.
        identityStatus = "unresolved";
      }
    } else if (options.allowNewActive) {
      identityStatus = "active";
    }

    const [identity] = await tx
      .insert(paystackSubscriptionIdentities)
      .values({
        userId,
        subscriptionCode,
        customerCode,
        planCode,
        status: identityStatus,
        recurringReadiness,
        authorizationCode: providerEvidence.authorizationCode,
        authorizationChannel: providerEvidence.authorizationChannel,
        authorizationSignature: providerEvidence.authorizationSignature,
        authorizationReusable: providerEvidence.authorizationReusable,
        providerVerifiedAt: providerEvidence.providerVerifiedAt,
        providerCreatedAt,
        retiredAt: identityStatus === "retired" ? now : null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: paystackSubscriptionIdentities.subscriptionCode,
        set: {
          customerCode,
          planCode,
          status: identityStatus,
          recurringReadiness: recurringReadiness === "unknown"
            ? existingCode?.recurringReadiness ?? "unknown"
            : recurringReadiness,
          authorizationCode: providerEvidence.authorizationCode ?? existingCode?.authorizationCode ?? null,
          authorizationChannel: providerEvidence.authorizationChannel ?? existingCode?.authorizationChannel ?? null,
          authorizationSignature: providerEvidence.authorizationSignature ?? existingCode?.authorizationSignature ?? null,
          authorizationReusable: providerEvidence.authorizationReusable ?? existingCode?.authorizationReusable ?? null,
          providerVerifiedAt: providerEvidence.providerVerifiedAt ?? existingCode?.providerVerifiedAt ?? null,
          providerCreatedAt: providerCreatedAt ?? existingCode?.providerCreatedAt ?? null,
          retiredAt: identityStatus === "retired" ? now : null,
          updatedAt: now,
        },
      })
      .returning();

    await tx.insert(billingEvents).values({
      userId,
      eventType: "paystack_subscription_identified",
      eventData: {
        subscriptionCode,
        customerCode,
        planCode,
        status: identity?.status ?? identityStatus,
        recurringReadiness: identity?.recurringReadiness ?? recurringReadiness,
        source: options.auditSource ?? "provider",
        adminUserId: options.adminUserId ?? null,
      },
      processed: true,
    });

    return {
      subscriptionCode,
      status: identity?.status ?? identityStatus,
    };
  }

  async recordPaystackSubscriptionIdentity(
    userId: number,
    data: any,
    options: {
      allowNewActive?: boolean;
      supersedeExisting?: boolean;
      preserveExistingActive?: boolean;
      rejectExistingActive?: boolean;
      auditSource?: string;
      adminUserId?: number;
      expectedCustomerCode?: string | null;
      expectedPlanCode?: string | null;
      authorizationBoundToSubscription?: boolean;
    } = {},
  ): Promise<{ subscriptionCode: string; status: string }> {
    await this.requirePaystackBillingSchema();
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${userId}, 36)`);
      return this.recordPaystackSubscriptionIdentityInTransaction(tx, userId, data, options);
    });
  }

  async getPaystackSubscriptionIdentityByCode(subscriptionCode: string) {
    await this.requirePaystackBillingSchema();
    const [identity] = await db
      .select()
      .from(paystackSubscriptionIdentities)
      .where(eq(paystackSubscriptionIdentities.subscriptionCode, subscriptionCode))
      .limit(1);
    return identity ?? null;
  }

  /**
   * Validate the customer-facing identifiers carried by a signed webhook before
   * treating its SUB_* identity as authoritative. A matching subscription code
   * cannot override a conflicting metadata user or customer email.
   */
  async validatePaystackWebhookOwner(
    userId: number,
    webhookData: any,
  ): Promise<{ valid: boolean; reason: string }> {
    const user = await storage.getUser(userId);
    if (!user) {
      return { valid: false, reason: "identity_owner_missing" };
    }
    const existingSubscription = await this.getUserSubscription(userId);
    return checkPaystackTransactionOwnership(webhookData, {
      userId,
      email: user.email,
      customerCode: existingSubscription?.paystackCustomerCode ?? null,
    });
  }

  private async assertPaystackTransactionOwnership(userId: number, transactionData: any): Promise<void> {
    const user = await storage.getUser(userId);
    if (!user) throw new Error("User not found for Paystack transaction");

    const existingSubscription = await this.getUserSubscription(userId);
    const ownership = checkPaystackTransactionOwnership(transactionData, {
      userId,
      email: user.email,
      customerCode: existingSubscription?.paystackCustomerCode,
    });
    if (!ownership.valid) {
      throw new Error(`Could not prove Paystack transaction ownership: ${ownership.reason}`);
    }
  }

  /**
   * Verify Paystack transaction
   */
  async verifyPaystackTransaction(reference: string): Promise<PaystackVerificationResponse> {
    await this.requirePaystackBillingSchema();
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
   * Create or reuse a server-owned checkout reference. Advisory locking and the
   * partial unique index independently enforce one pending attempt per owner.
   */
  async createOrReusePaystackCheckoutAttempt(input: {
    billingOwnerUserId: number;
    requestedByUserId: number;
    planId: number;
    amount: number;
    currency: string;
    paystackPlanCode: string;
    customerEmail: string;
    allowRenewalSetupRecovery?: boolean;
  }): Promise<PaystackCheckoutAttemptResult> {
    await this.requirePaystackBillingSchema();
    return db.transaction(async (tx) => {
      // Lock 36 is shared with every Paystack entitlement mutation. Taking it
      // before the attempt lock prevents checkout creation from racing a renewal.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${input.billingOwnerUserId}, 36)`);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${input.billingOwnerUserId}, 41)`);

      const [existingSubscription] = await tx
        .select()
        .from(userSubscriptions)
        .where(eq(userSubscriptions.userId, input.billingOwnerUserId))
        .limit(1);

      const now = new Date();
      if (existingSubscription?.status === "active") {
        const renewalIsDue = !!existingSubscription.nextBillingDate
          && new Date(existingSubscription.nextBillingDate).getTime() <= now.getTime();
        const recoveryIsEligible = input.allowRenewalSetupRecovery
          && renewalIsDue
          && !existingSubscription.cancelledAt;

        if (!recoveryIsEligible) {
          return {
            outcome: "checkout_blocked",
            reason: "active_paid_subscription",
            subscription: existingSubscription,
          };
        }
        if (existingSubscription.planId !== input.planId) {
          return {
            outcome: "checkout_blocked",
            reason: "renewal_recovery_plan_mismatch",
            subscription: existingSubscription,
          };
        }

        // Re-read the trusted identity under the shared entitlement lock so an
        // identity recovered by another request can never race into a second
        // checkout.
        const [activeIdentity] = await tx
          .select()
          .from(paystackSubscriptionIdentities)
          .where(and(
            eq(paystackSubscriptionIdentities.userId, input.billingOwnerUserId),
            eq(paystackSubscriptionIdentities.status, "active"),
          ))
          .orderBy(desc(paystackSubscriptionIdentities.providerCreatedAt), desc(paystackSubscriptionIdentities.createdAt))
          .limit(1);
        if (activeIdentity) {
          return {
            outcome: "checkout_blocked",
            reason: "renewal_relationship_available",
            subscription: existingSubscription,
          };
        }

        // The route performs a first provider inspection to drive customer
        // messaging. Repeat it only after lock 36 is held and immediately
        // before minting a recovery reference. A failed or incomplete read is
        // never treated as proof that no provider relationship exists.
        let lockedInspection: Awaited<ReturnType<BillingService["loadPaystackSubscriptionCandidates"]>>;
        try {
          lockedInspection = await this.loadPaystackSubscriptionCandidates(input.billingOwnerUserId);
        } catch {
          return {
            outcome: "checkout_blocked",
            reason: "renewal_recovery_required",
            subscription: existingSubscription,
          };
        }
        if (
          !lockedInspection.available
          || lockedInspection.providerSubscriptionCount !== 0
          || lockedInspection.candidates.length !== 0
        ) {
          return {
            outcome: "checkout_blocked",
            reason: lockedInspection.available && lockedInspection.candidates.length > 0
              ? "renewal_relationship_available"
              : "renewal_recovery_required",
            subscription: existingSubscription,
          };
        }
      }
      if (
        existingSubscription?.status === "cancelled"
        && existingSubscription.nextBillingDate
        && new Date(existingSubscription.nextBillingDate).getTime() > now.getTime()
      ) {
        return {
          outcome: "checkout_blocked",
          reason: "paid_grace_period",
          subscription: existingSubscription,
        };
      }
      if (existingSubscription && ["paused", "payment_failed", "past_due"].includes(existingSubscription.status)) {
        // A provider retry may still settle an existing Paystack subscription.
        // Under the no-automatic-cancellation constraint, opening a second
        // generic checkout would create an unavoidable double-charge window.
        return {
          outcome: "checkout_blocked",
          reason: "renewal_recovery_required",
          subscription: existingSubscription,
        };
      }

      const [existingAttempt] = await tx
        .select()
        .from(paystackCheckoutAttempts)
        .where(
          and(
            eq(paystackCheckoutAttempts.billingOwnerUserId, input.billingOwnerUserId),
            eq(paystackCheckoutAttempts.status, "pending"),
          ),
        )
        .orderBy(desc(paystackCheckoutAttempts.createdAt))
        .limit(1);
      if (existingAttempt) {
        log(`Reusing Paystack checkout attempt ${existingAttempt.id} for billing owner ${input.billingOwnerUserId}`, "billing");
        return { outcome: "reused", attempt: existingAttempt };
      }

      const paystackReference = `ss_srv_${input.billingOwnerUserId}_${crypto.randomBytes(12).toString("hex")}`;
      const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
      const [createdAttempt] = await tx
        .insert(paystackCheckoutAttempts)
        .values({
          billingOwnerUserId: input.billingOwnerUserId,
          requestedByUserId: input.requestedByUserId,
          planId: input.planId,
          amount: input.amount,
          currency: input.currency.toUpperCase(),
          paystackPlanCode: input.paystackPlanCode,
          customerEmail: input.customerEmail.trim().toLowerCase(),
          paystackReference,
          status: "pending",
          expiresAt,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning();

      if (!createdAttempt) {
        const [contendedAttempt] = await tx
          .select()
          .from(paystackCheckoutAttempts)
          .where(
            and(
              eq(paystackCheckoutAttempts.billingOwnerUserId, input.billingOwnerUserId),
              eq(paystackCheckoutAttempts.status, "pending"),
            ),
          )
          .orderBy(desc(paystackCheckoutAttempts.createdAt))
          .limit(1);
        if (contendedAttempt) {
          log(`Reused contended Paystack checkout attempt ${contendedAttempt.id} for billing owner ${input.billingOwnerUserId}`, "billing");
          return { outcome: "reused", attempt: contendedAttempt };
        }
        throw new Error("Could not create or reuse a pending Paystack checkout attempt");
      }

      log(`Created Paystack checkout attempt ${createdAttempt.id} for billing owner ${input.billingOwnerUserId}`, "billing");
      return { outcome: "created", attempt: createdAttempt };
    });
  }

  async getPaystackCheckoutAttempt(reference: string): Promise<PaystackCheckoutAttempt | null> {
    await this.requirePaystackBillingSchema();
    const [attempt] = await db
      .select()
      .from(paystackCheckoutAttempts)
      .where(eq(paystackCheckoutAttempts.paystackReference, reference))
      .limit(1);
    return attempt ?? null;
  }

  async refreshPaystackCheckoutAttemptAfterVerification(
    reference: string,
  ): Promise<PaystackCheckoutAttempt | null> {
    await this.requirePaystackBillingSchema();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
    const [refreshed] = await db
      .update(paystackCheckoutAttempts)
      .set({ status: "pending", expiresAt, updatedAt: now })
      .where(
        and(
          eq(paystackCheckoutAttempts.paystackReference, reference),
          eq(paystackCheckoutAttempts.status, "pending"),
          sql`${paystackCheckoutAttempts.expiresAt} <= ${now}`,
        ),
      )
      .returning();
    if (refreshed) {
      log(`Refreshed verified-unpaid Paystack checkout attempt ${refreshed.id} without rotating its reference`, "billing");
    }
    return refreshed ?? null;
  }

  /**
   * Initialize a Paystack transaction server-side via POST /transaction/initialize.
   * Includes channels: ["card"] when the Apple Pay gate is closed (default),
   * which Paystack binds to the returned access_code — the browser cannot override it.
   * Returns the access_code to be stored and sent to the client.
   */
  async initializePaystackTransaction(params: {
    reference: string;
    amount: number;
    email: string;
    paystackPlanCode: string;
    currency: string;
    billingOwnerUserId: number;
    attemptId: number;
    planId: number;
    planName: string;
  }): Promise<string> {
    if (!this.paystack) {
      throw new Error(
        "Paystack not initialized — PAYSTACK_SECRET_KEY is not configured",
      );
    }
    const applePayEnabled = isPaystackApplePaySubscriptionsEnabled();
    const body: Record<string, unknown> = {
      reference: params.reference,
      amount: params.amount,
      email: params.email,
      plan: params.paystackPlanCode,
      currency: params.currency,
      metadata: {
        user_id: params.billingOwnerUserId,
        plan_id: params.planId,
        plan_name: params.planName,
        checkout_attempt_id: params.attemptId,
        subscription_type: "recurring",
      },
    };
    if (!applePayEnabled) {
      // Bind card-only to this transaction on Paystack's server.
      // The client receives only the access_code and cannot change channels.
      body.channels = ["card"];
    }
    const response = await this.paystack.transaction.initialize(body);
    const accessCode = response?.data?.access_code;
    if (!accessCode || typeof accessCode !== "string") {
      throw new Error(
        `Paystack transaction/initialize did not return an access_code for reference ${params.reference}`,
      );
    }
    log(
      `Paystack transaction initialized for reference ${params.reference} — channels=${applePayEnabled ? "all" : "card-only"}`,
      "billing",
    );
    return accessCode;
  }

  /**
   * Persist the Paystack access_code returned by transaction/initialize.
   * Uses a conditional update (only when paystack_access_code IS NULL) so
   * concurrent requests that both call initialize cannot overwrite each other.
   */
  async storePaystackAccessCode(
    reference: string,
    accessCode: string,
  ): Promise<void> {
    const now = new Date();
    await db
      .update(paystackCheckoutAttempts)
      .set({ paystackAccessCode: accessCode, updatedAt: now })
      .where(
        and(
          eq(paystackCheckoutAttempts.paystackReference, reference),
          eq(paystackCheckoutAttempts.status, "pending"),
          isNull(paystackCheckoutAttempts.paystackAccessCode),
        ),
      );
  }

  /**
   * Ensures exactly one Paystack transaction/initialize call is made per
   * checkout reference, across concurrent requests AND across server instances.
   *
   * Two-layer locking:
   *
   * 1. In-process promise map (initializationMutex):
   *    Within a single server instance, concurrent requests for the same
   *    reference share one initialization promise. The second+ caller awaits
   *    the first caller's promise and receives the same canonical code.
   *
   * 2. DB-backed sentinel claim (PAYSTACK_INIT_CLAIM:<ts> in paystack_access_code):
   *    Across server instances (multiple replicas, rolling restarts), an atomic
   *    conditional UPDATE wins the right to call Paystack. Non-winning processes
   *    poll until the real code appears or an expired claim is reclaimed.
   *
   * Abandoned-claim recovery:
   *    A claim sentinel older than CLAIM_TIMEOUT_MS is treated as abandoned
   *    (claimer crashed). The next caller overwrites it and calls Paystack.
   *
   * Fast path:
   *    existingAccessCode already set and is not a sentinel → return immediately.
   */
  async ensurePaystackAccessCode(params: {
    attemptId: number;
    reference: string;
    existingAccessCode: string | null;
    amount: number;
    email: string;
    paystackPlanCode: string;
    currency: string;
    billingOwnerUserId: number;
    planId: number;
    planName: string;
  }): Promise<string> {
    // Fast path: real code already stored — skip all I/O and locking.
    const existing = params.existingAccessCode;
    if (existing && !existing.startsWith(BillingService.INIT_CLAIM_PREFIX)) {
      return existing;
    }

    const { reference } = params;

    // Layer 1: in-process mutex. Share the in-flight promise within this instance
    // so multiple concurrent requests don't each attempt a DB claim.
    const inflight = this.initializationMutex.get(reference);
    if (inflight) return inflight;

    // Register the promise BEFORE the first await so that requests arriving
    // mid-initialization find it in the map immediately.
    const promise = (async (): Promise<string> => {
      // Layer 2: DB-backed sentinel claim. Atomically write an INIT_CLAIM_PREFIX
      // sentinel into paystack_access_code while the slot is NULL or an expired
      // previous sentinel is there. Only the winner calls Paystack.
      const claimValue = `${BillingService.INIT_CLAIM_PREFIX}:${Date.now()}`;
      const claimed = await this._tryClaimPaystackInit(reference, claimValue);

      if (!claimed) {
        // Another process/instance holds the claim. Poll until it finalizes.
        return this._pollForPaystackAccessCode(reference);
      }

      // This process holds the DB claim. Keep it alive with a periodic heartbeat
      // so a live holder cannot be preempted during a slow Paystack API call.
      // A crashed holder stops refreshing; its claim expires after CLAIM_TIMEOUT_MS.
      const heartbeat = setInterval(
        () => this._refreshPaystackInitClaim(reference, claimValue).catch(() => {}),
        BillingService.CLAIM_HEARTBEAT_INTERVAL_MS,
      );

      let code: string;
      try {
        code = await this.initializePaystackTransaction({
          reference: params.reference,
          amount: params.amount,
          email: params.email,
          paystackPlanCode: params.paystackPlanCode,
          currency: params.currency,
          billingOwnerUserId: params.billingOwnerUserId,
          attemptId: params.attemptId,
          planId: params.planId,
          planName: params.planName,
        });
      } catch (initErr: any) {
        clearInterval(heartbeat);
        await this._releasePaystackInitClaim(reference, claimValue).catch(() => {});
        // A "Duplicate Transaction Reference" error means a previous holder
        // already called Paystack but crashed before persisting the access_code.
        // The reference is now bound to an existing Paystack transaction whose
        // access_code cannot be retrieved. Fail closed with a clear message;
        // the checkout attempt must expire before a new one can start.
        if (this._isPaystackDuplicateReferenceError(initErr)) {
          throw new Error(
            `Paystack reference ${params.reference} was already initialized by a ` +
            `previous server instance but the access_code was not persisted. ` +
            `Wait for this checkout attempt to expire (up to 30 min) before retrying.`,
          );
        }
        throw initErr;
      }
      clearInterval(heartbeat);

      // Overwrite the sentinel with the real code. _finalizePaystackAccessCode
      // returns the canonical stored code: our own code if the sentinel was still
      // ours, or the DB value if (unexpectedly) another process replaced it.
      return this._finalizePaystackAccessCode(reference, claimValue, code);
    })().finally(() => {
      this.initializationMutex.delete(reference);
    });

    this.initializationMutex.set(reference, promise);
    return promise;
  }

  /**
   * Atomically claims the initialization slot for a checkout reference.
   * Writes claimValue into paystack_access_code when either:
   *   - the column is NULL (fresh attempt), or
   *   - it holds an expired sentinel (abandoned claim older than CLAIM_TIMEOUT_MS).
   * Returns true if this caller won the claim, false if another process holds it.
   */
  async _tryClaimPaystackInit(reference: string, claimValue: string): Promise<boolean> {
    const now = new Date();
    const timeoutThreshold = new Date(now.getTime() - BillingService.CLAIM_TIMEOUT_MS);
    const [result] = await db
      .update(paystackCheckoutAttempts)
      .set({ paystackAccessCode: claimValue, updatedAt: now })
      .where(
        and(
          eq(paystackCheckoutAttempts.paystackReference, reference),
          eq(paystackCheckoutAttempts.status, "pending"),
          or(
            isNull(paystackCheckoutAttempts.paystackAccessCode),
            and(
              like(paystackCheckoutAttempts.paystackAccessCode, `${BillingService.INIT_CLAIM_PREFIX}:%`),
              lte(paystackCheckoutAttempts.updatedAt, timeoutThreshold),
            ),
          ),
        ),
      )
      .returning({ id: paystackCheckoutAttempts.id });
    return !!result;
  }

  /**
   * Overwrites the claim sentinel with the real Paystack access_code.
   * Uses RETURNING so only the claiming process can finalize.
   *
   * Returns the canonical code that callers should use:
   * - Our code when the sentinel was still ours (normal path).
   * - The DB value when the sentinel was unexpectedly replaced (defensive path;
   *   should not occur with the heartbeat but handled for correctness).
   */
  async _finalizePaystackAccessCode(
    reference: string,
    claimValue: string,
    code: string,
  ): Promise<string> {
    const [finalized] = await db
      .update(paystackCheckoutAttempts)
      .set({ paystackAccessCode: code, updatedAt: new Date() })
      .where(
        and(
          eq(paystackCheckoutAttempts.paystackReference, reference),
          eq(paystackCheckoutAttempts.paystackAccessCode, claimValue),
        ),
      )
      .returning({ paystackAccessCode: paystackCheckoutAttempts.paystackAccessCode });

    if (finalized?.paystackAccessCode) return finalized.paystackAccessCode;

    // RETURNING returned nothing: the sentinel was replaced by another process.
    // Re-read the DB to return whatever canonical code is now stored.
    log(
      `Paystack finalize affected 0 rows for reference ${reference} — re-reading canonical code`,
      "billing",
    );
    const fresh = await this.getPaystackCheckoutAttempt(reference);
    const canonical = fresh?.paystackAccessCode;
    if (canonical && !canonical.startsWith(BillingService.INIT_CLAIM_PREFIX)) {
      return canonical;
    }
    // No canonical code found — return the local Paystack response as a best-effort.
    log(
      `Paystack finalize: no canonical code found in DB for ${reference}, using local response`,
      "billing",
    );
    return code;
  }

  /**
   * Refreshes updated_at for an active claim sentinel to prove the holder is
   * still alive. Called on a heartbeat interval so the claim cannot be preempted
   * by another instance while the Paystack call is in-flight.
   */
  async _refreshPaystackInitClaim(reference: string, claimValue: string): Promise<void> {
    await db
      .update(paystackCheckoutAttempts)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(paystackCheckoutAttempts.paystackReference, reference),
          eq(paystackCheckoutAttempts.paystackAccessCode, claimValue),
        ),
      );
  }

  /**
   * Returns true when a Paystack API error indicates the reference was already
   * initialized by a previous transaction/initialize call. Used to detect the
   * crash-between-initialize-and-store scenario.
   */
  private _isPaystackDuplicateReferenceError(error: any): boolean {
    const msg = String(error?.message ?? "").toLowerCase();
    return (
      msg.includes("duplicate transaction reference") ||
      msg.includes("duplicate reference") ||
      msg.includes("transaction reference already used")
    );
  }

  /**
   * Releases an active claim sentinel on failure, resetting the column to NULL
   * so the next caller can claim and retry. Only affects the row if the sentinel
   * still matches (prevents races if another process preempted the claim).
   */
  async _releasePaystackInitClaim(reference: string, claimValue: string): Promise<void> {
    await db
      .update(paystackCheckoutAttempts)
      .set({ paystackAccessCode: null, updatedAt: new Date() })
      .where(
        and(
          eq(paystackCheckoutAttempts.paystackReference, reference),
          eq(paystackCheckoutAttempts.paystackAccessCode, claimValue),
        ),
      );
  }

  /**
   * Polls the DB until a real (non-sentinel) access_code appears or timeout.
   * Called by processes that lost the claim race.
   */
  async _pollForPaystackAccessCode(reference: string): Promise<string> {
    const deadline = Date.now() + BillingService.POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, BillingService.POLL_INTERVAL_MS));
      const fresh = await this.getPaystackCheckoutAttempt(reference);
      const code = fresh?.paystackAccessCode;
      if (code && !code.startsWith(BillingService.INIT_CLAIM_PREFIX)) {
        log(
          `Paystack access_code available for reference ${reference} after claim wait`,
          "billing",
        );
        return code;
      }
    }
    throw new Error(
      `Timed out waiting for Paystack access_code for reference ${reference}`,
    );
  }

  private async cancelOtherPendingCheckoutAttempts(
    tx: any,
    userId: number,
    successfulReference: string,
    now: Date,
  ): Promise<void> {
    await tx
      .update(paystackCheckoutAttempts)
      .set({ status: "cancelled", updatedAt: now })
      .where(
        and(
          eq(paystackCheckoutAttempts.billingOwnerUserId, userId),
          inArray(paystackCheckoutAttempts.status, ["pending", "expired"]),
          ne(paystackCheckoutAttempts.paystackReference, successfulReference),
        ),
      );
  }

  /**
   * Process Paystack subscription payment
   * ATOMIC: All database writes wrapped in a single transaction with rollback on failure
   */
  async processPaystackSubscription(
    userId: number,
    transactionReference: string,
    context: PaystackProcessingContext = {},
  ): Promise<UserSubscription> {
    await this.requirePaystackBillingSchema();
    log(`Processing Paystack subscription for user ${userId}, reference: ${transactionReference}`, 'billing');

    // This first read determines the path only. A tracked attempt is re-read and
    // row-locked after provider verification, inside lock 36, before mutation.
    const checkoutAttempt = await this.getPaystackCheckoutAttempt(transactionReference);
    if (checkoutAttempt?.billingOwnerUserId !== undefined && checkoutAttempt.billingOwnerUserId !== userId) {
      throw new Error("Checkout attempt belongs to a different billing owner");
    }
    const checkoutPlan = checkoutAttempt
      ? await storage.getSubscriptionPlan?.(checkoutAttempt.planId)
      : null;

    // External provider verification intentionally happens before opening the
    // database transaction. No attempt state read before this call authorizes
    // settlement; current state is checked again under the entitlement lock.
    const verification = await this.verifyPaystackTransaction(transactionReference);
    
    if (!verification.valid) {
      throw new Error(`Payment verification failed: ${verification.error}`);
    }

    const transactionData = verification.subscription;
    const paymentAmount = transactionData.amount || 0;
    await this.assertPaystackTransactionOwnership(userId, transactionData);

    const verifiedSubscriptionCode = extractPaystackSubscriptionCode(transactionData);
    const expectedSubscriptionCode = context.expectedSubscriptionCode ?? null;
    if (verifiedSubscriptionCode
      && expectedSubscriptionCode
      && verifiedSubscriptionCode !== expectedSubscriptionCode) {
      await this.logBillingEvent(userId, "renewal_reconciliation_unresolved", {
        reason: "verified_and_event_subscription_identity_disagree",
        transactionReference,
        verifiedSubscriptionCode,
        expectedSubscriptionCode,
      });
      throw new Error("Paystack transaction and renewal event identify different subscriptions");
    }

    const effectiveSubscriptionCode = verifiedSubscriptionCode ?? expectedSubscriptionCode;
    const verifiedCustomerCode = extractPaystackCustomerCode(transactionData);
    const expectedCustomerCode = context.expectedCustomerCode ?? null;
    const verifiedPlanCode = extractPaystackPlanCode(transactionData);
    const expectedPlanCode = context.expectedPlanCode ?? null;
    const isRecurringInvoice = !checkoutAttempt;

    if (
      expectedCustomerCode
      && verifiedCustomerCode
      && expectedCustomerCode !== verifiedCustomerCode
    ) {
      await this.logBillingEvent(userId, "renewal_reconciliation_unresolved", {
        reason: "verified_and_event_customer_identity_disagree",
        transactionReference,
        verifiedCustomerCode,
        expectedCustomerCode,
        source: context.source ?? "direct_verification",
      });
      throw new Error("Paystack transaction and renewal event identify different customers");
    }
    if (
      expectedPlanCode
      && (!verifiedPlanCode || expectedPlanCode !== verifiedPlanCode)
    ) {
      await this.logBillingEvent(userId, "renewal_reconciliation_unresolved", {
        reason: !verifiedPlanCode
          ? "verified_transaction_missing_plan_identity"
          : "verified_and_event_plan_identity_disagree",
        transactionReference,
        verifiedPlanCode,
        expectedPlanCode,
        source: context.source ?? "direct_verification",
      });
      throw new Error("Paystack transaction and renewal event identify different plans");
    }

    if (isRecurringInvoice && (!effectiveSubscriptionCode || !verifiedCustomerCode)) {
      await this.logBillingEvent(userId, "untracked_paystack_charge_rejected", {
        reason: !effectiveSubscriptionCode
          ? "successful_untracked_charge_missing_subscription_identity"
          : "successful_untracked_charge_missing_customer_identity",
        transactionReference,
        source: context.source ?? "direct_verification",
      });
      throw new Error("Untracked Paystack charge lacks an authoritative subscription relationship");
    }

    // Initial checkout uses the server-owned attempt plan. A renewal always uses
    // the existing local subscription plan, never transaction metadata.
    const plans = await this.getSubscriptionPlans();
    const existingForResolution = await this.getUserSubscription(userId);
    const resolution = checkoutPlan
      ? { plan: checkoutPlan, source: "server_checkout_attempt" as const }
      : existingForResolution
        && ["active", "paused"].includes(existingForResolution.status)
        ? {
            plan: plans.find((candidate) => candidate.id === existingForResolution.planId) ?? null,
            source: "existing_subscription_renewal" as const,
          }
        : null;
    if (!resolution?.plan) {
      log(`[CRITICAL] Could not deterministically resolve plan for user ${userId}, reference ${transactionReference} ` +
        `(amount=${paymentAmount}, plan_code=${transactionData?.plan?.plan_code || 'none'}, ` +
        `metadata_plan_code=${transactionData?.metadata?.plan_code || 'none'}, ` +
        `metadata_plan_id=${transactionData?.metadata?.plan_id || 'none'})`, 'billing');
      await this.logBillingEvent(userId, 'plan_resolution_failed', {
        paystackReference: transactionReference,
        amount: paymentAmount,
        transactionPlanCode: transactionData?.plan?.plan_code || null,
        metadataPlanCode: transactionData?.metadata?.plan_code || null,
        metadataPlanId: transactionData?.metadata?.plan_id ?? null,
        reason: 'no_matching_subscription_plan',
      });
      throw new Error(`Could not resolve subscription plan for transaction ${transactionReference} — flagged for manual review`);
    }

    // Guard: a Paystack recurring invoice cannot belong to a trial plan. Trial
    // plans carry no Paystack plan code — Paystack has no subscription to bill
    // against. If plan resolution inherited a trial plan for a recurring invoice
    // it would silently write the wrong plan_id to user_subscriptions without
    // rejection, reproducing the exact historical mismatch this guard prevents.
    if (isRecurringInvoice && resolution.plan.billingPeriod === 'trial') {
      await this.logBillingEvent(userId, 'plan_resolution_failed', {
        paystackReference: transactionReference,
        amount: paymentAmount,
        inheritedPlanId: resolution.plan.id,
        reason: 'recurring_invoice_resolved_to_trial_plan',
      });
      throw new Error(
        `Recurring Paystack invoice for user ${userId} resolved to a trial plan ` +
        `(id=${resolution.plan.id}) — cannot process without a valid paid plan`,
      );
    }

    if (resolution.source === 'existing_subscription_renewal') {
      log(`Plan inherited from existing active subscription for user ${userId}, reference ${transactionReference} ` +
        `(renewal metadata ignored; inheriting plan id=${resolution.plan.id})`, 'billing');
      await this.logBillingEvent(userId, 'plan_inherited_from_subscription', {
        paystackReference: transactionReference,
        amount: paymentAmount,
        inheritedPlanId: resolution.plan.id,
        reason: 'trusted_renewal_uses_existing_subscription_plan',
      });
    }

    const plan = resolution.plan;
    const isYearly = plan.billingPeriod === 'yearly';
    const subscriptionTier = isYearly ? 'yearly' : 'monthly';
    const providerEvidence = extractPaystackAuthorizationEvidence(transactionData);

    // Compute the readiness that the authorization evidence alone would produce,
    // then let the Apple Pay gate override it if Apple Pay is currently disabled.
    const applePayEnabled = isPaystackApplePaySubscriptionsEnabled();
    const normalReadiness: PaystackRecurringReadiness = hasExactPaystackRecurringRelationship(
      providerEvidence,
      verifiedCustomerCode,
      plan.paystackPlanCode,
      effectiveSubscriptionCode,
    )
      ? "ready"
      : providerEvidence.authorizationReusable === false
        ? "not_ready"
        : "unknown";
    const recurringReadiness = applyPaystackApplePayGate(
      providerEvidence,
      normalReadiness,
      applePayEnabled,
    );
    if (recurringReadiness !== normalReadiness) {
      // Gate downgraded the readiness — log for auditing.
      log(
        `Apple Pay subscription gate: readiness for Apple Pay transaction ${transactionReference} (user ${userId}) set to not_ready (gate closed)`,
        "billing",
      );
    }
    const authorizationCode = providerEvidence.authorizationCode ?? undefined;
    log(`Resolved plan ${plan.name} (id=${plan.id}, period=${plan.billingPeriod}) via ${resolution.source} for user ${userId}`, 'billing');

    const now = new Date();
    const paidAt = parsePaystackDate(
      transactionData?.paid_at ?? transactionData?.paidAt ?? transactionData?.created_at,
    ) ?? now;
    const chargedAmount = paymentAmount > 0 ? paymentAmount : plan.price;

    try {
      // ATOMIC TRANSACTION: All database writes in a single transaction
      const result = await db.transaction(async (tx) => {
        // Serialize every Paystack entitlement mutation for this user. This
        // prevents two different renewal events racing totalPaid/billing dates.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${userId}, 36)`);

        const requireFinancialReview = async (
          reason: string,
          details: Record<string, unknown> = {},
        ) => {
          await tx.insert(billingEvents).values({
            userId,
            eventType: "paystack_successful_payment_requires_review",
            eventData: {
              reason,
              transactionReference,
              source: context.source ?? (checkoutAttempt ? "tracked_checkout" : "direct_verification"),
              expectedSubscriptionCode,
              verifiedSubscriptionCode,
              expectedCustomerCode,
              verifiedCustomerCode,
              invoiceCode: context.expectedInvoiceCode ?? null,
              ...details,
            },
            processed: false,
          });
          return { outcome: "review_required" as const, reason };
        };

        let currentCheckoutAttempt: PaystackCheckoutAttempt | null = null;
        let currentCheckoutPlan: SubscriptionPlan | null = null;
        if (checkoutAttempt) {
          const [lockedAttempt] = await tx
            .select()
            .from(paystackCheckoutAttempts)
            .where(eq(paystackCheckoutAttempts.paystackReference, transactionReference))
            .limit(1)
            .for("update");
          currentCheckoutAttempt = lockedAttempt ?? null;

          if (currentCheckoutAttempt) {
            const [lockedPlan] = await tx
              .select()
              .from(subscriptionPlans)
              .where(eq(subscriptionPlans.id, currentCheckoutAttempt.planId))
              .limit(1);
            currentCheckoutPlan = lockedPlan ?? null;
          }
        }

        // Check for duplicate transaction using the UNIQUE constraint
        const existingPayment = await tx
          .select()
          .from(paymentTransactions)
          .where(sql`${paymentTransactions.platform} = 'paystack' AND ${paymentTransactions.platformTransactionId} = ${transactionReference}`)
          .limit(1);

        if (existingPayment.length > 0) {
          log(`Transaction ${transactionReference} already exists in payment_transactions, skipping duplicate`, 'billing');

          // Return existing subscription
          const existingSub = await tx
            .select()
            .from(userSubscriptions)
            .where(eq(userSubscriptions.userId, userId))
            .limit(1);
          
          if (existingSub.length > 0) {
            await tx
              .update(paystackCheckoutAttempts)
              .set({ status: "completed", completedAt: now, updatedAt: now })
              .where(eq(paystackCheckoutAttempts.paystackReference, transactionReference));
            await this.cancelOtherPendingCheckoutAttempts(tx, userId, transactionReference, now);
            return {
              outcome: "duplicate" as const,
              subscription: existingSub[0] as UserSubscription,
            };
          }
          throw new Error('Duplicate transaction but no subscription found');
        }

        // The provider call is complete and lock 36 is held. This is the first
        // point where a tracked attempt is allowed to authorize settlement.
        if (checkoutAttempt) {
          const currentState = validateCurrentTrackedCheckoutAttempt(
            checkoutAttempt,
            currentCheckoutAttempt,
            currentCheckoutPlan,
            userId,
            transactionData,
          );
          if (!currentState.valid) {
            return requireFinancialReview(currentState.reason, {
              attemptId: checkoutAttempt.id,
              currentAttemptId: currentCheckoutAttempt?.id ?? null,
              currentAttemptStatus: currentCheckoutAttempt?.status ?? null,
              receivedAmount: transactionData?.amount ?? null,
              receivedCurrency: transactionData?.currency ?? null,
              receivedPlanCode: typeof transactionData?.plan === "string"
                ? transactionData.plan
                : transactionData?.plan?.plan_code ?? transactionData?.plan_code ?? null,
            });
          }
        }

        // Check if user already has a subscription (UPSERT semantics)
        const existingSubscription = await tx
          .select()
          .from(userSubscriptions)
          .where(eq(userSubscriptions.userId, userId))
          .limit(1);

        let subscription: UserSubscription;
        const existing = existingSubscription[0];
        const [cancellationAttempt] = isRecurringInvoice
          ? await tx.select().from(paystackCancellationAttempts)
              .where(and(
                eq(paystackCancellationAttempts.billingOwnerUserId, userId),
                eq(paystackCancellationAttempts.subscriptionCode, effectiveSubscriptionCode!),
                inArray(paystackCancellationAttempts.status, [
                  "requested",
                  "provider_call_started",
                  "provider_confirmation_pending",
                  "provider_result_unknown",
                  "provider_non_renewing",
                  "provider_disabled",
                  "completed",
                ]),
              ))
              .orderBy(desc(paystackCancellationAttempts.createdAt)).limit(1)
          : [];
        const providerCancellationConfirmedAt = cancellationAttempt?.providerConfirmedAt
          ? new Date(cancellationAttempt.providerConfirmedAt)
          : null;
        const chargeAfterConfirmedNonRenewal = !!providerCancellationConfirmedAt
          && paidAt.getTime() > providerCancellationConfirmedAt.getTime();

        if (isRecurringInvoice && chargeAfterConfirmedNonRenewal) {
          return requireFinancialReview("charge_after_provider_non_renewing_confirmation", {
            cancellationAttemptId: cancellationAttempt.id,
            providerConfirmedAt: providerCancellationConfirmedAt!.toISOString(),
            paidAt: paidAt.toISOString(),
          });
        }

        if (isRecurringInvoice) {
          const [activeIdentity] = await tx
            .select()
            .from(paystackSubscriptionIdentities)
            .where(and(
              eq(paystackSubscriptionIdentities.userId, userId),
              eq(paystackSubscriptionIdentities.status, "active"),
            ))
            .orderBy(desc(paystackSubscriptionIdentities.providerCreatedAt), desc(paystackSubscriptionIdentities.createdAt))
            .limit(1);

          const renewalRelationship = validateActivePaystackRenewalRelationship(
            effectiveSubscriptionCode,
            verifiedCustomerCode,
            activeIdentity ?? null,
          );
          if (!renewalRelationship.valid) {
            return requireFinancialReview(
              renewalRelationship.reason,
              {
                activeSubscriptionCode: activeIdentity?.subscriptionCode ?? null,
                activeCustomerCode: activeIdentity?.customerCode ?? null,
              },
            );
          }
          if (
            !existing
            || !["active", "paused"].includes(existing.status)
            || (!!existing.cancelledAt && !providerCancellationConfirmedAt)
            || existing.planId !== plan.id
          ) {
            return requireFinancialReview("renewal_subscription_state_changed", {
              currentSubscriptionStatus: existing?.status ?? null,
              currentSubscriptionCancelledAt: existing?.cancelledAt ?? null,
              currentPlanId: existing?.planId ?? null,
              expectedPlanId: plan.id,
            });
          }

          if (
            !verifiedPlanCode
            || !plan.paystackPlanCode
            || verifiedPlanCode !== plan.paystackPlanCode
          ) {
            return requireFinancialReview("renewal_provider_plan_mismatch", {
              providerPlanCode: verifiedPlanCode,
              currentPlanCode: plan.paystackPlanCode,
            });
          }
        }

        const billingBase = existing?.nextBillingDate
          && new Date(existing.nextBillingDate).getTime() > paidAt.getTime()
          ? new Date(existing.nextBillingDate)
          : paidAt;
        const nextBillingDate = advanceBillingDate(
          billingBase,
          isYearly ? "yearly" : "monthly",
        );
        
        if (existingSubscription.length > 0) {
          // UPDATE existing subscription
          const isRenewal = existing.status === 'active';
          
          const [updated] = await tx
            .update(userSubscriptions)
            .set({
              status: 'active',
              planId: plan.id,
              // A renewal paid before provider cancellation became effective
              // receives its corresponding entitlement without re-enabling renewal.
              cancelledAt: providerCancellationConfirmedAt ? existing.cancelledAt : null,
              cancellationRequestedAt: cancellationAttempt ? existing.cancellationRequestedAt : null,
              subscriptionStartDate: isRenewal ? existing.subscriptionStartDate : paidAt,
              nextBillingDate,
              totalPaid: sql`COALESCE(${userSubscriptions.totalPaid}, 0) + ${chargedAmount}`,
              lastPaymentDate: paidAt,
              paystackReference: transactionReference,
              paystackCustomerCode: transactionData.customer?.customer_code,
              authorizationCode,
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
              subscriptionStartDate: paidAt,
              nextBillingDate,
              cancelledAt: null,
              googlePlayPurchaseToken: null,
              googlePlayOrderId: null,
              googlePlaySubscriptionId: null,
              paystackReference: transactionReference,
              paystackCustomerCode: transactionData.customer?.customer_code,
              authorizationCode,
              totalPaid: chargedAmount,
              lastPaymentDate: paidAt,
            })
            .onConflictDoUpdate({
              target: userSubscriptions.userId,
              set: {
                status: 'active',
                planId: plan.id,
                cancelledAt: providerCancellationConfirmedAt ? existing?.cancelledAt ?? null : null,
                cancellationRequestedAt: cancellationAttempt ? existing?.cancellationRequestedAt ?? null : null,
                subscriptionStartDate: paidAt,
                nextBillingDate,
                totalPaid: sql`COALESCE(${userSubscriptions.totalPaid}, 0) + ${chargedAmount}`,
                lastPaymentDate: paidAt,
                paystackReference: transactionReference,
                paystackCustomerCode: transactionData.customer?.customer_code,
                authorizationCode,
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
          })
          .where(eq(users.id, userId));
        
        log(`Updated users table: subscription_tier=${subscriptionTier}, expires_at=${nextBillingDate.toISOString()}`, 'billing');

        // Record payment transaction (UNIQUE constraint prevents duplicates)
        await tx
          .insert(paymentTransactions)
          .values({
            userId,
            subscriptionId: subscription.id,
            amount: chargedAmount,
            currency: 'ZAR',
            status: 'completed',
            platform: 'paystack',
            paymentMethod: providerEvidence.transactionChannel ?? 'other',
            platformTransactionId: transactionReference,
            platformOrderId: transactionData.reference,
            platformSubscriptionId: transactionData.subscription?.subscription_code || transactionData.plan?.plan_code || plan.paystackPlanCode || 'unknown',
            providerTransactionId: providerEvidence.transactionId,
            providerChannel: providerEvidence.transactionChannel,
            providerAuthorizationCode: providerEvidence.authorizationCode,
            providerAuthorizationChannel: providerEvidence.authorizationChannel,
            providerAuthorizationSignature: providerEvidence.authorizationSignature,
            providerAuthorizationReusable: providerEvidence.authorizationReusable,
            providerVerifiedAt: providerEvidence.providerVerifiedAt,
            recurringReadiness,
            metadata: {
              customerCode: transactionData.customer?.customer_code,
              authorizationCode: providerEvidence.authorizationCode,
              planCode: transactionData.plan?.plan_code,
              subscriptionCode: transactionData.subscription?.subscription_code,
              transactionChannel: providerEvidence.transactionChannel,
              authorizationChannel: providerEvidence.authorizationChannel,
              authorizationReusable: providerEvidence.authorizationReusable,
              recurringReadiness,
            },
            description: `${plan.displayName || plan.name} subscription`,
            failureReason: null,
            refundReason: null,
          })
          .onConflictDoNothing(); // Ignore if duplicate (idempotency)

        if (checkoutAttempt) {
          if (effectiveSubscriptionCode) {
            await this.recordPaystackSubscriptionIdentityInTransaction(
              tx,
              userId,
              {
                ...transactionData,
                subscription_code: effectiveSubscriptionCode,
              },
              {
                supersedeExisting: true,
                allowNewActive: true,
                expectedCustomerCode: verifiedCustomerCode,
                expectedPlanCode: plan.paystackPlanCode,
              },
            );
          } else {
            // Do not leave an older SUB_* trusted during the gap before
            // subscription.create identifies the new checkout's subscription.
            await tx
              .update(paystackSubscriptionIdentities)
              .set({ status: "unresolved", updatedAt: now })
              .where(and(
                eq(paystackSubscriptionIdentities.userId, userId),
                eq(paystackSubscriptionIdentities.status, "active"),
              ));
          }
        }

        // Checkout attempts complete only after verified entitlement and ledger
        // writes succeed in the same transaction. Webhook/callback overlap is
        // harmless because both the ledger reference and this update are idempotent.
        await tx
          .update(paystackCheckoutAttempts)
          .set({ status: "completed", completedAt: now, updatedAt: now })
          .where(eq(paystackCheckoutAttempts.paystackReference, transactionReference));
        await this.cancelOtherPendingCheckoutAttempts(tx, userId, transactionReference, now);

        // Log billing event
        await tx
          .insert(billingEvents)
          .values({
            userId,
            eventType: 'subscription_activated',
            eventData: {
              planId: plan.id,
              paystackReference: transactionReference,
              customerCode: transactionData.customer?.customer_code,
              paidAt: paidAt.toISOString(),
              nextBillingDate: nextBillingDate.toISOString(),
            },
            processed: true
          });

        log(`Paystack subscription activated for user ${userId}, plan: ${plan.name}`, 'billing');
        return { outcome: "applied" as const, subscription };
      });

      if (result.outcome === "review_required") {
        throw new Error(
          `Verified Paystack payment requires financial review: ${result.reason}`,
        );
      }
      return result.subscription;

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
   * Apply an unpaid renewal only when it belongs to the exact active SUB_* record.
   * The invoice key is stored as a failed payment transaction, making duplicate
   * webhook delivery idempotent.
   */
  async recordPaystackRenewalFailure(
    userId: number,
    data: any,
    source: "invoice.payment_failed" | "invoice.update" | "reconciliation",
  ): Promise<PaystackRenewalFailureResult> {
    await this.requirePaystackBillingSchema();
    const subscription = await this.getUserSubscription(userId);
    if (!subscription) {
      return { outcome: "ignored", reason: "no_local_subscription" };
    }
    if (subscription.status === "cancelled" || subscription.cancelledAt) {
      return { outcome: "unresolved", reason: "cancelled_subscription_lifecycle_not_changed" };
    }

    const invoice = classifyPaystackInvoice(data, subscription.nextBillingDate);
    if (invoice.state !== "unpaid_due") {
      return { outcome: "ignored", reason: "invoice_not_due" };
    }
    if (!invoice.invoiceCode) {
      await this.logBillingEvent(userId, "renewal_reconciliation_unresolved", {
        source,
        reason: "missing_invoice_code",
        subscriptionCode: invoice.subscriptionCode,
      });
      return { outcome: "unresolved", reason: "missing_invoice_code" };
    }

    const activeIdentity = await this.getActivePaystackSubscriptionIdentity(userId);
    const identityMatch = subscriptionIdentityMatches(
      invoice.subscriptionCode,
      activeIdentity?.subscriptionCode ?? null,
    );
    if (identityMatch !== "match") {
      await this.logBillingEvent(userId, "renewal_reconciliation_unresolved", {
        source,
        reason: identityMatch === "conflict"
          ? "stale_subscription_identity"
          : "subscription_identity_unknown",
        invoiceCode: invoice.invoiceCode,
        incomingSubscriptionCode: invoice.subscriptionCode,
        activeSubscriptionCode: activeIdentity?.subscriptionCode ?? null,
      });
      return {
        outcome: "unresolved",
        reason: identityMatch === "conflict"
          ? "stale_subscription_identity"
          : "subscription_identity_unknown",
        invoiceCode: invoice.invoiceCode,
      };
    }

    const plan = storage.getSubscriptionPlan
      ? await storage.getSubscriptionPlan(subscription.planId)
      : null;
    const failureTransactionId = paystackInvoiceFailureTransactionId(invoice.invoiceCode);
    const now = new Date();

    const mutation = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${userId}, 36)`);

      const [lockedSubscription] = await tx
        .select()
        .from(userSubscriptions)
        .where(eq(userSubscriptions.userId, userId))
        .limit(1);
      const [lockedIdentity] = await tx
        .select()
        .from(paystackSubscriptionIdentities)
        .where(and(
          eq(paystackSubscriptionIdentities.userId, userId),
          eq(paystackSubscriptionIdentities.status, "active"),
        ))
        .limit(1);

      if (!lockedSubscription
        || lockedSubscription.status === "cancelled"
        || lockedSubscription.cancelledAt) {
        return { applied: false, reason: "subscription_state_changed" };
      }
      if (lockedIdentity?.subscriptionCode !== invoice.subscriptionCode) {
        return { applied: false, reason: "subscription_identity_changed" };
      }
      if (!lockedSubscription.nextBillingDate
        || new Date(lockedSubscription.nextBillingDate).getTime() > now.getTime()) {
        return { applied: false, reason: "subscription_no_longer_overdue" };
      }

      const inserted = await tx
        .insert(paymentTransactions)
        .values({
          userId,
          subscriptionId: lockedSubscription.id,
          amount: Number(data?.amount ?? plan?.price ?? 0),
          currency: data?.currency ?? plan?.currency ?? "ZAR",
          status: "failed",
          platform: "paystack",
          paymentMethod: data?.transaction?.channel ?? "card",
          platformTransactionId: failureTransactionId,
          platformOrderId: invoice.invoiceCode,
          platformSubscriptionId: invoice.subscriptionCode,
          metadata: {
            source,
            invoiceCode: invoice.invoiceCode,
            customerCode: invoice.customerCode,
            dueDate: invoice.dueDate?.toISOString() ?? null,
          },
          description: `${plan?.displayName || plan?.name || "Subscription"} renewal`,
          failureReason: invoice.failureReason,
          refundReason: null,
        })
        .onConflictDoNothing()
        .returning({ id: paymentTransactions.id });

      if (inserted.length === 0) {
        return { applied: false, reason: "duplicate_invoice" };
      }

      await tx
        .update(userSubscriptions)
        .set({ status: "paused", updatedAt: now })
        .where(and(
          eq(userSubscriptions.userId, userId),
          eq(userSubscriptions.status, "active"),
        ));

      await tx.insert(billingEvents).values({
        userId,
        eventType: "payment_required",
        eventData: {
          source,
          invoiceCode: invoice.invoiceCode,
          subscriptionCode: invoice.subscriptionCode,
          reason: invoice.failureReason,
          recoveryPath: "/subscription",
        },
        processed: true,
      });

      return { applied: true, reason: "overdue_invoice_unpaid" };
    });

    if (!mutation.applied) {
      return {
        outcome: mutation.reason === "duplicate_invoice" ? "duplicate" : "ignored",
        reason: mutation.reason,
        invoiceCode: invoice.invoiceCode,
      };
    }

    const user = await storage.getUser(userId);
    if (user?.email && emailService) {
      await emailService.sendPaymentFailureNotification(
        user.email,
        user.fullName || user.username || "there",
        "payment_failed",
        "We could not confirm payment for your latest renewal. Your subscription is paused. Open Subscription for secure recovery instructions.",
      );
    }

    return {
      outcome: "applied",
      reason: mutation.reason,
      invoiceCode: invoice.invoiceCode,
    };
  }

  private async recoverPaystackSubscriptionIdentity(
    userId: number,
    customerCode: string,
    expectedPlanCode: string | null,
  ) {
    if (!this.paystack) return null;

    const customerResponse = await this.paystack.customer.get(customerCode);
    const customerId = customerResponse?.status ? customerResponse?.data?.id : null;
    if (!customerId) {
      await this.logBillingEvent(userId, "renewal_reconciliation_unresolved", {
        reason: "paystack_customer_lookup_failed",
        customerCode,
      });
      return null;
    }

    const response = await (this.paystack.subscription.list as any)({
      customer: customerId,
      perPage: 100,
    });
    const subscriptions = Array.isArray(response?.data) ? response.data : [];
    const candidate = selectPaystackSubscriptionIdentityCandidate(
      subscriptions,
      customerCode,
      expectedPlanCode,
    );

    if (!candidate) {
      await this.logBillingEvent(userId, "renewal_reconciliation_unresolved", {
        reason: "no_unique_matching_paystack_subscription",
        customerCode,
        expectedPlanCode,
        providerSubscriptionCount: subscriptions.length,
      });
      return null;
    }

    const recorded = await this.recordPaystackSubscriptionIdentity(
      userId,
      candidate,
      { allowNewActive: true },
    );
    return recorded.status === "active"
      ? await this.getActivePaystackSubscriptionIdentity(userId)
      : null;
  }

  async reconcilePaystackSubscriptionForUser(userId: number): Promise<PaystackReconciliationResult> {
    const readiness = await this.getPaystackBillingSchemaReadiness();
    if (!readiness.ready) {
      return { outcome: "unresolved", reason: "billing_schema_not_ready" };
    }
    const subscription = await this.getUserSubscription(userId);
    if (!subscription?.nextBillingDate) {
      return { outcome: "unresolved", reason: "missing_local_subscription_or_billing_date" };
    }
    if (subscription.status === "cancelled" || subscription.cancelledAt) {
      return { outcome: "unresolved", reason: "cancelled_subscription_lifecycle_not_changed" };
    }
    if (new Date(subscription.nextBillingDate).getTime() > Date.now()) {
      return { outcome: "current", reason: "local_billing_date_current" };
    }
    if (!this.paystack || !subscription.paystackCustomerCode) {
      return { outcome: "unresolved", reason: "paystack_or_customer_code_unavailable" };
    }

    const plan = storage.getSubscriptionPlan
      ? await storage.getSubscriptionPlan(subscription.planId)
      : null;
    const existingIdentity = await this.getActivePaystackSubscriptionIdentity(userId);
    const recovery = existingIdentity
      ? {
          outcome: "relationship_available" as const,
          subscriptionCode: existingIdentity.subscriptionCode,
        }
      : await this.recoverPaystackRenewalRelationship(userId);
    const identity = recovery.outcome === "relationship_available"
      ? existingIdentity
      : recovery.outcome === "recovered"
        ? await this.getActivePaystackSubscriptionIdentity(userId)
        : null;
    if (!identity) {
      if (recovery.outcome === "no_verified_relationship") {
        return {
          outcome: "renewal_setup_required",
          reason: "no_verified_recurring_relationship",
        };
      }
      return {
        outcome: "unresolved",
        reason: recovery.outcome === "manual_review_required"
          ? recovery.reason
          : recovery.outcome === "reconciling"
            ? recovery.reason
            : "subscription_identity_unresolved",
      };
    }

    const response = await this.paystack.subscription.get(identity.subscriptionCode);
    const providerSubscription = response?.data;
    if (!response?.status || !providerSubscription) {
      await this.logBillingEvent(userId, "renewal_reconciliation_unresolved", {
        reason: "paystack_subscription_lookup_failed",
        subscriptionCode: identity.subscriptionCode,
        providerMessage: response?.message ?? null,
      });
      return {
        outcome: "unresolved",
        reason: "paystack_subscription_lookup_failed",
        subscriptionCode: identity.subscriptionCode,
      };
    }

    const invoices = [
      ...(providerSubscription.most_recent_invoice ? [providerSubscription.most_recent_invoice] : []),
      ...(Array.isArray(providerSubscription.invoices_history)
        ? providerSubscription.invoices_history
        : []),
      ...(Array.isArray(providerSubscription.invoices)
        ? providerSubscription.invoices
        : []),
    ];
    invoices.sort((left: any, right: any) => {
      const leftDate = parsePaystackDate(
        left?.created_at ?? left?.createdAt ?? left?.paid_at ?? left?.paidAt ?? left?.period_start,
      )?.getTime() ?? 0;
      const rightDate = parsePaystackDate(
        right?.created_at ?? right?.createdAt ?? right?.paid_at ?? right?.paidAt ?? right?.period_start,
      )?.getTime() ?? 0;
      return rightDate - leftDate;
    });
    const latestInvoice = invoices[0];

    for (const candidateInvoice of invoices) {
      const invoiceData = {
        ...candidateInvoice,
        subscription: {
          ...providerSubscription,
          subscription_code: identity.subscriptionCode,
        },
        customer: providerSubscription.customer,
      };
      const classified = classifyPaystackInvoice(invoiceData, subscription.nextBillingDate);
      if (classified.state === "paid" && classified.transactionReference) {
        const paidAt = parsePaystackDate(
          candidateInvoice?.paid_at ?? candidateInvoice?.paidAt ?? candidateInvoice?.created_at,
        );
        if (!paidAt || paidAt.getTime() < new Date(subscription.nextBillingDate).getTime()) {
          continue;
        }
        await this.processPaystackSubscription(userId, classified.transactionReference, {
          expectedSubscriptionCode: identity.subscriptionCode,
          source: "reconciliation",
        });
        await this.logBillingEvent(userId, "renewal_reconciled_paid", {
          subscriptionCode: identity.subscriptionCode,
          invoiceCode: classified.invoiceCode,
          transactionReference: classified.transactionReference,
        });
        return {
          outcome: "reconciled_paid",
          reason: "verified_paid_invoice_applied",
          subscriptionCode: identity.subscriptionCode,
        };
      }
    }

    if (latestInvoice) {
      const invoiceData = {
        ...latestInvoice,
        subscription: {
          ...providerSubscription,
          subscription_code: identity.subscriptionCode,
        },
        customer: providerSubscription.customer,
      };
      const classified = classifyPaystackInvoice(invoiceData, subscription.nextBillingDate);
      if (classified.state === "unpaid_due") {
        const failure = await this.recordPaystackRenewalFailure(
          userId,
          invoiceData,
          "reconciliation",
        );
        if (failure.outcome === "applied" || failure.outcome === "duplicate") {
          return {
            outcome: "payment_required",
            reason: failure.reason,
            subscriptionCode: identity.subscriptionCode,
          };
        }
      }
    }

    const providerStatus = String(providerSubscription.status ?? "").toLowerCase();
    if (providerStatus !== "active") {
      const failure = await this.recordPaystackRenewalFailure(userId, {
        invoice_code: `reconcile_${identity.subscriptionCode}_${new Date(subscription.nextBillingDate).toISOString()}`,
        paid: false,
        due_date: subscription.nextBillingDate,
        subscription: { subscription_code: identity.subscriptionCode },
        customer: providerSubscription.customer,
        description: `Paystack subscription status is ${providerStatus || "unknown"}`,
      }, "reconciliation");
      if (failure.outcome === "applied" || failure.outcome === "duplicate") {
        return {
          outcome: "payment_required",
          reason: `paystack_subscription_${providerStatus || "inactive"}`,
          subscriptionCode: identity.subscriptionCode,
        };
      }
    }

    await this.logBillingEvent(userId, "renewal_reconciliation_unresolved", {
      reason: "no_authoritative_paid_or_failed_invoice",
      subscriptionCode: identity.subscriptionCode,
      providerStatus,
      invoiceCount: invoices.length,
    });
    return {
      outcome: "unresolved",
      reason: "no_authoritative_paid_or_failed_invoice",
      subscriptionCode: identity.subscriptionCode,
    };
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
        paymentRequired: subscription.status === 'paused',
        recoveryPath: subscription.status === 'paused' ? '/subscription' : null,
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
   * Customer-facing renewal state. This is derived from the existing
   * subscription and trusted identity data; it intentionally does not change
   * entitlement, charge a card, or contact Paystack while a page is loading.
   */
  async getPaystackRenewalStatus(userId: number): Promise<PaystackRenewalStatus> {
    const subscription = await this.getUserSubscription(userId);
    if (!subscription || subscription.status === "cancelled" || !subscription.nextBillingDate) {
      return { state: "not_due", recoveryCheckoutEligible: false, managementLinkEligible: false };
    }

    if (subscription.status === "paused") {
      return { state: "payment_failed", recoveryCheckoutEligible: false, managementLinkEligible: false };
    }

    if (subscription.status !== "active") {
      return { state: "not_due", recoveryCheckoutEligible: false, managementLinkEligible: false };
    }

    // Other billing platforms own their own renewal lifecycle. Do not infer a
    // Paystack setup problem from an overdue App Store or Google Play plan.
    const hasPaystackRelationship = !!(
      subscription.paystackReference
      || subscription.paystackCustomerCode
      || subscription.authorizationCode
    );
    if (!hasPaystackRelationship) {
      return { state: "reconciling", recoveryCheckoutEligible: false, managementLinkEligible: false };
    }

    try {
      const readiness = await this.getPaystackBillingSchemaReadiness();
      if (!readiness.ready) {
        return { state: "reconciling", recoveryCheckoutEligible: false, managementLinkEligible: false };
      }
      const identity = await this.getActivePaystackSubscriptionIdentity(userId);
      if (identity) {
        if (identity.recurringReadiness === "ready") {
          return { state: "automatic_renewal_active", recoveryCheckoutEligible: false, managementLinkEligible: false };
        }
        if (identity.recurringReadiness === "not_ready") {
          return {
            state: "payment_method_needs_attention",
            recoveryCheckoutEligible: false,
            managementLinkEligible: isPaystackSubscriptionManagementLinkEnabled(),
          };
        }
        // recurringReadiness === "unknown": historic evidence is incomplete — this is
        // the schema default for identities that have never been provider-verified.
        // "unknown" must not be treated as an active reconciliation. When billing is
        // still in the future, surface a neutral active state rather than implying
        // that a check is currently in progress.
        // Exception: if a reconciliation_pending event exists, the system IS actively
        // awaiting a provider result — preserve "reconciling" in that case.
        if (new Date(subscription.nextBillingDate).getTime() > Date.now()) {
          const [pendingReconciliation] = await db
            .select({ eventType: billingEvents.eventType })
            .from(billingEvents)
            .where(and(
              eq(billingEvents.userId, userId),
              eq(billingEvents.eventType, "renewal_reconciliation_pending"),
            ))
            .orderBy(desc(billingEvents.createdAt))
            .limit(1);
          if (!pendingReconciliation) {
            return { state: "subscription_active", recoveryCheckoutEligible: false, managementLinkEligible: false };
          }
          return { state: "reconciling", recoveryCheckoutEligible: false, managementLinkEligible: false };
        }
        // Overdue + unknown: fall through to the recovery-signal / setup-required
        // checks below so the existing billing-date-overdue logic applies.
      }
    } catch {
      return { state: "reconciling", recoveryCheckoutEligible: false, managementLinkEligible: false };
    }

    // No identity row. Check whether the subscription's billing date is still
    // in the future — which implies the customer is currently paid up.
    if (new Date(subscription.nextBillingDate).getTime() > Date.now()) {
      // Active reconciliation or manual-review signals take precedence over any
      // neutral state, even when billing is future-dated.
      const [recentRecoverySignal] = await db
        .select({ eventType: billingEvents.eventType })
        .from(billingEvents)
        .where(and(
          eq(billingEvents.userId, userId),
          inArray(billingEvents.eventType, [
            "renewal_recovery_manual_review",
            "renewal_reconciliation_pending",
          ]),
        ))
        .orderBy(desc(billingEvents.createdAt))
        .limit(1);
      if (recentRecoverySignal?.eventType === "renewal_recovery_manual_review") {
        return { state: "manual_review_required", recoveryCheckoutEligible: false, managementLinkEligible: false };
      }
      if (recentRecoverySignal?.eventType === "renewal_reconciliation_pending") {
        return { state: "reconciling", recoveryCheckoutEligible: false, managementLinkEligible: false };
      }

      // A customer with future billing and at least one successful settlement
      // event that supersedes any past failure is actively paying — surface the
      // neutral subscription_active state rather than a misleading setup-required
      // warning. This covers legacy customers whose identity row was never created
      // because their charges pre-dated the server-side identity recording flow.
      // recoveryCheckoutEligible is intentionally false: opening a new checkout
      // for an already-paying customer risks creating a duplicate Paystack
      // subscription.
      const hasSettlementEvidence =
        await this.hasSuccessfulRecurringSettlementEvidence(userId);
      if (hasSettlementEvidence) {
        return {
          state: "subscription_active",
          recoveryCheckoutEligible: false,
          managementLinkEligible: false,
        };
      }

      // No settlement evidence — conservative setup path. Do NOT set
      // recoveryCheckoutEligible here; without settlement evidence we cannot
      // rule out that this user genuinely never completed a recurring payment.
      return {
        state: "renewal_setup_required",
        recoveryCheckoutEligible: false,
        managementLinkEligible: false,
      };
    }

    // Provider inspection is deliberately initiated only by the customer's
    // recovery action. Once that action has established ambiguity or an
    // incomplete provider result, surface the durable server-derived outcome
    // rather than exposing another checkout opportunity on page reload.
    const [recentRecoverySignal] = await db
      .select({ eventType: billingEvents.eventType })
      .from(billingEvents)
      .where(and(
        eq(billingEvents.userId, userId),
        inArray(billingEvents.eventType, [
          "renewal_recovery_manual_review",
          "renewal_reconciliation_pending",
        ]),
      ))
      .orderBy(desc(billingEvents.createdAt))
      .limit(1);
    if (recentRecoverySignal?.eventType === "renewal_recovery_manual_review") {
      return { state: "manual_review_required", recoveryCheckoutEligible: false, managementLinkEligible: false };
    }
    if (recentRecoverySignal?.eventType === "renewal_reconciliation_pending") {
      return { state: "reconciling", recoveryCheckoutEligible: false, managementLinkEligible: false };
    }

    // The deliberate recovery action performs provider inspection before it
    // can open checkout. A customer code is required for that inspection.
    return {
      state: "renewal_setup_required",
      recoveryCheckoutEligible: !!subscription.paystackCustomerCode,
      managementLinkEligible: false,
    };
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
        const savedSubscription = await storage.updateUserSubscription(existingSubscription.id, updatedSubscription);
        if (!savedSubscription) {
          throw new Error('Failed to update subscription');
        }
        return savedSubscription;
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
   * Record billing event (public method for webhook handlers)
   * Supports null userId for cases where user resolution failed
   * TEMPORARY LEGACY FALLBACK SUPPORT:
   * Remove null userId support once all pre-2026-01-22 subscriptions have renewed
   */
  async recordBillingEvent(
    userId: number | null, 
    eventType: string, 
    eventData: any
  ): Promise<void> {
    try {
      const billingEventData: InsertBillingEvent = {
        userId: userId,
        eventType,
        eventData: {
          ...eventData,
          timestamp: new Date().toISOString(),
          userAgent: eventData.userAgent || 'webhook',
        },
        processed: true,
      };

      await db.insert(billingEvents).values(billingEventData);
      log(`Billing event recorded: ${eventType} for user ${userId || 'unknown'}`, 'billing');
    } catch (error) {
      log(`Failed to record billing event ${eventType}: ${error}`, 'billing');
    }
  }

  /**
   * Preserve a signed provider event when settlement must be deferred during a
   * schema rollout. billing_events predates the Paystack identity/attempt
   * tables, so this write remains available in the old-schema window.
   */
  async deferPaystackWebhookForSchema(
    eventData: Record<string, unknown>,
  ): Promise<void> {
    await db.insert(billingEvents).values({
      userId: null,
      eventType: "paystack_event_deferred_schema_unavailable",
      eventData,
      processed: false,
      processingError: "billing_schema_not_ready",
    });
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

  /**
   * OPERATIONAL HARDENING: Detect orphaned payments
   * Finds payments that were received but didn't create subscriptions
   * Uses a grace period to avoid false alarms from webhook delays
   */
  async detectOrphanedPayments(gracePeriodMinutes: number = 5): Promise<Array<{
    userId: number | null;
    reference: string;
    amount: number;
    paymentTime: string;
    minutesSincePayment: number;
  }>> {
    try {
      const gracePeriodMs = gracePeriodMinutes * 60 * 1000;
      const cutoffTime = new Date(Date.now() - gracePeriodMs);
      
      // Find charge.success events that are older than grace period
      const recentPaymentEvents = await db.select()
        .from(billingEvents)
        .where(sql`
          event_type = 'paystack_webhook_received' 
          AND event_data->>'event' = 'charge.success'
          AND created_at < ${cutoffTime}
          AND created_at > ${new Date(Date.now() - 24 * 60 * 60 * 1000)}
        `)
        .orderBy(billingEvents.createdAt);

      const orphanedPayments: Array<{
        userId: number | null;
        reference: string;
        amount: number;
        paymentTime: string;
        minutesSincePayment: number;
      }> = [];

      for (const event of recentPaymentEvents) {
        const eventData = event.eventData as any;
        const reference = eventData?.reference;
        
        if (!reference) continue;

        // Check if this payment was already processed
        const existingPayment = await db.select()
          .from(paymentTransactions)
          .where(sql`metadata->>'reference' = ${reference} OR platform_transaction_id = ${reference}`)
          .limit(1);

        if (existingPayment.length === 0) {
          // Check if there's an "already alerted" billing event for this reference
          const alreadyAlerted = await db.select()
            .from(billingEvents)
            .where(sql`
              event_type = 'orphaned_payment_alert' 
              AND event_data->>'reference' = ${reference}
            `)
            .limit(1);

          if (alreadyAlerted.length === 0) {
            const minutesSincePayment = Math.round(
              (Date.now() - new Date(eventData?.received_at || event.createdAt).getTime()) / 60000
            );

            // The 'paystack_webhook_received' event is recorded with a null user_id.
            // If a later event for this same reference already resolved the user
            // (e.g. legacy_paystack_webhook_processed or plan_resolution_failed),
            // attribute the orphaned payment to that user so the alert is actionable.
            let resolvedUserId = event.userId;
            if (!resolvedUserId) {
              const relatedWithUser = await db.select()
                .from(billingEvents)
                .where(sql`
                  (event_data->>'reference' = ${reference} OR event_data->>'paystackReference' = ${reference})
                  AND user_id IS NOT NULL
                `)
                .orderBy(desc(billingEvents.createdAt))
                .limit(1);
              if (relatedWithUser.length > 0) {
                resolvedUserId = relatedWithUser[0].userId;
              }
            }

            orphanedPayments.push({
              userId: resolvedUserId,
              reference,
              amount: 0, // Will be fetched if needed
              paymentTime: eventData?.received_at || event.createdAt?.toISOString() || 'unknown',
              minutesSincePayment
            });
          }
        }
      }

      return orphanedPayments;
    } catch (error) {
      log(`[ORPHAN_DETECT] Error detecting orphaned payments: ${error}`, 'billing');
      return [];
    }
  }

  /**
   * OPERATIONAL HARDENING: Send calm, actionable alert for orphaned payment
   * No stack traces, no red sirens - just actionable info
   */
  async sendOrphanedPaymentAlert(orphanedPayment: {
    userId: number | null;
    reference: string;
    amount: number;
    paymentTime: string;
    minutesSincePayment: number;
  }): Promise<void> {
    try {
      const { userId, reference, paymentTime, minutesSincePayment } = orphanedPayment;

      // Verify with Paystack to get payment details
      let amount = 0;
      let customerEmail = 'unknown';
      let providerSubscriptionCode: string | null = null;
      try {
        const verification = await this.verifyPaystackTransaction(reference);
        if (verification.valid && verification.subscription) {
          amount = verification.subscription.amount || 0;
          customerEmail = verification.subscription.customer?.email || 'unknown';
          providerSubscriptionCode = extractPaystackSubscriptionCode(verification.subscription);
        }
      } catch (e) {
        log(`[ORPHAN_ALERT] Could not verify transaction ${reference}`, 'billing');
      }

      const requiresIdentityReconciliation = !!providerSubscriptionCode;
      const alertClassification = requiresIdentityReconciliation
        ? "existing_provider_subscription_identity_missing"
        : "payment_without_provider_subscription_identity";

      // Record that we're alerting only after provider verification so the event
      // itself carries the operational classification used in the alert copy.
      await this.recordBillingEvent(userId, 'orphaned_payment_alert', {
        reference,
        payment_time: paymentTime,
        minutes_since_payment: minutesSincePayment,
        provider_subscription_code: providerSubscriptionCode,
        alert_classification: alertClassification,
        alerted_at: new Date().toISOString()
      });

      const alertMessage = requiresIdentityReconciliation
        ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PAYMENT NEEDS IDENTITY RECONCILIATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A payment was received for an existing Paystack subscription, but the local
subscription identity was not reconciled.

Details:
• User ID: ${userId || 'Not identified'}
• Customer Email: ${customerEmail}
• Paystack Reference: ${reference}
• Provider Subscription: ${providerSubscriptionCode}
• Payment Amount: R${(amount / 100).toFixed(2)}
• Time Since Payment: ${minutesSincePayment} minutes

Safe next step:
Verify the signed charge.success or invoice.update event can be replayed after
the local customer and plan relationship are checked. Do not create a checkout,
charge a card, or create another Paystack subscription for this payment.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`
        : `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PAYMENT NEEDS ATTENTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A payment was received but no subscription was created.

Details:
• User ID: ${userId || 'Not identified'}
• Customer Email: ${customerEmail}
• Paystack Reference: ${reference}
• Payment Amount: R${(amount / 100).toFixed(2)}
• Time Since Payment: ${minutesSincePayment} minutes

To Fix:
POST /api/admin/payments/reconcile
Body: { "reference": "${reference}" }

This will safely verify the payment with Paystack and create the subscription if valid.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

      log(`[ORPHAN_ALERT] ${alertMessage}`, 'billing');

      // Send email notification to admin
      if (emailService) {
        await emailService.sendEmail(
          process.env.ADMIN_EMAIL || 'support@simpleslips.co.za',
          'Simple Slips: Payment Needs Attention',
          alertMessage
        );
      }

    } catch (error) {
      log(`[ORPHAN_ALERT] Error sending alert: ${error}`, 'billing');
    }
  }

  /**
   * OPERATIONAL HARDENING: Start orphaned payment monitoring
   * Runs every 5 minutes to detect and alert on missed payments
   */
  startOrphanedPaymentMonitoring(intervalMinutes: number = 5): void {
    log(`[ORPHAN_MONITOR] Starting orphaned payment monitoring (every ${intervalMinutes} minutes)`, 'billing');
    
    setInterval(async () => {
      try {
        const orphanedPayments = await this.detectOrphanedPayments(5); // 5-min grace period
        
        if (orphanedPayments.length > 0) {
          log(`[ORPHAN_MONITOR] Found ${orphanedPayments.length} orphaned payment(s)`, 'billing');
          
          for (const payment of orphanedPayments) {
            await this.sendOrphanedPaymentAlert(payment);
          }
        }
      } catch (error) {
        log(`[ORPHAN_MONITOR] Error in monitoring cycle: ${error}`, 'billing');
      }
    }, intervalMinutes * 60 * 1000);
  }

  async runSubscriptionReconciliation(): Promise<Array<{
    userId: number;
    username: string;
    email: string | null;
    nextBillingDate: Date | null;
    daysSinceExpiry: number;
    lastPaymentDate: Date | null;
    paystackCustomerCode: string | null;
    reconciliationOutcome: PaystackReconciliationResult["outcome"];
    reconciliationReason: string;
  }>> {
    try {
      log(`[RECONCILIATION] Running subscription reconciliation check...`, 'billing');
      const readiness = await this.getPaystackBillingSchemaReadiness();
      if (!readiness.ready) {
        log(`[RECONCILIATION] Deferred: Paystack billing schema is not ready`, "billing");
        return [];
      }

      const now = new Date();
      const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

      const overdueSubscriptions = await db.select({
        userId: userSubscriptions.userId,
        username: users.username,
        email: users.email,
        nextBillingDate: userSubscriptions.nextBillingDate,
        lastPaymentDate: userSubscriptions.lastPaymentDate,
        paystackCustomerCode: userSubscriptions.paystackCustomerCode,
      })
      .from(userSubscriptions)
      .innerJoin(users, eq(userSubscriptions.userId, users.id))
      .where(
        sql`${userSubscriptions.status} = 'active' AND ${userSubscriptions.nextBillingDate} < NOW()`
      );

      const overdueUsers: Array<{
        userId: number;
        username: string;
        email: string | null;
        nextBillingDate: Date | null;
        daysSinceExpiry: number;
        lastPaymentDate: Date | null;
        paystackCustomerCode: string | null;
        reconciliationOutcome: PaystackReconciliationResult["outcome"];
        reconciliationReason: string;
      }> = [];

      for (const sub of overdueSubscriptions) {
        let reconciliation: PaystackReconciliationResult;
        try {
          reconciliation = await this.reconcilePaystackSubscriptionForUser(sub.userId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          reconciliation = {
            outcome: "unresolved",
            reason: `provider_reconciliation_error: ${message}`,
          };
          await this.logBillingEvent(sub.userId, "renewal_reconciliation_unresolved", {
            reason: "provider_reconciliation_error",
            error: message,
          });
          log(`[RECONCILIATION] User ${sub.userId} failed without aborting remaining users: ${message}`, 'billing');
        }
        if (reconciliation.outcome === "reconciled_paid" || reconciliation.outcome === "current") {
          log(`[RECONCILIATION] User ${sub.userId}: ${reconciliation.outcome} (${reconciliation.reason})`, 'billing');
          continue;
        }

        const recentActivation = await db.select()
          .from(billingEvents)
          .where(
            sql`${billingEvents.userId} = ${sub.userId} AND ${billingEvents.eventType} = 'subscription_activated' AND ${billingEvents.createdAt} > ${fortyEightHoursAgo}`
          )
          .limit(1);

        if (recentActivation.length === 0) {
          const daysSinceExpiry = sub.nextBillingDate
            ? Math.floor((now.getTime() - new Date(sub.nextBillingDate).getTime()) / (24 * 60 * 60 * 1000))
            : 0;

          overdueUsers.push({
            userId: sub.userId,
            username: sub.username,
            email: sub.email,
            nextBillingDate: sub.nextBillingDate,
            daysSinceExpiry,
            lastPaymentDate: sub.lastPaymentDate,
            paystackCustomerCode: sub.paystackCustomerCode,
            reconciliationOutcome: reconciliation.outcome,
            reconciliationReason: reconciliation.reason,
          });
        }
      }

      if (overdueUsers.length > 0) {
        log(`[RECONCILIATION] Found ${overdueUsers.length} overdue subscription(s)`, 'billing');

        const userList = overdueUsers.map(u =>
          `• ${u.username} (${u.email || 'no email'}) - ${u.daysSinceExpiry} days overdue, ` +
          `Reconciliation: ${u.reconciliationOutcome} (${u.reconciliationReason}), ` +
          `Last paid: ${u.lastPaymentDate ? new Date(u.lastPaymentDate).toISOString() : 'never'}, ` +
          `Paystack: ${u.paystackCustomerCode || 'N/A'}`
        ).join('\n');

        const alertMessage = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUBSCRIPTION RECONCILIATION ALERT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${overdueUsers.length} active subscription(s) have overdue renewal dates:

${userList}

The reconciliation worker queried Paystack for each account. Paid invoices with a
verified transaction reference were applied automatically, and exact-identity
unpaid renewals were moved to payment-required state. The users below still need
attention because the provider result was unresolved or payment is required.

Action Required:
1. Review the reconciliation reason shown for each customer
2. If Paystack shows a successful payment, use the verified transaction reference
   with the existing manual sync endpoint
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

        if (emailService) {
          await emailService.sendEmail(
            process.env.ADMIN_EMAIL || 'support@simpleslips.co.za',
            `Simple Slips: ${overdueUsers.length} Overdue Subscription Renewal(s)`,
            alertMessage
          );
        }

        await this.recordBillingEvent(null, 'reconciliation_alert_sent', {
          overdueCount: overdueUsers.length,
          affectedUserIds: overdueUsers.map(u => u.userId),
          alertedAt: now.toISOString(),
        });
      } else {
        log(`[RECONCILIATION] No overdue subscriptions found`, 'billing');
      }

      return overdueUsers;
    } catch (error) {
      log(`[RECONCILIATION] Error running reconciliation: ${error}`, 'billing');
      return [];
    }
  }

  startReconciliationMonitoring(intervalHours: number = 1): void {
    log(`[RECONCILIATION] Starting subscription reconciliation monitoring (every ${intervalHours} hours)`, 'billing');

    const runReconciliation = async () => {
      try {
        await this.runSubscriptionReconciliation();
      } catch (error) {
        log(`[RECONCILIATION] Error in monitoring cycle: ${error}`, 'billing');
      }
    };

    // Run shortly after startup as well as on the interval so a missed webhook
    // does not wait for the next full scheduler cycle.
    setTimeout(runReconciliation, 60 * 1000);
    setInterval(runReconciliation, intervalHours * 60 * 60 * 1000);
  }

  async checkWebhookHealth(): Promise<void> {
    try {
      log(`[WEBHOOK_HEALTH] Running webhook health check...`, 'billing');

      const now = new Date();
      const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

      const [webhookCountResult] = await db.select({ count: sql<number>`count(*)` })
        .from(billingEvents)
        .where(
          sql`${billingEvents.eventType} = 'paystack_webhook_received' AND ${billingEvents.createdAt} > ${fortyEightHoursAgo}`
        );

      const webhookCount = Number(webhookCountResult?.count || 0);

      if (webhookCount > 0) {
        log(`[WEBHOOK_HEALTH] ${webhookCount} webhooks received in last 48h - healthy`, 'billing');
        return;
      }

      const [activeSubsResult] = await db.select({ count: sql<number>`count(*)` })
        .from(userSubscriptions)
        .where(eq(userSubscriptions.status, 'active'));

      const activeSubscribers = Number(activeSubsResult?.count || 0);

      if (activeSubscribers === 0) {
        log(`[WEBHOOK_HEALTH] No active subscribers - skipping alert`, 'billing');
        return;
      }

      const existingAlert = await db.select()
        .from(billingEvents)
        .where(
          sql`${billingEvents.eventType} = 'webhook_health_alert' AND ${billingEvents.createdAt} > ${fortyEightHoursAgo}`
        )
        .limit(1);

      if (existingAlert.length > 0) {
        log(`[WEBHOOK_HEALTH] Alert already sent in last 48h - skipping`, 'billing');
        return;
      }

      const alertMessage = `URGENT: No Paystack webhooks received in 48 hours. Renewal payments may not be processing. Check webhook URL configuration in Paystack dashboard.\n\nActive subscribers: ${activeSubscribers}\nLast check: ${now.toISOString()}`;

      if (emailService) {
        await emailService.sendEmail(
          process.env.ADMIN_EMAIL || 'support@simpleslips.co.za',
          '🚨 URGENT: No Paystack Webhooks in 48 Hours',
          alertMessage
        );
      }

      await this.recordBillingEvent(null, 'webhook_health_alert', {
        webhookCount: 0,
        activeSubscribers,
        alertedAt: now.toISOString(),
      });

      log(`[WEBHOOK_HEALTH] ALERT: No webhooks in 48h with ${activeSubscribers} active subscribers`, 'billing');
    } catch (error) {
      log(`[WEBHOOK_HEALTH] Error checking webhook health: ${error}`, 'billing');
    }
  }

  startWebhookHealthMonitoring(intervalHours: number = 12): void {
    log(`[WEBHOOK_HEALTH] Starting webhook health monitoring (every ${intervalHours} hours)`, 'billing');

    setInterval(async () => {
      try {
        await this.checkWebhookHealth();
      } catch (error) {
        log(`[WEBHOOK_HEALTH] Error in monitoring cycle: ${error}`, 'billing');
      }
    }, intervalHours * 60 * 60 * 1000);
  }

  async runPaymentWarnings(): Promise<void> {
    try {
      log(`[PAYMENT_WARNINGS] Running payment warning check...`, 'billing');

      const now = new Date();
      const warnings: Array<{ userId: number; username: string; email: string; daysLeft: number; type: 'trial' | 'renewal'; dueDate: Date }> = [];

      // --- Trial Expiry Warnings (3 days and 1 day) ---
      const trialUsers = await db.select({
        userId: userSubscriptions.userId,
        trialEndDate: userSubscriptions.trialEndDate,
        email: users.email,
        username: users.username,
      })
        .from(userSubscriptions)
        .innerJoin(users, eq(users.id, userSubscriptions.userId))
        .where(
          sql`${userSubscriptions.status} = 'trial' AND ${userSubscriptions.trialEndDate} IS NOT NULL`
        );

      for (const user of trialUsers) {
        if (!user.trialEndDate || !user.email) continue;
        const daysLeft = Math.ceil((user.trialEndDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

        if (daysLeft > 0 && daysLeft <= 3) {
          warnings.push({
            userId: user.userId,
            username: user.username || 'Unknown',
            email: user.email,
            daysLeft,
            type: 'trial',
            dueDate: user.trialEndDate,
          });
        }
      }

      // --- Renewal Due Warnings (3 days and 1 day) ---
      const activeUsers = await db.select({
        userId: userSubscriptions.userId,
        nextBillingDate: userSubscriptions.nextBillingDate,
        email: users.email,
        username: users.username,
      })
        .from(userSubscriptions)
        .innerJoin(users, eq(users.id, userSubscriptions.userId))
        .where(
          sql`${userSubscriptions.status} = 'active' AND ${userSubscriptions.nextBillingDate} IS NOT NULL AND ${userSubscriptions.nextBillingDate} > ${now}`
        );

      for (const user of activeUsers) {
        if (!user.nextBillingDate || !user.email) continue;
        const daysLeft = Math.ceil((user.nextBillingDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

        if (daysLeft > 0 && daysLeft <= 3) {
          warnings.push({
            userId: user.userId,
            username: user.username || 'Unknown',
            email: user.email,
            daysLeft,
            type: 'renewal',
            dueDate: user.nextBillingDate,
          });
        }
      }

      // Record each warning in billing_events for Command Center visibility
      for (const w of warnings) {
        const eventType = w.type === 'trial'
          ? (w.daysLeft <= 1 ? 'trial_expiry_warning_1d' : 'trial_expiry_warning_3d')
          : (w.daysLeft <= 1 ? 'renewal_warning_1d' : 'renewal_warning_3d');

        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const existing = await db.select()
          .from(billingEvents)
          .where(
            sql`${billingEvents.userId} = ${w.userId} AND ${billingEvents.eventType} = ${eventType} AND ${billingEvents.createdAt} > ${sevenDaysAgo}`
          )
          .limit(1);

        if (existing.length === 0) {
          await this.recordBillingEvent(w.userId, eventType, {
            email: w.email,
            username: w.username,
            daysLeft: w.daysLeft,
            warningType: w.type,
            dueDate: w.dueDate.toISOString(),
          });
        }
      }

      // Send a single admin summary email if there are any upcoming events
      if (warnings.length > 0) {
        const alreadySentToday = await db.select()
          .from(billingEvents)
          .where(
            sql`${billingEvents.eventType} = 'payment_warnings_admin_digest' AND ${billingEvents.createdAt} > ${new Date(now.getTime() - 12 * 60 * 60 * 1000)}`
          )
          .limit(1);

        if (alreadySentToday.length === 0) {
          const trialWarnings = warnings.filter(w => w.type === 'trial');
          const renewalWarnings = warnings.filter(w => w.type === 'renewal');

          let body = `PAYMENT WARNINGS DIGEST\n`;
          body += `Generated: ${now.toISOString()}\n`;
          body += `Total upcoming: ${warnings.length}\n\n`;

          if (trialWarnings.length > 0) {
            body += `=== TRIALS EXPIRING SOON (${trialWarnings.length}) ===\n`;
            for (const w of trialWarnings) {
              body += `  ${w.daysLeft <= 1 ? '🔴' : '🟡'} ${w.username} (${w.email}) - ${w.daysLeft} day${w.daysLeft > 1 ? 's' : ''} left - expires ${w.dueDate.toLocaleDateString()}\n`;
            }
            body += `\n`;
          }

          if (renewalWarnings.length > 0) {
            body += `=== RENEWALS DUE SOON (${renewalWarnings.length}) ===\n`;
            for (const w of renewalWarnings) {
              body += `  ${w.daysLeft <= 1 ? '🔴' : '🟡'} ${w.username} (${w.email}) - ${w.daysLeft} day${w.daysLeft > 1 ? 's' : ''} left - due ${w.dueDate.toLocaleDateString()}\n`;
            }
            body += `\n`;
          }

          body += `\nView details in Command Center: ${process.env.APP_URL || 'https://simpleslips.app'}/command-center`;

          const adminEmail = process.env.ADMIN_EMAIL || 'support@simpleslips.co.za';
          if (emailService) {
            const sent = await emailService.sendEmail(
              adminEmail,
              `📊 Payment Warnings: ${trialWarnings.length} trial${trialWarnings.length !== 1 ? 's' : ''}, ${renewalWarnings.length} renewal${renewalWarnings.length !== 1 ? 's' : ''} due soon`,
              body
            );
            if (sent) {
              log(`[PAYMENT_WARNINGS] Admin digest sent to ${adminEmail} (${warnings.length} warnings)`, 'billing');
            }
          }

          await this.recordBillingEvent(null, 'payment_warnings_admin_digest', {
            totalWarnings: warnings.length,
            trialCount: trialWarnings.length,
            renewalCount: renewalWarnings.length,
            users: warnings.map(w => ({ userId: w.userId, username: w.username, type: w.type, daysLeft: w.daysLeft })),
          });
        } else {
          log(`[PAYMENT_WARNINGS] Admin digest already sent in last 12h - skipping email`, 'billing');
        }
      }

      log(`[PAYMENT_WARNINGS] Warning check complete - ${warnings.length} upcoming events found`, 'billing');
    } catch (error) {
      log(`[PAYMENT_WARNINGS] Error running payment warnings: ${error}`, 'billing');
    }
  }

  startPaymentWarningMonitoring(intervalHours: number = 12): void {
    log(`[PAYMENT_WARNINGS] Starting payment warning monitoring (every ${intervalHours} hours)`, 'billing');

    this.runPaymentWarnings();

    setInterval(async () => {
      try {
        await this.runPaymentWarnings();
      } catch (error) {
        log(`[PAYMENT_WARNINGS] Error in monitoring cycle: ${error}`, 'billing');
      }
    }, intervalHours * 60 * 60 * 1000);
  }
}

// Export singleton instance
export const billingService = new BillingService();
