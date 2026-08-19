import { storage } from "./storage";
import { log } from "./vite";
import { billingService } from "./billing-service";
import { startTierMigrationMonitoring } from "./azure-tier-migration";
import { db } from "./db";
import { sql } from "drizzle-orm";

// Centralized Paystack plan codes (server is the source of truth).
export const PAYSTACK_PLAN_CODES: Record<string, string> = {
  premium_monthly: 'PLN_8l8p7v1mergg804',
  premium_yearly: 'PLN_k9q25ilwueuz17j',
};

/**
 * Seat-based Team tiers. Solo (1 seat) is the existing premium_monthly plan and is
 * intentionally not listed here. These rows are the source of truth for deterministic
 * plan resolution (by Paystack plan code) and for a workspace's seat capacity.
 *
 * Prices are in cents (ZAR). Only monthly Paystack plan codes exist today; yearly
 * variants can be added later by extending this list.
 */
export const TEAM_PLANS: Array<{
  name: string;
  displayName: string;
  description: string;
  price: number;
  paystackPlanCode: string;
  maxSeats: number;
}> = [
  { name: 'team_s', displayName: 'Lite Team', description: 'Shared workspace for small teams — up to 5 seats.', price: 24500, paystackPlanCode: 'PLN_15dr43omaa0569q', maxSeats: 5 },
  { name: 'team_m', displayName: 'Medium Team', description: 'Shared workspace for growing teams — up to 10 seats.', price: 49000, paystackPlanCode: 'PLN_p92uns68g8zenic', maxSeats: 10 },
  { name: 'team_l', displayName: 'Large Team', description: 'Shared workspace for larger teams — up to 20 seats.', price: 98000, paystackPlanCode: 'PLN_6dn6r7nvwe2nwnh', maxSeats: 20 },
  { name: 'team_xl', displayName: 'Enterprise Team', description: 'Shared workspace for big teams — up to 50 seats.', price: 245000, paystackPlanCode: 'PLN_xjrq6x5bqdxcctm', maxSeats: 50 },
];

