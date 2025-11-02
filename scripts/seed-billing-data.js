const { db } = require('../server/db');
const { subscriptionPlans } = require('../shared/schema');

async function seedBillingData() {
  try {
    console.log('Seeding billing data...');
    
    // Check if data already exists
    const existingPlans = await db.select().from(subscriptionPlans);
    
    if (existingPlans.length > 0) {
      console.log('Billing data already exists, skipping seed.');
      return;
    }

    // Insert subscription plans
    const plans = [
      {
        name: 'Free Trial',
        description: '7-day free trial with access to all premium features',
        price: 0.00,
        currency: 'ZAR',
        billingInterval: 'trial',
        features: [
          'Unlimited receipt scanning',
          'AI-powered categorization',
          'Advanced analytics',
          'Tax insights',
          'Export to PDF/Excel',
          'Cloud backup'
        ],
        googlePlayProductId: 'simple_slips_trial',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        name: 'Simple Slips Pro',
        description: 'Full access to all premium features for small businesses and individuals',
        price: 99.00,
        currency: 'ZAR',
        billingInterval: 'month',
        features: [
          'Unlimited receipt scanning',
          'AI-powered categorization',
          'Advanced analytics',
          'Tax insights and recommendations',
          'Export to PDF/Excel',
          'Cloud backup and sync',
          'Priority support',
          'Custom categories',
          'Recurring expense detection',
          'Multi-device access'
        ],
        googlePlayProductId: 'simple_slips_pro_monthly',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    await db.insert(subscriptionPlans).values(plans);
    console.log('Successfully seeded billing data with', plans.length, 'subscription plans');
    
  } catch (error) {
    console.error('Error seeding billing data:', error);
    throw error;
  }
}

// Run the seed function if this script is executed directly
if (require.main === module) {
  seedBillingData()
    .then(() => {
      console.log('Billing data seeding completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Billing data seeding failed:', error);
      process.exit(1);
    });
}

module.exports = { seedBillingData };