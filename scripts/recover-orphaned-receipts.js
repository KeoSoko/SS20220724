#!/usr/bin/env node

/**
 * Recovery script for orphaned Azure receipt images
 * This helps reconnect Azure images to database records
 */

import { BlobServiceClient } from "@azure/storage-blob";
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const CONTAINER_NAME = "receipt-images";

async function recoverOrphanedReceipts() {
  try {
    console.log('🔄 Starting receipt recovery process...');
    
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
    
    // Get all orphaned blobs
    const orphanedImages = [];
    for await (const blob of containerClient.listBlobsFlat()) {
      // Check if this blob is referenced in database
      const result = await pool.query(
        'SELECT id FROM receipts WHERE blob_name = $1 OR blob_url LIKE $2',
        [blob.name, `%${blob.name}%`]
      );
      
      if (result.rows.length === 0) {
        orphanedImages.push({
          name: blob.name,
          url: `https://${blobServiceClient.accountName}.blob.core.windows.net/${CONTAINER_NAME}/${blob.name}`,
          lastModified: blob.properties.lastModified,
          size: blob.properties.contentLength
        });
      }
    }
    
    console.log(`📊 Found ${orphanedImages.length} orphaned receipt images`);
    
    if (orphanedImages.length > 0) {
      console.log('\n🔍 Orphaned Images:');
      orphanedImages.forEach((img, index) => {
        console.log(`${index + 1}. ${img.name}`);
        console.log(`   URL: ${img.url}`);
        console.log(`   Date: ${img.lastModified?.toISOString() || 'Unknown'}`);
        console.log(`   Size: ${(img.size / 1024).toFixed(1)} KB\n`);
      });
      
      console.log('💡 Recovery Options:');
      console.log('1. These images can be re-processed through the app');
      console.log('2. Users can re-upload them to recreate database entries');
      console.log('3. The images are safely preserved in Azure storage');
    }
    
  } catch (error) {
    console.error('❌ Recovery check failed:', error.message);
  } finally {
    await pool.end();
  }
}

recoverOrphanedReceipts();