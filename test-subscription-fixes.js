#!/usr/bin/env node

/**
 * Test script to verify subscription and authentication fixes
 * Run this after starting the server to test the fixes
 */

const fetch = require('node-fetch');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

async function testSubscriptionEndpoints() {
  console.log('🧪 Testing Subscription and Authentication Fixes\n');

  try {
    // Test 1: Check if subscription plans are seeded
    console.log('1. Testing subscription plans endpoint...');
    const plansResponse = await fetch(`${BASE_URL}/api/billing/plans`);
    if (plansResponse.ok) {
      const plansData = await plansResponse.json();
      console.log('✅ Subscription plans endpoint working');
      console.log(`   Found ${plansData.plans?.length || 0} plans`);
      if (plansData.plans?.length > 0) {
        console.log(`   Plans: ${plansData.plans.map(p => p.name).join(', ')}`);
      }
    } else {
      console.log('❌ Subscription plans endpoint failed:', plansResponse.status);
    }

    // Test 2: Test subscription status endpoint (should return 401 without auth)
    console.log('\n2. Testing subscription status endpoint (no auth)...');
    const statusResponse = await fetch(`${BASE_URL}/api/subscription/status`);
    if (statusResponse.status === 401) {
      console.log('✅ Subscription status endpoint properly requires authentication');
    } else {
      console.log('❌ Subscription status endpoint should require authentication');
    }

    // Test 3: Test server health
    console.log('\n3. Testing server health...');
    const healthResponse = await fetch(`${BASE_URL}/api/storage/metrics`);
    if (healthResponse.ok) {
      console.log('✅ Server is running and responding');
    } else {
      console.log('❌ Server health check failed:', healthResponse.status);
    }

    console.log('\n🎉 Basic tests completed!');
    console.log('\n📋 Next steps:');
    console.log('1. Register a new user to test automatic trial start');
    console.log('2. Login and check subscription status');
    console.log('3. Test receipt upload with subscription checks');
    console.log('4. Test subscription upgrade flow');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 Make sure the server is running on', BASE_URL);
  }
}

// Run the tests
testSubscriptionEndpoints();


