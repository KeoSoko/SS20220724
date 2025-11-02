import { 
  DocumentAnalysisClient, 
  AzureKeyCredential,
  AnalyzeResult,
  AnalyzedDocument,
  DocumentField
} from "@azure/ai-form-recognizer";
import { log } from "./vite";

export class AzureFormRecognizer {
  private client: DocumentAnalysisClient;

  constructor() {
    const endpoint = process.env.AZURE_FORM_RECOGNIZER_ENDPOINT;
    const key = process.env.AZURE_FORM_RECOGNIZER_KEY;
    
    if (!endpoint || !key) {
      throw new Error("Azure Form Recognizer credentials not found");
    }
    
    this.client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key));
  }

  /**
   * Analyze a receipt using Azure Document Intelligence
   * @param base64Data Base64 encoded image data (with data URL prefix)
   * @returns Processed receipt data
   */
  async analyzeReceipt(base64Data: string): Promise<{
    storeName: string;
    date: string;
    total: string;
    items: Array<{name: string, price: string}>;
    confidenceScore: string;
  }> {
    try {
      // Remove the data URL prefix and convert to buffer
      const base64Content = base64Data.split(';base64,').pop() || '';
      const buffer = Buffer.from(base64Content, 'base64');

      // Optimize buffer size for better performance
      // Azure Form Recognizer works best with optimized inputs
      log("Processing image for Azure Document Intelligence...", "azure");
      
      // Analyze the receipt with the prebuilt receipt model
      log("Analyzing receipt with Azure Document Intelligence...", "azure");
      // Use the prebuilt receipt model without additional options
      // This avoids any type compatibility issues with the Azure SDK
      const poller = await this.client.beginAnalyzeDocument(
        "prebuilt-receipt", 
        buffer
      );
      
      log("Waiting for Azure analysis to complete...", "azure");
      const result = await poller.pollUntilDone();

      // Extract receipt data from result
      if (!result.documents || result.documents.length === 0) {
        throw new Error("No receipt data found in the image");
      }

      const receipt = result.documents[0];
      log(`Receipt analysis completed with confidence: ${receipt.confidence}`, "azure");
      
      let merchantName = "Unknown Store";
      let dateValue = new Date().toISOString().split('T')[0];
      let totalValue = "0.00";
      
      // Extract fields - using type checking to safely access properties
      if (receipt.fields) {
        // Get merchant name
        const merchantField = receipt.fields.MerchantName;
        if (merchantField && this.hasValue(merchantField)) {
          merchantName = String(merchantField.content || merchantName);
        }
        
        // Get date
        const dateField = receipt.fields.TransactionDate;
        if (dateField && this.hasValue(dateField)) {
          // Try to parse and format the extracted date correctly
          try {
            // Try to access value as a date if available
            // Using "as any" because the Azure SDK type definitions might not be complete
            const anyDateField = dateField as any;
            if (anyDateField.valueDate) {
              const date = new Date(anyDateField.valueDate);
              if (!isNaN(date.getTime())) {
                // Explicitly set hours to noon to avoid timezone issues
                date.setHours(12, 0, 0, 0);
                // Format as DD/MM/YYYY for South Africa - using full year for clarity
                const day = date.getDate().toString().padStart(2, '0');
                const month = (date.getMonth() + 1).toString().padStart(2, '0');
                const year = date.getFullYear();
                // Store the date in ISO format YYYY-MM-DD for consistent storage and processing
                dateValue = `${year}-${month}-${day}`;
                log(`Formatted date from valueDate: ${dateValue}`, "azure");
              }
            } 
            // Fall back to the content string if valueDate is not available
            else if (dateField.content) {
              const dateStr = String(dateField.content);
              
              // First try to match if it's in DD/MM/YYYY or DD/MM/YY format (South African)
              const saDateRegex = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2}|\d{4})$/;
              const saMatch = dateStr.match(saDateRegex);
              
              if (saMatch) {
                // We have a date in SA format
                let [_, day, month, year] = saMatch;
                // Pad with leading zeros
                day = day.padStart(2, '0');
                month = month.padStart(2, '0');
                
                // Convert 2-digit year to 4-digit
                if (year.length === 2) {
                  const currentYear = new Date().getFullYear().toString();
                  const century = currentYear.substring(0, 2);
                  year = `${century}${year}`;
                }
                
                // Store as ISO format YYYY-MM-DD
                dateValue = `${year}-${month}-${day}`;
                log(`Parsed SA format date: ${dateValue}`, "azure");
              } else {
                // Try to parse as ISO or US date
                const date = new Date(dateStr);
                if (!isNaN(date.getTime())) {
                  date.setHours(12, 0, 0, 0); // Set to noon to avoid timezone issues
                  // Convert to ISO format YYYY-MM-DD
                  const isoDate = date.toISOString().split('T')[0];
                  dateValue = isoDate;
                  log(`Parsed standard date format: ${dateValue}`, "azure");
                } else {
                  // Default to today's date in ISO format
                  const today = new Date();
                  today.setHours(12, 0, 0, 0);
                  dateValue = today.toISOString().split('T')[0];
                  log(`Using default date: ${dateValue}`, "azure");
                }
              }
            }
          } catch (e) {
            // If date parsing fails, use today's date in ISO format
            const today = new Date();
            today.setHours(12, 0, 0, 0);
            dateValue = today.toISOString().split('T')[0];
            log(`Error parsing receipt date: ${e}, using default: ${dateValue}`, "azure");
          }
        }
        
        // Get total
        const totalField = receipt.fields.Total;
        if (totalField && this.hasValue(totalField)) {
          // Get the raw total value as string
          const rawTotal = String(totalField.content || totalValue);
          
          // Clean and standardize the number format - remove currency symbols, commas, etc.
          // Keep only digits, decimal point, and minus sign for negative values
          const cleanedTotal = rawTotal.replace(/[^\d.-]/g, '');
          
          // Ensure we have a valid number - default to "0.00" if parsing fails
          try {
            const numValue = parseFloat(cleanedTotal);
            if (!isNaN(numValue)) {
              // Store as string with 2 decimal places, no commas
              totalValue = numValue.toFixed(2);
            } else {
              totalValue = "0.00";
            }
          } catch (e) {
            totalValue = "0.00";
          }
          
          log(`Processed total value: raw=${rawTotal}, cleaned=${cleanedTotal}, final=${totalValue}`, "azure");
        }
      }
      
      // Extract items
      const itemsArray: Array<{name: string, price: string}> = [];
      
      // Try to extract items from the result
      if (receipt.fields && receipt.fields.Items) {
        try {
          // Safely extract items using any type to bypass strict type checking
          // This is necessary because the API response structure might vary
          const anyItems = receipt.fields.Items as any;
          
          if (anyItems && Array.isArray(anyItems.values)) {
            const items = anyItems.values;
            
            for (const item of items) {
              if (item && typeof item === 'object') {
                const name = item.Description?.content || "Unknown Item";
                let price = "0.00";
                
                // Try different price fields in order of preference
                let rawPrice = "";
                if (item.Price?.content) {
                  rawPrice = String(item.Price.content);
                } else if (item.TotalPrice?.content) {
                  rawPrice = String(item.TotalPrice.content);
                } else if (item.Amount?.content) {
                  rawPrice = String(item.Amount.content);
                } else if (item.SubTotal?.content) {
                  rawPrice = String(item.SubTotal.content);
                }
                
                // Clean up price string - remove non-numeric characters except decimal point
                const cleanedPrice = rawPrice.replace(/[^\d.-]/g, '');
                
                // Convert to standard number format
                try {
                  const numValue = parseFloat(cleanedPrice);
                  if (!isNaN(numValue)) {
                    // Store as string with 2 decimal places, no commas
                    price = numValue.toFixed(2);
                  } else {
                    price = "0.00";
                  }
                } catch (e) {
                  price = "0.00";
                }
                
                // Add items even with 0 price for now - we'll filter later
                itemsArray.push({ 
                  name: String(name), 
                  price: price
                });
                
                // Log extraction for debugging
                log(`Processed item price: raw=${rawPrice}, cleaned=${cleanedPrice}, final=${price}`, "azure");
              }
            }
          }
        } catch (itemError) {
          log(`Error extracting items: ${itemError}`, "azure");
          // Continue processing
        }
      }
      
      // Try alternative item extraction method if main method didn't work well
      // This uses raw text analysis for receipts that don't have structured items
      if (itemsArray.length === 0 || itemsArray.every(item => parseFloat(item.price) === 0)) {
        log(`No valid items found with primary method, trying alternative extraction`, "azure");
        try {
          // See if we can find items in the raw document text
          const lineItems = this.extractLineItemsFromText(receipt);
          if (lineItems.length > 0) {
            log(`Found ${lineItems.length} items using text extraction`, "azure");
            itemsArray.splice(0, itemsArray.length, ...lineItems);
          }
        } catch (textError) {
          log(`Error in text-based item extraction: ${textError}`, "azure");
        }
      }
      
      // Filter out items with zero prices
      const validItems = itemsArray.filter(item => parseFloat(item.price) > 0);
      
      // If no valid items were found, create a dummy item with the total
      if (validItems.length === 0) {
        log(`No valid items found, creating a single item with the total`, "azure");
        validItems.push({ name: "Item", price: String(totalValue) });
      }
      
      // Return the valid items
      const finalItems = validItems;

      return {
        storeName: String(merchantName),
        date: String(dateValue),
        total: String(totalValue),
        items: finalItems,
        confidenceScore: String(receipt.confidence || 0)
      };
    } catch (error) {
      log(`Error analyzing receipt: ${error}`, "azure");
      throw error;
    }
  }
  
  // Helper method to check if a field has a value property
  private hasValue(field: DocumentField): boolean {
    return field !== undefined && field !== null && 'content' in field;
  }
  
  /**
   * Extract line items from raw document text when structured extraction fails
   * This is a fallback method when the Azure API doesn't properly structure the line items
   * @param receipt The receipt document object from Azure Form Recognizer
   * @returns Array of item objects with name and price
   */
  private extractLineItemsFromText(receipt: any): Array<{name: string, price: string}> {
    const extractedItems: Array<{name: string, price: string}> = [];
    
    try {
      // Get the document text if available
      if (!receipt.content) {
        return extractedItems;
      }
      
      const text = receipt.content;
      const lines = text.split('\n');
      
      // Look for patterns that resemble line items (product + price)
      // This regex matches a line that ends with a price pattern
      // The price pattern is: optional currency symbol, digits, optional decimal point, optional digits
      const itemLineRegex = /^(.+)\s+(R?\$?\s*\d+\.?\d*|\d+\.?\d*\s*R?\$?)$/;
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Skip short lines, likely not items
        if (trimmedLine.length < 5) continue;
        
        // Skip lines that are likely headers or footers
        const lowerLine = trimmedLine.toLowerCase();
        if (lowerLine.includes('total') || 
            lowerLine.includes('subtotal') || 
            lowerLine.includes('tax') || 
            lowerLine.includes('amount due') || 
            lowerLine.includes('balance') ||
            lowerLine.includes('thank you')) {
          continue;
        }
        
        // Try to match the line item pattern
        const match = trimmedLine.match(itemLineRegex);
        if (match) {
          const [_, nameText, priceText] = match;
          
          // Clean the price: remove currency symbols, spaces, etc.
          const cleanPrice = priceText.replace(/[^\d.-]/g, '');
          
          // Only process if we have a valid number
          if (!isNaN(parseFloat(cleanPrice)) && parseFloat(cleanPrice) > 0) {
            extractedItems.push({
              name: nameText.trim(),
              price: cleanPrice
            });
            
            log(`Text extraction found item: ${nameText.trim()} - ${cleanPrice}`, "azure");
          }
        }
      }
    } catch (error) {
      log(`Error in text-based item extraction: ${error}`, "azure");
    }
    
    return extractedItems;
  }
}

// Export a singleton instance
export const azureFormRecognizer = new AzureFormRecognizer();