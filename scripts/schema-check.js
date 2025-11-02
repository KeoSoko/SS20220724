#!/usr/bin/env node

/**
 * Schema validation script to prevent database mismatches
 * Run this before deploying changes
 */

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Expected columns for receipts table based on current schema
const expectedColumns = [
  'id', 'user_id', 'store_name', 'date', 'total', 'items', 'blob_url', 
  'blob_name', 'image_data', 'category', 'subcategory', 'tags', 'notes', 
  'is_recurring', 'frequency', 'payment_method', 'confidence_score', 
  'raw_ocr_data', 'latitude', 'longitude', 'budget_category', 
  'is_tax_deductible', 'tax_category', 'created_at', 'updated_at', 'processed_at'
];

async function checkSchema() {
  try {
    console.log('🔍 Checking database schema...');
    
    // Get current columns
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'receipts' 
      ORDER BY ordinal_position
    `);
    
    const actualColumns = result.rows.map(row => row.column_name);
    
    // Find missing columns
    const missingColumns = expectedColumns.filter(col => !actualColumns.includes(col));
    
    // Find extra columns
    const extraColumns = actualColumns.filter(col => !expectedColumns.includes(col));
    
    console.log(`📊 Schema Check Results:`);
    console.log(`   Current columns: ${actualColumns.length}`);
    console.log(`   Expected columns: ${expectedColumns.length}`);
    
    if (missingColumns.length > 0) {
      console.log(`❌ Missing columns: ${missingColumns.join(', ')}`);
    }
    
    if (extraColumns.length > 0) {
      console.log(`⚠️  Extra columns: ${extraColumns.join(', ')}`);
    }
    
    if (missingColumns.length === 0 && extraColumns.length === 0) {
      console.log(`✅ Schema is up to date!`);
    }
    
  } catch (error) {
    console.error('❌ Schema check failed:', error.message);
  } finally {
    await pool.end();
  }
}

checkSchema();