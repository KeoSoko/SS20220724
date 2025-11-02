import OpenAI from "openai";
import { EXPENSE_CATEGORIES, EXPENSE_SUBCATEGORIES, type ExpenseCategory } from "../shared/schema.js";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

export interface ReceiptCategorizationResult {
  category: ExpenseCategory;
  subcategory?: string;
  confidence: number;
  reasoning: string;
  suggestedTags: string[];
  isTaxDeductible: boolean;
  taxCategory?: string;
}

export interface DuplicateDetectionResult {
  isDuplicate: boolean;
  similarity: number;
  reasoning: string;
  duplicateReceiptId?: number;
}

export class AICategorizationService {
  /**
   * Categorize a receipt using AI analysis
   */
  async categorizeReceipt(
    storeName: string,
    items: Array<{name: string, price: string}>,
    total: string,
    existingCategory?: string
  ): Promise<ReceiptCategorizationResult> {
    try {
      const prompt = `
Analyze this South African receipt and categorize it accurately:

Store: ${storeName}
Total: R${total}
Items: ${items.map(item => `${item.name} - R${item.price}`).join(', ')}

Available categories: ${EXPENSE_CATEGORIES.join(', ')}

South African Store Recognition Guide:
- Pick n Pay, Woolworths, Checkers, Spar, Shoprite, Food Lovers Market, Makro = groceries
- Steers, KFC, Nandos, McDonald's, Burger King, Wimpy = dining
- Shell, BP, Caltex, Engen, Sasol = transportation (fuel)
- Vodacom, MTN, Cell C, Telkom, Rain = telecommunications
- Eskom, Municipal services = utilities
- Discovery, Momentum, Old Mutual, Santam, Outsurance = insurance
- FNB, Standard Bank, ABSA, Nedbank, Capitec = banking_fees
- Game, Makro, Builders Warehouse, Dis-Chem, Clicks = shopping
- Virgin Active, Planet Fitness = personal_care

Provide categorization with the following considerations:
1. Choose the most appropriate category from the available options
2. Use South African store knowledge for accurate categorization
3. Suggest a subcategory if applicable
4. Provide confidence score (0-1)
5. Suggest relevant tags for filtering
5. Determine if this could be tax-deductible
6. If tax-deductible, suggest tax category

Respond in JSON format: {
  "category": "category_name",
  "subcategory": "subcategory_name",
  "confidence": 0.95,
  "reasoning": "Brief explanation",
  "suggestedTags": ["tag1", "tag2"],
  "isTaxDeductible": false,
  "taxCategory": "business_expense"
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert financial categorization assistant. Analyze receipts and provide accurate categorization for expense tracking."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1, // Low temperature for consistent categorization
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      
      // Validate and sanitize the response
      return {
        category: EXPENSE_CATEGORIES.includes(result.category) ? result.category : "other",
        subcategory: result.subcategory || undefined,
        confidence: Math.min(Math.max(result.confidence || 0.5, 0), 1),
        reasoning: result.reasoning || "AI categorization",
        suggestedTags: Array.isArray(result.suggestedTags) ? result.suggestedTags : [],
        isTaxDeductible: Boolean(result.isTaxDeductible),
        taxCategory: result.isTaxDeductible ? result.taxCategory : undefined,
      };
    } catch (error) {
      console.error("AI categorization failed:", error);
      // Fallback to basic categorization
      return this.fallbackCategorization(storeName, items);
    }
  }

  /**
   * Detect if a receipt is a duplicate of existing receipts
   */
  async detectDuplicate(
    newReceipt: {
      storeName: string;
      items: Array<{name: string, price: string}>;
      total: string;
      date: Date;
    },
    existingReceipts: Array<{
      id: number;
      storeName: string;
      items: Array<{name: string, price: string}>;
      total: string;
      date: Date;
    }>
  ): Promise<DuplicateDetectionResult> {
    try {
      // Filter to recent receipts from the same store to reduce API costs
      const relevantReceipts = existingReceipts.filter(receipt => {
        const daysDifference = Math.abs(
          (newReceipt.date.getTime() - receipt.date.getTime()) / (1000 * 60 * 60 * 24)
        );
        return daysDifference <= 7 && receipt.storeName.toLowerCase() === newReceipt.storeName.toLowerCase();
      });

      if (relevantReceipts.length === 0) {
        return {
          isDuplicate: false,
          similarity: 0,
          reasoning: "No similar receipts found"
        };
      }

      const prompt = `
Compare this new receipt with existing receipts to detect duplicates:

NEW RECEIPT:
Store: ${newReceipt.storeName}
Date: ${newReceipt.date.toISOString()}
Total: ${newReceipt.total}
Items: ${newReceipt.items.map(item => `${item.name} - ${item.price}`).join(', ')}

EXISTING RECEIPTS:
${relevantReceipts.map((receipt, index) => `
Receipt ${index + 1} (ID: ${receipt.id}):
Store: ${receipt.storeName}
Date: ${receipt.date.toISOString()}
Total: ${receipt.total}
Items: ${receipt.items.map(item => `${item.name} - ${item.price}`).join(', ')}
`).join('\n')}

Analyze if the new receipt is a duplicate of any existing receipt. Consider:
1. Same store and similar date/time
2. Identical or very similar totals
3. Similar items purchased
4. Account for minor OCR errors

Respond in JSON format: {
  "isDuplicate": true,
  "similarity": 0.95,
  "reasoning": "Brief explanation",
  "duplicateReceiptId": 123
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert at detecting duplicate receipts. Analyze receipt data carefully to identify true duplicates while avoiding false positives."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      
      return {
        isDuplicate: Boolean(result.isDuplicate),
        similarity: Math.min(Math.max(result.similarity || 0, 0), 1),
        reasoning: result.reasoning || "AI duplicate detection",
        duplicateReceiptId: result.isDuplicate ? result.duplicateReceiptId : undefined,
      };
    } catch (error) {
      console.error("AI duplicate detection failed:", error);
      return {
        isDuplicate: false,
        similarity: 0,
        reasoning: "Duplicate detection failed"
      };
    }
  }

  /**
   * Smart search through receipts using AI
   */
  async smartSearch(
    query: string,
    receipts: Array<{
      id: number;
      storeName: string;
      items: Array<{name: string, price: string}>;
      total: string;
      category: string;
      notes?: string;
    }>
  ): Promise<Array<{ receiptId: number; relevance: number; reasoning: string }>> {
    try {
      if (receipts.length === 0) return [];

      const prompt = `
Search through receipts based on this query: "${query}"

RECEIPTS:
${receipts.map(receipt => `
Receipt ID: ${receipt.id}
Store: ${receipt.storeName}
Category: ${receipt.category}
Total: ${receipt.total}
Items: ${receipt.items.map(item => item.name).join(', ')}
Notes: ${receipt.notes || 'None'}
`).join('\n')}

Find receipts that match the search query. Consider:
1. Store names
2. Item names and descriptions
3. Categories
4. Notes
5. Semantic similarity (e.g., "coffee" should match "Starbucks", "café")

Return the most relevant receipts ranked by relevance.

Respond in JSON format: {
  "results": [
    {
      "receiptId": 123,
      "relevance": 0.95,
      "reasoning": "Contains coffee items from Starbucks"
    }
  ]
}`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert search assistant. Help users find receipts using natural language queries with semantic understanding."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      
      return Array.isArray(result.results) 
        ? result.results.filter((r: any) => r.relevance > 0.3) // Filter low relevance results
        : [];
    } catch (error) {
      console.error("AI smart search failed:", error);
      return [];
    }
  }

  /**
   * Fallback categorization when AI fails
   */
  private fallbackCategorization(
    storeName: string,
    items: Array<{name: string, price: string}>
  ): ReceiptCategorizationResult {
    const storeNameLower = storeName.toLowerCase();
    const itemNames = items.map(item => item.name.toLowerCase()).join(' ');

    // Simple keyword-based categorization
    if (storeNameLower.includes('grocery') || storeNameLower.includes('supermarket') || 
        storeNameLower.includes('market') || itemNames.includes('milk') || itemNames.includes('bread')) {
      return {
        category: "groceries",
        confidence: 0.7,
        reasoning: "Keyword-based categorization",
        suggestedTags: ["food", "essentials"],
        isTaxDeductible: false
      };
    }

    if (storeNameLower.includes('restaurant') || storeNameLower.includes('café') || 
        storeNameLower.includes('coffee') || storeNameLower.includes('pizza')) {
      return {
        category: "dining",
        confidence: 0.7,
        reasoning: "Keyword-based categorization", 
        suggestedTags: ["food", "dining"],
        isTaxDeductible: false
      };
    }

    if (storeNameLower.includes('gas') || storeNameLower.includes('fuel') || 
        storeNameLower.includes('petrol') || storeNameLower.includes('shell')) {
      return {
        category: "transportation",
        subcategory: "fuel",
        confidence: 0.7,
        reasoning: "Keyword-based categorization",
        suggestedTags: ["fuel", "vehicle"],
        isTaxDeductible: false
      };
    }

    // Default fallback
    return {
      category: "other",
      confidence: 0.3,
      reasoning: "Unable to categorize automatically",
      suggestedTags: [],
      isTaxDeductible: false
    };
  }
}

export const aiCategorizationService = new AICategorizationService();