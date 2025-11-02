#!/usr/bin/env node

/**
 * Script to check Azure storage for orphaned receipt data
 */

import { BlobServiceClient } from "@azure/storage-blob";

const CONTAINER_NAME = "receipt-images";

async function checkAzureData() {
  try {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    
    if (!connectionString) {
      console.log('❌ No Azure connection string found');
      return;
    }

    console.log('🔍 Checking Azure Storage for receipt data...');
    
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
    
    // Check if container exists
    const containerExists = await containerClient.exists();
    console.log(`📦 Container "${CONTAINER_NAME}" exists:`, containerExists);
    
    if (!containerExists) {
      console.log('⚠️  Container does not exist - no receipt images stored yet');
      return;
    }
    
    // List all blobs
    let blobCount = 0;
    let totalSize = 0;
    const blobs = [];
    
    for await (const blob of containerClient.listBlobsFlat()) {
      blobCount++;
      totalSize += blob.properties.contentLength || 0;
      blobs.push({
        name: blob.name,
        size: blob.properties.contentLength,
        lastModified: blob.properties.lastModified,
        contentType: blob.properties.contentType
      });
    }
    
    console.log(`📊 Found ${blobCount} files in Azure storage`);
    console.log(`💾 Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
    
    if (blobs.length > 0) {
      console.log('\n📁 Files found:');
      blobs.forEach(blob => {
        console.log(`   ${blob.name} (${(blob.size / 1024).toFixed(1)} KB, ${blob.lastModified?.toISOString() || 'no date'})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error checking Azure storage:', error.message);
  }
}

checkAzureData();