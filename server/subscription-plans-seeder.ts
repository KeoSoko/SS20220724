import { storage } from "./storage";
import { log } from "./vite";

/**
 * Seed subscription plans for Simple Slips
 * 7-day free trial followed by R99/month subscription
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
      displayName: '7-Day Free Trial',
      description: 'Try all premium features free for 7 days. Cancel anytime.',
      price: 0, // Free
      currency: 'ZAR',
      billingPeriod: 'trial',
      trialDays: 7,
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
      description: 'Full access to all Simple Slips features for R99/month.',
      price: 9900, // R99.00 in cents
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

    log(`Successfully created subscription plans:`, 'billing');
    log(`- Free Trial: ${freeTrialPlan.id}`, 'billing');
    log(`- Premium Monthly: ${premiumMonthlyPlan.id}`, 'billing');

    return { freeTrialPlan, premiumMonthlyPlan };

  } catch (error) {
    log(`Error seeding subscription plans: ${error}`, 'billing');
    throw error;
  }
}

/**
 * Initialize subscription plans on server startup
 */
export async function initializeSubscriptionPlans() {
  try {
    await seedSubscriptionPlans();
    log('Subscription plans initialization complete', 'billing');
  } catch (error) {
    log(`Failed to initialize subscription plans: ${error}`, 'billing');
  }
}