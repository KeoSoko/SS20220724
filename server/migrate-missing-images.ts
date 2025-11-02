import { log } from "./vite";
import { storage } from "./storage";
import { azureStorage } from "./azure-storage";
import fs from 'fs/promises';
import path from 'path';

/**
 * Migration script to handle missing image files
 * This will check for receipts with missing images and handle them appropriately
 */
export async function migrateMissingImages() {
  try {
    log('Starting missing image migration...', 'migration');
    
    // Get all receipts for the user
    const receipts = await storage.getReceiptsByUser(7); // KeoraSoko's user ID
    let fixedCount = 0;
    let missingCount = 0;
    
    for (const receipt of receipts) {
      if (!receipt.blobName) {
        log(`Receipt ${receipt.id} has no blob_name, skipping...`, 'migration');
        continue;
      }
      
      // Check if local file exists
      const localPath = path.join('uploads', 'receipts', receipt.blobName);
      
      try {
        // Check if local file exists
        await fs.access(localPath);
        log(`Local file exists for receipt ${receipt.id}: ${receipt.blobName}`, 'migration');
        
        // Try to upload to Azure
        try {
          const fileBuffer = await fs.readFile(localPath);
          const base64Data = `data:image/jpeg;base64,${fileBuffer.toString('base64')}`;
          
          const azureResult = await azureStorage.uploadFile(base64Data, receipt.blobName);
          
          // Update database with Azure URL
          await storage.updateReceipt(receipt.id, {
            blobUrl: azureResult.blobUrl
          });
          
          log(`Successfully migrated receipt ${receipt.id} to Azure: ${azureResult.blobUrl}`, 'migration');
          fixedCount++;
          
        } catch (azureError) {
          log(`Failed to upload receipt ${receipt.id} to Azure: ${azureError}`, 'migration');
        }
        
      } catch (localError) {
        // Local file doesn't exist
        log(`Missing local file for receipt ${receipt.id}: ${receipt.blobName}`, 'migration');
        missingCount++;
        
        // Mark as missing in database or create placeholder
        await storage.updateReceipt(receipt.id, {
          blobUrl: null,
          notes: (receipt.notes || '') + ' [IMAGE MISSING - Please re-upload]'
        });
      }
    }
    
    log(`Migration complete: Fixed ${fixedCount}, Missing ${missingCount}`, 'migration');
    
  } catch (error) {
    log(`Error during migration: ${error}`, 'migration');
  }
}