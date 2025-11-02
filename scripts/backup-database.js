#!/usr/bin/env node

/**
 * Simple database backup script for Simple Slips
 * Run this regularly to export your data as JSON
 */

import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function backupDatabase() {
  const timestamp = new Date().toISOString().split('T')[0];
  const backupDir = './backups';
  
  // Create backup directory if it doesn't exist
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  try {
    console.log('🔄 Starting database backup...');
    
    // Backup users (without passwords for security)
    const users = await pool.query('SELECT id, username, email, full_name, created_at FROM users');
    
    // Backup receipts
    const receipts = await pool.query('SELECT * FROM receipts');
    
    // Backup budgets
    const budgets = await pool.query('SELECT * FROM budgets');
    
    // Create backup object
    const backup = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      data: {
        users: users.rows,
        receipts: receipts.rows,
        budgets: budgets.rows
      },
      stats: {
        userCount: users.rows.length,
        receiptCount: receipts.rows.length,
        budgetCount: budgets.rows.length
      }
    };
    
    // Write backup file
    const filename = `backup-${timestamp}.json`;
    const filepath = path.join(backupDir, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(backup, null, 2));
    
    console.log(`✅ Backup completed successfully!`);
    console.log(`📁 File: ${filepath}`);
    console.log(`📊 Stats: ${backup.stats.userCount} users, ${backup.stats.receiptCount} receipts, ${backup.stats.budgetCount} budgets`);
    
  } catch (error) {
    console.error('❌ Backup failed:', error.message);
  } finally {
    await pool.end();
  }
}

// Run backup
backupDatabase();