async function ensurePaystackSubscriptionIdentitySchema(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS paystack_subscription_identities (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subscription_code text NOT NULL UNIQUE,
      customer_code text,
      plan_code text,
      status text NOT NULL DEFAULT 'active',
      provider_created_at timestamp,
      retired_at timestamp,
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS paystack_subscription_identities_user_status_idx
    ON paystack_subscription_identities (user_id, status)
  `);
}

function buildTeamFeatures(maxSeats: number): string[] {
  return [
    `Shared team workspace (up to ${maxSeats} seats)`,
    'Centralized billing for your whole team',
    'Unlimited receipt scanning',
    'AI-powered categorization',
    'Smart search & analytics',
    'Tax insights & deductions',
    'Export to PDF & CSV',
    'Cloud storage & sync',
    'Priority customer support',
  ];
}

/**
 * Seed subscription plans for Simple Slips
 * 30-day free trial followed by R49/month subscription
 */
export async function seedSubscriptionPlans() {
  try {
    log('Seeding subscription plans for Simple Slips...', 'billing');

    if (!storage.createSubscriptionPlan) {
      log('Subscription plan creation not supported by current storage', 'billing');
      return;
    }

    // Check if plans already exist
    const existingPlans = await storage.getSubscriptionPlans?.();
    if (existingPlans && existingPlans.length > 0) {
      log('Subscription plans already exist, skipping seeding', 'billing');
      return;
    }

    // Create Free Trial Plan
    const freeTrialPlan = await storage.createSubscriptionPlan({
      name: 'free_trial',
      displayName: '30-Day Free Trial',
      description: 'Try all premium features free for 30 days. Cancel anytime.',
      price: 0, // Free
      currency: 'ZAR',
      billingPeriod: 'trial',
      trialDays: 30,
      googlePlayProductId: 'simple_slips_trial', // This would map to Google Play product
      features: [
        'Unlimited receipt scanning',
        'AI-powered categorization',
        'Smart search & analytics',
        'Tax insights & deductions',
        'Budget tracking & alerts',
        'Export to PDF & CSV',
        'Cloud storage & sync',
        'Mobile app access'
      ],
      isActive: true
    });

    // Create Premium Monthly Plan  
    const premiumMonthlyPlan = await storage.createSubscriptionPlan({
      name: 'premium_monthly',
      displayName: 'Premium Monthly',
      description: 'Full access to all Simple Slips features for R49/month.',
      price: 4900, // R49.00 in cents
      currency: 'ZAR',
      billingPeriod: 'monthly',
      trialDays: 0,
      paystackPlanCode: PAYSTACK_PLAN_CODES.premium_monthly,
      maxSeats: 1,
      googlePlayProductId: 'simple_slips_premium_monthly', // Google Play product ID
      features: [
        'Unlimited receipt scanning',
        'AI-powered categorization',
        'Smart search & analytics', 
        'Tax insights & deductions',
        'Budget tracking & alerts',
        'Export to PDF & CSV',
        'Cloud storage & sync',
        'Priority customer support',
        'Advanced tax reports',
        'Business expense tracking'
      ],
      isActive: true
    });

    // Create Premium Yearly Plan
    const premiumYearlyPlan = await storage.createSubscriptionPlan({
      name: 'premium_yearly',
      displayName: 'Premium Yearly',
      description: 'Full access to all Simple Slips features for R530/year - Save 10%!',
      price: 53000, // R530.00 in cents
      currency: 'ZAR',
      billingPeriod: 'yearly',
      trialDays: 0,
      paystackPlanCode: PAYSTACK_PLAN_CODES.premium_yearly,
      maxSeats: 1,
      googlePlayProductId: 'simple_slips_premium_yearly',
      features: [
        'Unlimited receipt scanning',
        'AI-powered categorization',
        'Smart search & analytics', 
        'Tax insights & deductions',
        'Budget tracking & alerts',
        'Export to PDF & CSV',
        'Cloud storage & sync',
        'Priority customer support',
        'Advanced tax reports',
        'Business expense tracking',
        '10% annual savings'
      ],
      isActive: true
    });

    log(`Successfully created subscription plans:`, 'billing');
    log(`- Free Trial: ${freeTrialPlan.id}`, 'billing');
    log(`- Premium Monthly: ${premiumMonthlyPlan.id}`, 'billing');
    log(`- Premium Yearly: ${premiumYearlyPlan.id}`, 'billing');

    return { freeTrialPlan, premiumMonthlyPlan, premiumYearlyPlan };

  } catch (error) {
    log(`Error seeding subscription plans: ${error}`, 'billing');
    throw error;
  }
}

/**
 * Add yearly plan if it doesn't exist (for existing databases)
 */
export async function ensureYearlyPlanExists() {
  try {
    if (!storage.createSubscriptionPlan || !storage.getSubscriptionPlans) {
      return;
    }

    const existingPlans = await storage.getSubscriptionPlans();
    const hasYearlyPlan = existingPlans?.some(plan => plan.name === 'premium_yearly');

    if (!hasYearlyPlan) {
      log('Adding yearly subscription plan...', 'billing');
      
      const yearlyPlan = await storage.createSubscriptionPlan({
        name: 'premium_yearly',
        displayName: 'Premium Yearly',
        description: 'Full access to all Simple Slips features for R530/year - Save 10%!',
        price: 53000, // R530.00 in cents
        currency: 'ZAR',
        billingPeriod: 'yearly',
        trialDays: 0,
        paystackPlanCode: PAYSTACK_PLAN_CODES.premium_yearly,
        maxSeats: 1,
        googlePlayProductId: 'simple_slips_premium_yearly',
        features: [
          'Unlimited receipt scanning',
          'AI-powered categorization',
          'Smart search & analytics', 
          'Tax insights & deductions',
          'Budget tracking & alerts',
          'Export to PDF & CSV',
          'Cloud storage & sync',
          'Priority customer support',
          'Advanced tax reports',
          'Business expense tracking',
          '10% annual savings'
        ],
        isActive: true
      });

      log(`Added yearly subscription plan: ${yearlyPlan.id}`, 'billing');
    }
  } catch (error) {
    log(`Error ensuring yearly plan exists: ${error}`, 'billing');
  }
}

/**
 * Idempotently create/reconcile the seat-based Team tiers
 * (Lite Team / Medium Team / Large Team / Enterprise Team).
 * - Missing tier  -> inserted with its Paystack plan code, price and max_seats.
 * - Existing tier -> updated when code, price, max_seats, or display_name has drifted.
 * Safe to run on every boot. Solo (premium_monthly, 1 seat) is handled elsewhere.
 */
export async function ensureTeamPlansExist() {
  try {
    if (!storage.createSubscriptionPlan || !storage.getSubscriptionPlans) {
      return;
    }

    const existingPlans = await storage.getSubscriptionPlans();
    const byName = new Map((existingPlans || []).map((p) => [p.name, p]));

    for (const tier of TEAM_PLANS) {
      const existing = byName.get(tier.name);

      if (!existing) {
        const created = await storage.createSubscriptionPlan({
          name: tier.name,
          displayName: tier.displayName,
          description: tier.description,
          price: tier.price,
          currency: 'ZAR',
          billingPeriod: 'monthly',
          trialDays: 0,
          paystackPlanCode: tier.paystackPlanCode,
          maxSeats: tier.maxSeats,
          features: buildTeamFeatures(tier.maxSeats),
          isActive: true,
        });
        log(`Created team plan ${tier.name} (${created.id}, code=${tier.paystackPlanCode}, max_seats=${tier.maxSeats})`, 'billing');
      } else {
        // Reconcile in place — only writes when something actually differs.
        const result: any = await db.execute(sql`
          UPDATE subscription_plans
          SET paystack_plan_code = ${tier.paystackPlanCode},
              max_seats = ${tier.maxSeats},
              price = ${tier.price},
              display_name = ${tier.displayName},
              updated_at = NOW()
          WHERE name = ${tier.name}
            AND (paystack_plan_code IS DISTINCT FROM ${tier.paystackPlanCode}
              OR max_seats IS DISTINCT FROM ${tier.maxSeats}
              OR price IS DISTINCT FROM ${tier.price}
              OR display_name IS DISTINCT FROM ${tier.displayName})
        `);
        if ((result?.rowCount ?? 0) > 0) {
          log(`Reconciled team plan ${tier.name} (code=${tier.paystackPlanCode}, max_seats=${tier.maxSeats}, price=${tier.price})`, 'billing');
        }
      }
    }
  } catch (error) {
    log(`Error ensuring team plans exist: ${error}`, 'billing');
  }
}

/**
 * Idempotently backfill Paystack plan codes + max_seats on existing plan rows.
 * Only writes when the value actually differs, so it is safe to run on every boot.
 */
export async function backfillPlanCodes() {
  try {
    for (const [name, code] of Object.entries(PAYSTACK_PLAN_CODES)) {
      const result: any = await db.execute(sql`
        UPDATE subscription_plans
        SET paystack_plan_code = ${code}, max_seats = 1, updated_at = NOW()
        WHERE name = ${name}
          AND (paystack_plan_code IS DISTINCT FROM ${code} OR max_seats IS DISTINCT FROM 1)
      `);
      const count = result?.rowCount ?? 0;
      if (count > 0) {
        log(`Backfilled Paystack plan code for ${name} (${code}, max_seats=1)`, 'billing');
      }
    }
  } catch (error) {
    log(`Error backfilling plan codes: ${error}`, 'billing');
  }
}

/**
 * Idempotently backfill user_subscriptions.authorization_code from the most recent
 * Paystack payment transaction metadata. Only fills rows where it is currently NULL,
 * and reports any Paystack subscribers whose authorization code is unrecoverable.
 */
export async function backfillAuthorizationCodes() {
  try {
    const updated: any = await db.execute(sql`
      UPDATE user_subscriptions us
      SET authorization_code = recovered.auth_code, updated_at = NOW()
      FROM (
        SELECT DISTINCT ON (pt.user_id)
          pt.user_id,
          pt.metadata->>'authorizationCode' AS auth_code
        FROM payment_transactions pt
        WHERE pt.platform = 'paystack'
          AND pt.metadata->>'authorizationCode' IS NOT NULL
          AND pt.metadata->>'authorizationCode' <> ''
        ORDER BY pt.user_id, pt.created_at DESC
      ) AS recovered
      WHERE us.user_id = recovered.user_id
        AND us.authorization_code IS NULL
    `);
    const recoveredCount = updated?.rowCount ?? 0;

    const unrecoverable: any = await db.execute(sql`
      SELECT us.user_id
      FROM user_subscriptions us
      WHERE us.paystack_reference IS NOT NULL
        AND us.authorization_code IS NULL
    `);
    const unrecoverableRows = unrecoverable?.rows ?? [];

    log(`Authorization-code backfill complete: ${recoveredCount} recovered, ${unrecoverableRows.length} unrecoverable`, 'billing');
    if (unrecoverableRows.length > 0) {
      const ids = unrecoverableRows.map((r: any) => r.user_id).join(', ');
      log(`[REVIEW] Paystack subscribers missing authorization_code (no recoverable code in payment_transactions): user_ids=[${ids}]`, 'billing');
    }
  } catch (error) {
    log(`Error backfilling authorization codes: ${error}`, 'billing');
  }
}

/**
 * Initialize subscription plans on server startup
 */
export async function initializeSubscriptionPlans() {
  // Renewal processing depends on durable SUB_* identity history. Fail startup
  // explicitly if the additive schema cannot be installed instead of silently
  // serving a billing path that will fail later.
  await ensurePaystackSubscriptionIdentitySchema();

  try {
    await seedSubscriptionPlans();
    await ensureYearlyPlanExists(); // Add yearly plan to existing databases
    await ensureTeamPlansExist(); // Create/reconcile seat-based Team tiers
    await backfillPlanCodes(); // Ensure existing plan rows carry Paystack codes + max_seats
    await backfillAuthorizationCodes(); // Recover authorization codes for existing Paystack subscribers
    
    // OPERATIONAL HARDENING: Start orphaned payment monitoring
    // Checks every 5 minutes for payments that didn't create subscriptions
    billingService.startOrphanedPaymentMonitoring(5);
    
    // RECONCILIATION: Query Paystack hourly for overdue renewals
    billingService.startReconciliationMonitoring(1);
    
    // WEBHOOK HEALTH: Monitor Paystack webhook connectivity every 12 hours
    billingService.startWebhookHealthMonitoring(12);
    
    // PAYMENT WARNINGS: Send trial expiry and renewal due warnings (3 days + 1 day before)
    billingService.startPaymentWarningMonitoring(12);

    // AZURE TIER MIGRATION: Move blobs to Hot/Cool/Cold based on receipt age (runs every 24h)
    // Also runs once immediately at startup to backfill all existing blobs
    startTierMigrationMonitoring(24);
    
    log('Subscription plans initialization complete', 'billing');
  } catch (error) {
    log(`Failed to initialize subscription plans: ${error}`, 'billing');
  }
}