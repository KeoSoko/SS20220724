import { azureStorage } from '../server/azure-storage';
import { db } from '../server/db';
import { receipts } from '../shared/schema';
import { log } from '../server/vite';

/**
 * Migrate receipt images from old storage account to new one
 * This script downloads images from the old URLs and re-uploads them to the current storage account
 */
async function migrateImages() {
  try {
    log("Starting image migration process...", "migration");
    
    // Get all receipts with blob URLs pointing to old storage account
    const receiptsToMigrate = await db.select().from(receipts).where(
      // Using SQL LIKE to find receipts with old storage account URLs
      sql`blob_url LIKE '%slipsstor1%'`
    );
    
    log(`Found ${receiptsToMigrate.length} receipts to migrate`, "migration");
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const receipt of receiptsToMigrate) {
      try {
        if (!receipt.blobUrl || !receipt.blobName) {
          log(`Skipping receipt ${receipt.id}: missing blob info`, "migration");
          continue;
        }
        
        log(`Migrating receipt ${receipt.id}: ${receipt.blobName}`, "migration");
        
        // Download the image from the old URL
        const response = await fetch(receipt.blobUrl);
        if (!response.ok) {
          log(`Failed to download image for receipt ${receipt.id}: ${response.status}`, "migration");
          errorCount++;
          continue;
        }
        
        // Convert to base64
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Data = `data:image/jpeg;base64,${buffer.toString('base64')}`;
        
        // Upload to new storage account
        const { blobUrl: newBlobUrl, blobName: newBlobName } = await azureStorage.uploadFile(
          base64Data,
          receipt.blobName
        );
        
        // Update the receipt with new URLs
        await db.update(receipts)
          .set({
            blobUrl: newBlobUrl,
            blobName: newBlobName
          })
          .where(eq(receipts.id, receipt.id));
        
        log(`Successfully migrated receipt ${receipt.id}`, "migration");
        successCount++;
        
      } catch (error) {
        log(`Error migrating receipt ${receipt.id}: ${error}`, "migration");
        errorCount++;
      }
    }
    
    log(`Migration complete: ${successCount} successful, ${errorCount} errors`, "migration");
    
  } catch (error) {
    log(`Migration failed: ${error}`, "migration");
    throw error;
  }
}

// Import required functions
import { sql, eq } from 'drizzle-orm';

// Run migration if called directly
if (require.main === module) {
  migrateImages()
    .then(() => {
      log("Image migration completed successfully", "migration");
      process.exit(0);
    })
    .catch((error) => {
      log(`Image migration failed: ${error}`, "migration");
      process.exit(1);
    });
}

export { migrateImages };