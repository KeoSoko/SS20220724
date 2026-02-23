import { storage } from "./storage";
import { log } from "./vite";
import { billingService } from "./billing-service";

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
 * Initialize subscription plans on server startup
 */
export async function initializeSubscriptionPlans() {
  try {
    await seedSubscriptionPlans();
    await ensureYearlyPlanExists(); // Add yearly plan to existing databases
    
    // OPERATIONAL HARDENING: Start orphaned payment monitoring
    // Checks every 5 minutes for payments that didn't create subscriptions
    billingService.startOrphanedPaymentMonitoring(5);
    
    // RECONCILIATION: Check for overdue subscription renewals every 24 hours
    billingService.startReconciliationMonitoring(24);
    
    // WEBHOOK HEALTH: Monitor Paystack webhook connectivity every 12 hours
    billingService.startWebhookHealthMonitoring(12);
    
    log('Subscription plans initialization complete', 'billing');
  } catch (error) {
    log(`Failed to initialize subscription plans: ${error}`, 'billing');
  }
}