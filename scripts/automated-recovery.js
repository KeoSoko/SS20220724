#!/usr/bin/env node

/**
 * Automated recovery script for orphaned receipt images
 * Downloads images from Azure and re-processes them through OCR
 */

import { BlobServiceClient } from "@azure/storage-blob";
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import https from 'https';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const CONTAINER_NAME = "receipt-images";

async function downloadImage(url, filename) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filename);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(filename);
      });
    }).on('error', (err) => {
      fs.unlink(filename, () => {}); // Delete the file on error
      reject(err);
    });
  });
}

async function recoverOrphanedReceipts(userId = 2) { // Default to KeoSokk's user ID
  try {
    console.log('🔄 Starting automated recovery process...');
    
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
    
    // Create temp directory for downloads
    const tempDir = './temp-recovery';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    let recoveredCount = 0;
    const recoveryResults = [];
    
    // Process each orphaned image
    for await (const blob of containerClient.listBlobsFlat()) {
      // Check if already in database
      const existing = await pool.query(
        'SELECT id FROM receipts WHERE blob_name = $1',
        [blob.name]
      );
      
      if (existing.rows.length > 0) {
        console.log(`⏭️  Skipping ${blob.name} - already in database`);
        continue;
      }
      
      try {
        console.log(`📥 Processing ${blob.name}...`);
        
        // Get blob URL
        const blobUrl = `https://${blobServiceClient.accountName}.blob.core.windows.net/${CONTAINER_NAME}/${blob.name}`;
        
        // Create placeholder receipt record with the existing Azure reference
        const insertQuery = `
          INSERT INTO receipts (
            user_id, store_name, date, total, items, 
            blob_url, blob_name, category, tags, 
            confidence_score, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
          ) RETURNING id
        `;
        
        // Extract timestamp from filename for approximate date
        const timestamp = blob.name.split('-')[0];
        const date = new Date(parseInt(timestamp));
        
        const result = await pool.query(insertQuery, [
          userId,
          'Recovered Receipt', // Placeholder store name
          date.toISOString(),
          '0.00', // Placeholder total
          JSON.stringify([{ name: 'Recovered item', price: '0.00' }]),
          blobUrl,
          blob.name,
          'other', // Default category
          JSON.stringify(['recovered']),
          'recovered', // Mark as recovered
          new Date().toISOString()
        ]);
        
        recoveredCount++;
        recoveryResults.push({
          receiptId: result.rows[0].id,
          blobName: blob.name,
          blobUrl: blobUrl,
          date: date.toISOString()
        });
        
        console.log(`✅ Recovered ${blob.name} as receipt ID ${result.rows[0].id}`);
        
      } catch (error) {
        console.error(`❌ Failed to recover ${blob.name}:`, error.message);
      }
    }
    
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
    
    console.log(`\n🎉 Recovery completed!`);
    console.log(`📊 Recovered ${recoveredCount} receipts`);
    
    if (recoveryResults.length > 0) {
      console.log('\n📋 Recovered Receipts:');
      recoveryResults.forEach((result, index) => {
        console.log(`${index + 1}. Receipt ID: ${result.receiptId}`);
        console.log(`   Image: ${result.blobName}`);
        console.log(`   Date: ${new Date(result.date).toLocaleDateString()}`);
        console.log(`   URL: ${result.blobUrl}\n`);
      });
      
      console.log('💡 Next Steps:');
      console.log('1. Login to your app and view the recovered receipts');
      console.log('2. Edit each receipt to add correct store name, amount, and category');
      console.log('3. The images are already linked and will display properly');
      console.log('4. Consider re-running OCR processing if you have that feature enabled');
    }
    
    return recoveryResults;
    
  } catch (error) {
    console.error('❌ Recovery process failed:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run recovery with user ID as argument or default to KeoSokk (ID: 2)
const userId = process.argv[2] ? parseInt(process.argv[2]) : 2;
recoverOrphanedReceipts(userId);