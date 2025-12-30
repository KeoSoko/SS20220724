import { db } from "./db";
import { receipts } from "@shared/schema";
import { convertPdfToImage, isPdfData } from "./pdf-converter";
import { eq, like, sql } from "drizzle-orm";

async function migratePdfReceipts() {
  console.log("Starting PDF receipt migration...");
  
  try {
    const pdfReceipts = await db
      .select({
        id: receipts.id,
        storeName: receipts.storeName,
        imageData: receipts.imageData
      })
      .from(receipts)
      .where(sql`${receipts.imageData} LIKE 'data:application/pdf%'`);
    
    console.log(`Found ${pdfReceipts.length} PDF receipts to migrate`);
    
    for (const receipt of pdfReceipts) {
      if (!receipt.imageData || !isPdfData(receipt.imageData)) {
        console.log(`Skipping receipt ${receipt.id} - not a PDF`);
        continue;
      }
      
      try {
        console.log(`Converting receipt ${receipt.id} (${receipt.storeName})...`);
        const imageData = await convertPdfToImage(receipt.imageData);
        
        await db
          .update(receipts)
          .set({ imageData })
          .where(eq(receipts.id, receipt.id));
        
        console.log(`Successfully converted receipt ${receipt.id}`);
      } catch (error) {
        console.error(`Failed to convert receipt ${receipt.id}:`, error);
      }
    }
    
    console.log("PDF receipt migration complete!");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
}

migratePdfReceipts()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
